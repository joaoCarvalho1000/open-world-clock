#!/usr/bin/env node
// Regenerates every Open World Clock icon, tile and logo raster from the SVG masters in build/logo/.
//
//   node scripts/build-icons.mjs           write outputs (files whose bytes are unchanged are left alone)
//   node scripts/build-icons.mjs --check   verify outputs are up to date, write nothing, exit 1 if not
//
// Rendering uses @resvg/resvg-js from build/icons-tools/node_modules (run `npm install` in build/icons-tools
// if it is missing). PNG and ICO files are encoded here with node:zlib, so output is byte-identical between runs.
// See build/logo/README.md for the list of outputs and the sizing rules.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(ROOT, 'build', 'logo');
const CHECK = process.argv.includes('--check');

const require = createRequire(import.meta.url);
let Resvg;
try {
  ({ Resvg } = require(path.join(ROOT, 'build', 'icons-tools', 'node_modules', '@resvg', 'resvg-js')));
} catch {
  console.error('Missing @resvg/resvg-js. Run `npm install` in build/icons-tools, then try again.');
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------
// Colors and framing

// Windows tile plate: must equal package.json build.appx.backgroundColor so tiles, plated icons and the
// manifest background are one color. Also the README badge label color.
const APPX_PLATE = readAppxBackground() ?? '#16192a';
const SKY = '#ecf5fd'; // site background, site.webmanifest background_color
const MASKABLE_PLATE = APPX_PLATE; // dark navy; keeps the #152d59 night half visible against the plate
const IOS_SKY_TOP = '#f6fbff';
const IOS_SKY_BOTTOM = '#dcebfb';

// Mark geometry (SPEC.md): 1024 viewBox, disc radius 420 at (512, 512), clear space x = 40 units.
const DISC = 840;
const VB_MASTER = [0, 0, 1024, 1024]; // the master framing (disc fills 82 percent)
const VB_ICON = [52, 52, 920, 920]; // exactly 1x clear space around the disc (disc fills 91.3 percent)
const vbForDisc = (fraction) => {
  const side = DISC / fraction;
  return [512 - side / 2, 512 - side / 2, side, side];
};

// Tinted iOS icon: grayscale remap of the palette (brighter = more tint).
const TINT_MAP = { '#2f6fe0': '#8c8c8c', '#152d59': '#383838', '#e4f2ff': '#e0e0e0', '#e6bc68': '#ffffff' };

// Windows app list target sizes (Microsoft "Construct your Windows app's icon").
const TARGET_SIZES = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256];
// Win32 ICO sizes: the Windows 11 list plus 128.
const APP_ICO_SIZES = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256];

// ---------------------------------------------------------------------------------------------------------------
// SVG helpers

const masters = new Map();
function master(name) {
  if (!masters.has(name)) masters.set(name, fs.readFileSync(path.join(LOGO, `${name}.svg`), 'utf8'));
  return masters.get(name);
}
function innerOf(svg) {
  const open = svg.indexOf('>', svg.indexOf('<svg')) + 1;
  return svg.slice(open, svg.lastIndexOf('</svg>')).replace(/<title>[\s\S]*?<\/title>/, '');
}
function viewBoxOf(svg) {
  return /viewBox="([^"]+)"/.exec(svg)[1].trim().split(/[\s,]+/).map(Number);
}
const n = (v) => String(Math.round(v * 10000) / 10000);
const vbAttr = (vb) => vb.map(n).join(' ');

// The mark (or any master) as a nested <svg> placed in a box. `vb` selects the framing; `recolor` maps hex colors.
function place(name, x, y, w, h, vb, recolor) {
  let body = innerOf(master(name));
  if (recolor) for (const [from, to] of Object.entries(recolor)) body = body.split(from).join(to);
  return `<svg x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" viewBox="${vbAttr(vb ?? viewBoxOf(master(name)))}">${body}</svg>`;
}
function doc(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}
const rect = (w, h, fill) => `<rect width="${w}" height="${h}" fill="${fill}"/>`;
const markName = (px) => (px <= 32 ? 'mark-small' : 'mark'); // SPEC: compact source at 16 to 32 px

// A square icon: optional plate, mark centered with the given framing.
function squareIcon(size, { vb = VB_ICON, plate = null, recolor = null, source = markName(size) } = {}) {
  return doc(size, size, (plate ? rect(size, size, plate) : '') + place(source, 0, 0, size, size, vb, recolor));
}
// A tile: plate, mark disc of `disc` px centered.
function tile(w, h, disc, plate) {
  const side = (disc * 1024) / DISC;
  return doc(w, h, rect(w, h, plate) + place(markName(disc), (w - side) / 2, (h - side) / 2, side, side, VB_MASTER));
}

function render(svg) {
  const png = new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng();
  return decodePng(png);
}

// ---------------------------------------------------------------------------------------------------------------
// PNG decode and deterministic encode (8-bit RGB or RGBA, non-interlaced)

const CRC_TABLE = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf) {
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12];
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 2 && type !== 6)) throw new Error(`Unsupported PNG (type ${type}, depth ${depth})`);
  const ch = type === 6 ? 4 : 3, stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const data = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const base = y * (stride + 1), filter = raw[base];
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = raw[base + 1 + i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      data[o] = cur[s]; data[o + 1] = cur[s + 1]; data[o + 2] = cur[s + 2]; data[o + 3] = ch === 4 ? cur[s + 3] : 255;
    }
    [prev, cur] = [cur, prev];
  }
  return { w, h, data };
}

function chunk(kind, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(kind, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

// alpha: true writes RGBA; false writes RGB and requires every pixel to be opaque.
function encodePng(img, alpha) {
  const ch = alpha ? 4 : 3, stride = img.w * ch;
  const out = Buffer.alloc((stride + 1) * img.h);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  const trial = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4, o = x * ch;
      if (!alpha && img.data[s + 3] !== 255) throw new Error('encodePng: opaque output has transparent pixels');
      cur[o] = img.data[s]; cur[o + 1] = img.data[s + 1]; cur[o + 2] = img.data[s + 2];
      if (alpha) cur[o + 3] = img.data[s + 3];
    }
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const t = trial[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
        const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (cur[i] - p) & 255;
        t[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    out[y * (stride + 1)] = best;
    trial[best].copy(out, y * (stride + 1) + 1);
    [prev, cur] = [cur, prev];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(out, { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const isOpaque = (img) => { for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 255) return false; return true; };
const png = (svg) => { const img = render(svg); return encodePng(img, !isOpaque(img)); };

// ICO with PNG-compressed entries (Windows Vista and later, all current browsers).
function ico(sizes, svgFor) {
  const images = sizes.map((s) => ({ s, data: encodePng(render(svgFor(s)), true) }));
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ s, data }, i) => {
    const o = 6 + 16 * i;
    head[o] = s >= 256 ? 0 : s; head[o + 1] = s >= 256 ? 0 : s; head[o + 2] = 0; head[o + 3] = 0;
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

// ---------------------------------------------------------------------------------------------------------------
// Optimized SVG copies for the website

function optimizeSvg(name, { viewBox } = {}) {
  let s = master(name);
  s = s.replace(/<title>[\s\S]*?<\/title>/, '<title>Open World Clock</title>');
  s = s.replace(/ d="([^"]*)"/g, (_, d) => ` d="${d.replace(/-?\d*\.\d+/g, (v) => String(Math.round(Number(v) * 10) / 10))}"`);
  s = s.replace(/="(-?\d*\.\d+)"/g, (_, v) => `="${Math.round(Number(v) * 100) / 100}"`);
  if (viewBox) s = s.replace(/viewBox="[^"]*"/, `viewBox="${vbAttr(viewBox)}"`);
  return Buffer.from(s.trim() + '\n', 'utf8');
}

// ---------------------------------------------------------------------------------------------------------------
// og.png: replace the icon left of "Open World Clock" (a 52 px box at 72,58), keep every other pixel.

function patchOg(file) {
  const img = decodePng(fs.readFileSync(file));
  if (img.w !== 1200 || img.h !== 630) throw new Error('og.png: unexpected size');
  // Region to rebuild. Columns x0 - 1 and x1 are plain sky on every row, so refilling the region is stable
  // across runs: the result depends only on pixels outside it.
  const x0 = 64, y0 = 50, x1 = 132, y1 = 118;
  const px = (x, y) => (y * img.w + x) * 4;
  for (let y = y0; y < y1; y++) {
    const L = px(x0 - 1, y), R = px(x1, y);
    for (let x = x0; x < x1; x++) {
      const t = (x - (x0 - 1)) / (x1 - (x0 - 1)), o = px(x, y);
      for (let c = 0; c < 3; c++) img.data[o + c] = Math.round(img.data[L + c] * (1 - t) + img.data[R + c] * t);
    }
  }
  const disc = 52, cx = 97.5 - x0, cy = 83.5 - y0, side = (disc * VB_ICON[2]) / DISC;
  const mark = render(doc(x1 - x0, y1 - y0, place('mark', cx - side / 2, cy - side / 2, side, side, VB_ICON)));
  for (let y = 0; y < mark.h; y++) {
    for (let x = 0; x < mark.w; x++) {
      const s = (y * mark.w + x) * 4, a = mark.data[s + 3] / 255;
      if (!a) continue;
      const o = px(x0 + x, y0 + y);
      for (let c = 0; c < 3; c++) img.data[o + c] = Math.round(mark.data[s + c] * a + img.data[o + c] * (1 - a));
    }
  }
  return encodePng(img, false);
}

// ---------------------------------------------------------------------------------------------------------------
// Outputs

function readAppxBackground() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const color = pkg?.build?.appx?.backgroundColor;
    return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
  } catch {
    return null;
  }
}

const outputs = [];
const out = (rel, make) => outputs.push({ rel, make });

// Windows app (NSIS, portable, window and tray icon)
out('build/icon.ico', () => ico(APP_ICO_SIZES, (s) => squareIcon(s)));
out('build/icon.png', () => png(squareIcon(512)));

// Windows Store package (build/appx). Plated assets are opaque on the manifest background color; the
// altform-unplated and altform-lightunplated target sizes are transparent for the taskbar and Start.
const plated44 = (s) => squareIcon(s, { vb: VB_MASTER, plate: APPX_PLATE });
out('build/appx/Square44x44Logo.png', () => png(plated44(44)));
out('build/appx/Square150x150Logo.png', () => png(tile(150, 150, 76, APPX_PLATE)));
out('build/appx/Wide310x150Logo.png', () => png(tile(310, 150, 76, APPX_PLATE)));
out('build/appx/StoreLogo.png', () => png(squareIcon(50, { vb: VB_MASTER, plate: APPX_PLATE })));
out('build/appx/SplashScreen.png', () => {
  const w = 420, h = (w * 256) / 1820;
  return png(doc(620, 300, rect(620, 300, APPX_PLATE) + place('lockup-horizontal-on-dark', (620 - w) / 2, (300 - h) / 2, w, h)));
});
// No .scale-NNN variants on purpose: electron-builder's priconfig.xml splits scale candidates into
// resources.scale-NNN.pri files, which a single (non-bundle) .appx does not load. Target sizes stay in
// resources.pri, so they are the variants that actually reach the taskbar and Start.
for (const s of TARGET_SIZES) {
  out(`build/appx/Square44x44Logo.targetsize-${s}.png`, () => png(plated44(s)));
  out(`build/appx/Square44x44Logo.targetsize-${s}_altform-unplated.png`, () => png(squareIcon(s)));
  out(`build/appx/Square44x44Logo.targetsize-${s}_altform-lightunplated.png`, () => png(squareIcon(s)));
}

// Website
out('site/favicon.ico', () => ico([16, 32, 48], (s) => squareIcon(s)));
out('site/assets/icon-32.png', () => png(squareIcon(32)));
out('site/assets/icon-180.png', () => png(squareIcon(180, { vb: vbForDisc(0.78), plate: SKY })));
out('site/assets/icon-512.png', () => png(squareIcon(512)));
out('site/assets/icon-512-maskable.png', () => png(squareIcon(512, { vb: vbForDisc(0.7), plate: MASKABLE_PLATE })));
out('site/assets/logo.svg', () => optimizeSvg('mark'));
out('site/assets/logo-small.svg', () => optimizeSvg('mark-small', { viewBox: VB_ICON }));
// og.png, og-pt.png and og-es.png are drawn whole (logo included) by cloudflare/og/render.mjs from og-card.html,
// so this script no longer patches og.png; patchOg stays for one-off repairs.

// iPhone app icon (Contents.json: universal 1024, dark and tinted appearances)
const IOS = 'apple/WorldClock/Assets.xcassets/AppIcon.appiconset';
const iosVb = vbForDisc(0.78);
out(`${IOS}/AppIcon-1024.png`, () => {
  const grad = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${IOS_SKY_TOP}"/><stop offset="1" stop-color="${IOS_SKY_BOTTOM}"/></linearGradient>`;
  return encodePng(render(doc(1024, 1024, rect(1024, 1024, 'url(#sky)') + place('mark', 0, 0, 1024, 1024, iosVb), grad)), false);
});
out(`${IOS}/AppIcon-1024-dark.png`, () => encodePng(render(squareIcon(1024, { vb: iosVb })), true));
out(`${IOS}/AppIcon-1024-tinted.png`, () => encodePng(render(squareIcon(1024, { vb: iosVb, plate: '#000000', recolor: TINT_MAP })), false));

// README lockups (transparent; light theme uses the dark wordmark)
out('docs/readme/logo-lockup-light.png', () => png(doc(1365, 192, place('lockup-horizontal', 0, 0, 1365, 192))));
out('docs/readme/logo-lockup-dark.png', () => png(doc(1365, 192, place('lockup-horizontal-on-dark', 0, 0, 1365, 192))));

// ---------------------------------------------------------------------------------------------------------------

let changed = 0;
for (const { rel, make } of outputs) {
  const file = path.join(ROOT, rel);
  const data = make();
  const same = fs.existsSync(file) && fs.readFileSync(file).equals(data);
  if (!same) {
    changed++;
    if (!CHECK) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
    }
  }
  console.log(`${same ? 'unchanged' : CHECK ? 'outdated ' : 'written  '}  ${rel}  (${data.length} bytes)`);
}
console.log(`${outputs.length} outputs, ${changed} ${CHECK ? 'outdated' : 'written'}.`);
if (CHECK && changed) process.exit(1);
