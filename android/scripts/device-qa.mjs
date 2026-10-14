#!/usr/bin/env node
// Deterministic device QA. Drives a connected emulator or phone over adb, captures a screenshot
// and a UI dump for every combination asked for, runs assertions that cannot be argued with, and
// writes a contact sheet so a person can look at the result in one page.
//
// No model is involved. Every verdict here is a string comparison or an arithmetic one.
//
//   node scripts/device-qa.mjs --serial emulator-5556
//   node scripts/device-qa.mjs --locales EN,PT --themes LIGHT --screens clocks,settings
//   node scripts/device-qa.mjs --home Asia/Tokyo        # set the reference city first
//   node scripts/device-qa.mjs --out ../output/android/qa-20261014
//
// Exits non-zero if any assertion fails, so CI can gate on it.

import { execFileSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ADB = process.env.ADB_PATH ||
  join(process.env.LOCALAPPDATA || process.env.HOME || '', 'Android/Sdk/platform-tools/adb.exe')
const PKG = 'io.joao.worldclock'
const ACTIVITY = `${PKG}/.MainActivity`

// Nav bar hit targets, as a fraction of screen width, so this survives a different density.
const NAV = { clocks: 0.093, convert: 0.296, plan: 0.5, widgets: 0.704, settings: 0.907 }
const NAV_Y = 0.947

// The label each tab must show, per locale. A locale that renders the wrong word fails.
const NAV_LABELS = {
  EN: ['Clocks', 'Convert', 'Plan', 'Widgets', 'Settings'],
  PT: ['Relógios', 'Converter', 'Planejar', 'Widgets', 'Ajustes'],
  ES: ['Relojes', 'Convertir', 'Planificar', 'Widgets', 'Ajustes'],
}

const args = parseArgs(process.argv.slice(2))
const serial = args.serial || firstDevice()
const locales = (args.locales || 'EN,PT,ES').split(',')
const themes = (args.themes || 'LIGHT,DARK').split(',')
const screens = (args.screens || 'clocks,convert,plan,widgets,settings').split(',')
const outDir = resolve(args.out || join(process.cwd(), 'build', 'device-qa'))

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else { out[key] = next; i++ }
  }
  return out
}

function adb(cmdArgs, { binary = false } = {}) {
  // MSYS on Windows rewrites a leading /sdcard into a Windows path and breaks every device call.
  const env = { ...process.env, MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*' }
  return execFileSync(ADB, ['-s', serial, ...cmdArgs], {
    env, maxBuffer: 64 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8',
  })
}

function firstDevice() {
  const out = execFileSync(ADB, ['devices'], { encoding: 'utf8' })
  const line = out.split('\n').slice(1).find(l => l.trim().endsWith('device'))
  if (!line) throw new Error('no device. Start an emulator or pass --serial')
  return line.split('\t')[0].trim()
}

function screenSize() {
  const m = /(\d+)x(\d+)/.exec(adb(['shell', 'wm', 'size']))
  if (!m) throw new Error('could not read screen size')
  return { w: +m[1], h: +m[2] }
}

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// ---------------------------------------------------------------- device state

/** Writes the app's own settings file, so a run starts from a known state every time. */
function applySettings({ locale, theme, home, cities }) {
  const list = (cities || ['America/Sao_Paulo', 'Europe/Lisbon', 'America/New_York', 'Asia/Tokyo'])
    .map(z => `{"zoneId":"${z}","label":"","workStart":9,"workEnd":17,"workDays":[1,2,3,4,5]}`)
  const settings = {
    version: 1, use24Hour: true, theme, language: locale,
    ...(home ? { homeZone: home } : {}),
  }
  const json = JSON.stringify(settings).slice(0, -1) + `,"cities":[${list.join(',')}]}`
  const xml = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n<string name="settings">${
    json.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string>\n</map>\n`
  const tmp = join(outDir, '_settings.xml')
  writeFileSync(tmp, xml)
  adb(['shell', 'am', 'force-stop', PKG])
  adb(['push', tmp, '/data/local/tmp/world_clock.xml'])
  // run-as works because this is a debug build; it is the only way in without root.
  adb(['shell', 'run-as', PKG, 'cp', '/data/local/tmp/world_clock.xml', 'shared_prefs/world_clock.xml'])
  adb(['shell', 'am', 'start', '-n', ACTIVITY])
  sleep(5000)
}

function goToScreen(name, size) {
  const x = Math.round(NAV[name] * size.w)
  const y = Math.round(NAV_Y * size.h)
  // The first tap after a cold start is routinely swallowed while the shell settles, so tap twice.
  adb(['shell', 'input', 'tap', String(x), String(y)]); sleep(1200)
  adb(['shell', 'input', 'tap', String(x), String(y)]); sleep(2500)
}

function dumpTexts() {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/qa.xml'])
  const xml = adb(['shell', 'cat', '/sdcard/qa.xml'])
  const seen = []
  for (const node of xml.match(/<node[^>]*>/g) || []) {
    const t = /text="([^"]*)"/.exec(node)
    const d = /content-desc="([^"]*)"/.exec(node)
    const v = ((t && t[1]) || (d && d[1]) || '').trim()
    if (v && !seen.includes(v)) seen.push(v)
  }
  return seen
}

function screenshot(file) {
  adb(['shell', 'screencap', '-p', '/sdcard/qa.png'])
  adb(['pull', '/sdcard/qa.png', file])
}

// ---------------------------------------------------------------- png + contrast

/** Minimal PNG reader: 8-bit RGB/RGBA, non-interlaced, which is what screencap produces. */
export function readPng(file) {
  const buf = readFileSync(file)
  let pos = 8, width = 0, height = 0, colour = 0, idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error('only 8-bit PNG supported')
      colour = data[9]
      if (data[12] !== 0) throw new Error('interlaced PNG not supported')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const channels = colour === 6 ? 4 : colour === 2 ? 3 : null
  if (!channels) throw new Error(`unsupported PNG colour type ${colour}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let rp = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++]
    const line = raw.subarray(rp, rp + stride); rp += stride
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[i] = v & 0xff
    }
  }
  return { width, height, channels, data: out }
}

const srgb = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const relLum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)

/**
 * How far the most legible ink stands off the dominant surface, as WCAG defines contrast.
 *
 * This deliberately measures the BEST contrast in the region, not the worst, because without
 * glyph segmentation the worst is always some antialiased edge pixel. What it is built to catch
 * is a collapse: a region where nothing at all stands off the background, which is what a widget
 * painting day ink onto a night sky looks like.
 *
 * Ink may be darker or lighter than the surface, so both extremes are tried. An earlier version
 * assumed dark ink on a light surface and duly reported 1.07:1 for every dark-theme screen, which
 * was the measurement inverting, not the app failing.
 */
export function contrastIn(png, box) {
  const [x0, y0, x1, y1] = box
  const lums = []
  for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x++) {
      const i = y * png.width * png.channels + x * png.channels
      lums.push([relLum(png.data[i], png.data[i + 1], png.data[i + 2]),
        [png.data[i], png.data[i + 1], png.data[i + 2]]])
    }
  }
  if (lums.length < 100) return null
  lums.sort((a, b) => a[0] - b[0])
  const at = p => lums[Math.min(lums.length - 1, Math.floor(lums.length * p))]
  const surface = at(0.5)                       // the dominant colour of the region
  const ratio = (a, b) => {
    const hi = Math.max(a[0], b[0]), lo = Math.min(a[0], b[0])
    return (hi + 0.05) / (lo + 0.05)
  }
  const darkInk = at(0.02), lightInk = at(0.98)
  const best = ratio(darkInk, surface) >= ratio(lightInk, surface) ? darkInk : lightInk
  return { ratio: ratio(best, surface), ink: best[1], surface: surface[1] }
}

// ---------------------------------------------------------------- the run

import { pathToFileURL } from 'node:url'
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {

  mkdirSync(join(outDir, 'shots'), { recursive: true })
  mkdirSync(join(outDir, 'dumps'), { recursive: true })

  const size = screenSize()
  const failures = []
  const rows = []

  console.log(`device ${serial}  ${size.w}x${size.h}`)
  console.log(`capturing ${locales.length} locales x ${themes.length} themes x ${screens.length} screens\n`)

  for (const locale of locales) {
    for (const theme of themes) {
      applySettings({ locale, theme, home: args.home === true ? null : args.home })
      for (const screen of screens) {
        goToScreen(screen, size)
        const tag = `${locale}_${theme}_${screen}`
        const shot = join(outDir, 'shots', `${tag}.png`)
        const texts = dumpTexts()
        screenshot(shot)
        writeFileSync(join(outDir, 'dumps', `${tag}.txt`), texts.join('\n'))

        // ---- assertions, all deterministic
        const expect = NAV_LABELS[locale] || []
        const missing = expect.filter(l => !texts.includes(l))
        if (missing.length) failures.push(`${tag}: nav labels missing ${JSON.stringify(missing)}`)

        const resourceIds = texts.filter(s => /^[a-z][a-z0-9_]{6,}$/.test(s))
        if (resourceIds.length) failures.push(`${tag}: raw resource id visible ${JSON.stringify(resourceIds.slice(0, 3))}`)

        const crash = texts.filter(s => /isn't responding|keeps stopping|has stopped/i.test(s))
        if (crash.length) failures.push(`${tag}: crash or ANR dialog ${JSON.stringify(crash)}`)

        if (texts.length < 6) failures.push(`${tag}: screen nearly empty, ${texts.length} strings`)

        // ---- contrast over the upper content band, below the status bar and above the nav bar
        let contrast = null
        try {
          const png = readPng(shot)
          contrast = contrastIn(png, [
            Math.round(size.w * 0.05), Math.round(size.h * 0.10),
            Math.round(size.w * 0.95), Math.round(size.h * 0.55),
          ])
          if (contrast && contrast.ratio < 3.0) {
            failures.push(`${tag}: contrast ${contrast.ratio.toFixed(2)}:1 is below the WCAG AA large-text floor of 3.0`)
          }
        } catch (e) {
          console.log(`  (contrast skipped for ${tag}: ${e.message})`)
        }

        rows.push({ tag, locale, theme, screen, strings: texts.length, contrast })
        const c = contrast ? `${contrast.ratio.toFixed(2)}:1` : 'n/a'
        console.log(`  ${tag.padEnd(24)} ${String(texts.length).padStart(3)} strings   contrast ${c}`)
      }
    }
  }

  // ---- home screen widgets, if any of ours are pinned there
  //
  // This is not optional decoration. A widget paints its own surface and its own ink from two
  // different rules, so it can fail contrast while every in-app screen passes. Measuring only the
  // app would have missed a City clock rendering day ink onto a night sky at 1.7:1.
  if (args.widgets !== false && args['no-widgets'] === undefined) {
    // KEYCODE_HOME lands on the launcher's first page, and a pinned widget is routinely on the
    // second. Walk right until ours shows up, or the pages run out.
    adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']); sleep(3000)
    let xml = ''
    for (let page = 0; page < 4; page++) {
      if (page > 0) {
        adb(['shell', 'input', 'swipe', String(Math.round(size.w * 0.83)), String(Math.round(size.h * 0.5)),
          String(Math.round(size.w * 0.18)), String(Math.round(size.h * 0.5)), '300'])
        sleep(2500)
      }
      adb(['shell', 'uiautomator', 'dump', '/sdcard/qa.xml'])
      xml = adb(['shell', 'cat', '/sdcard/qa.xml'])
      if (xml.includes(PKG)) { if (page) console.log(`  (widgets found on launcher page ${page})`); break }
    }
    const boxes = []
    for (const node of xml.match(/<node[^>]*>/g) || []) {
      if (!node.includes(PKG)) continue
      const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node)
      if (!b) continue
      const box = [+b[1], +b[2], +b[3], +b[4]]
      const area = (box[2] - box[0]) * (box[3] - box[1])
      // keep the widget frame itself, not the little text nodes inside it
      if (area > size.w * size.h * 0.02 && !boxes.some(e => e.join() === box.join())) boxes.push(box)
    }
    // A widget reports its frame and its inner container at similar sizes, which would otherwise
    // raise the same defect twice. Keep only boxes that sit inside no other box.
    const inside = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3]
    for (let i = boxes.length - 1; i >= 0; i--) {
      if (boxes.some((o, j) => j !== i && inside(boxes[i], o))) boxes.splice(i, 1)
    }
    if (!boxes.length) {
      console.log('\nno pinned widgets found on the home screen (skipping widget checks)')
    } else {
      const shot = join(outDir, 'shots', 'HOME_widgets.png')
      screenshot(shot)
      console.log(`\nhome screen: ${boxes.length} pinned widget${boxes.length > 1 ? 's' : ''}`)
      const png = readPng(shot)
      boxes.forEach((box, i) => {
        const c = contrastIn(png, box)
        if (!c) return
        const tag = `widget${i + 1}`
        rows.push({ tag: `HOME_${tag}`, locale: '-', theme: '-', screen: 'widget', strings: 0, contrast: c, img: 'HOME_widgets.png' })
        console.log(`  ${tag} ${JSON.stringify(box)}  contrast ${c.ratio.toFixed(2)}:1`)
        if (c.ratio < 3.0) {
          failures.push(`home screen ${tag} at ${JSON.stringify(box)}: contrast ${c.ratio.toFixed(2)}:1 ` +
            `is below the WCAG AA large-text floor of 3.0 (ink RGB(${c.ink}) on surface RGB(${c.surface}))`)
        }
      })
    }
  }

  // ---- string-count parity across locales, per screen and theme
  for (const screen of screens) {
    for (const theme of themes) {
      const counts = rows.filter(r => r.screen === screen && r.theme === theme)
        .map(r => [r.locale, r.strings])
      const distinct = new Set(counts.map(c => c[1]))
      if (counts.length > 1 && distinct.size > 1) {
        failures.push(`${screen}/${theme}: string count differs across locales ${JSON.stringify(counts)}`)
      }
    }
  }

  // ---- contact sheet, so the run can be reviewed by eye in one page
  const cards = rows.map(r => {
    const c = r.contrast
    const bad = c && c.ratio < 3.0
    return `<figure${bad ? ' class="bad"' : ''}>
      <img src="shots/${r.img || r.tag + '.png'}" alt="${r.tag}" loading="lazy">
      <figcaption><b>${r.tag}</b><br>${r.strings ? r.strings + ' strings' : 'home screen widget'}${
        c ? ` &middot; contrast ${c.ratio.toFixed(2)}:1` : ''}${bad ? ' &middot; BELOW AA' : ''}</figcaption>
    </figure>`
  }).join('\n')

  writeFileSync(join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8">
  <title>Device QA ${new Date().toISOString().slice(0, 10)}</title>
  <style>
   body{font:14px system-ui;margin:24px;background:#faf9f7;color:#1d242c}
   h1{font-size:19px} .meta{color:#56626e;margin-bottom:18px}
   .grid{display:flex;flex-wrap:wrap;gap:18px}
   figure{margin:0;width:230px} img{width:100%;border:1px solid #d6dce2;border-radius:10px;display:block}
   figcaption{font-size:12px;margin-top:6px;color:#56626e}
   .bad img{border-color:#c0392b;border-width:2px} .bad figcaption{color:#c0392b}
   .fail{background:#fdeceb;border-left:3px solid #c0392b;padding:10px 14px;margin:4px 0;font-family:ui-monospace,monospace;font-size:12px}
   .ok{background:#eaf6ed;border-left:3px solid #2e7d4f;padding:10px 14px}
  </style>
  <h1>Device QA</h1>
  <div class="meta">${serial} &middot; ${size.w}x${size.h} &middot; ${rows.length} captures &middot; ${new Date().toISOString()}</div>
  ${failures.length
      ? failures.map(f => `<div class="fail">${f.replace(/</g, '&lt;')}</div>`).join('\n')
      : '<div class="ok">All deterministic checks passed.</div>'}
  <h2 style="font-size:15px;margin-top:26px">Captures</h2>
  <div class="grid">${cards}</div>
  `)

  console.log(`\n${rows.length} captures -> ${outDir}`)
  console.log(`contact sheet: ${join(outDir, 'index.html')}`)
  if (failures.length) {
    console.log(`\n${failures.length} FAILURE${failures.length > 1 ? 'S' : ''}`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log('\nall deterministic checks passed')

}
