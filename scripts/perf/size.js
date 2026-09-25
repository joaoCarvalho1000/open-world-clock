#!/usr/bin/env node
// Open World Clock size report: what the downloads and the installed app are made of.
//
//   node scripts/perf/size.js                    reads dist/ (build first: npm run dist / dist:store)
//   node scripts/perf/size.js --dist <dir> --unpacked <dir> --no-compress --json <file>
//
// Reports: artifact sizes (setup, portable, appx, blockmap), the unpacked app folder by category and largest files,
// app.asar contents by package, duplicate files (same bytes), and per-file deflate vs LZMA-class (brotli) sizes,
// which is what separates the appx (zip/deflate per file) from the NSIS exe (7z LZMA2, solid).
// The installers' inner listing uses 7za from electron-builder's cache when it is there.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const o = { dist: path.join(ROOT, 'dist'), unpacked: null, compress: true, json: null, electron: path.join(ROOT, 'node_modules', 'electron', 'dist') };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], next = () => process.argv[++i];
  if (a === '--dist') o.dist = path.resolve(next());
  else if (a === '--unpacked') o.unpacked = path.resolve(next());
  else if (a === '--no-compress') o.compress = false;
  else if (a === '--json') o.json = path.resolve(next());
  else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 10).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(0); }
  else throw new Error('unknown option ' + a);
}
o.unpacked = o.unpacked || path.join(o.dist, 'win-unpacked');

const MB = (b) => (b / 1048576).toFixed(2); // MiB, what Explorer labels "MB"
const KB = (b) => (b / 1024).toFixed(1);
const L = [];
const out = { artifacts: [], unpacked: null, asar: null, duplicates: [], compress: [] };

function walk(dir, base = dir, list = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, list);
    else list.push({ rel: path.relative(base, p).replace(/\\/g, '/'), abs: p, size: fs.statSync(p).size });
  }
  return list;
}

// ---------- asar ----------
function readAsar(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const headerPickle = head.readUInt32LE(4);
    const strLen = head.readUInt32LE(12);
    const hbuf = Buffer.alloc(strLen);
    fs.readSync(fd, hbuf, 0, strLen, 16);
    const header = JSON.parse(hbuf.toString('utf8'));
    const base = 8 + headerPickle;
    const files = [];
    const rec = (node, prefix) => {
      for (const [name, v] of Object.entries(node.files || {})) {
        const p = prefix ? prefix + '/' + name : name;
        if (v.files) rec(v, p);
        else if (!v.link) files.push({ rel: p, size: v.size || 0, offset: v.unpacked ? null : Number(v.offset), unpacked: !!v.unpacked });
      }
    };
    rec(header, '');
    const read = (f) => { if (f.offset == null) return null; const b = Buffer.alloc(f.size); fs.readSync(fd, b, 0, f.size, base + f.offset); return b; };
    for (const f of files) f.hash = f.size ? crypto.createHash('sha1').update(read(f) || Buffer.alloc(0)).digest('hex') : 'empty';
    return { files, headerBytes: base };
  } finally { fs.closeSync(fd); }
}

// ---------- zip central directory (appx/msix) ----------
function readZip(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 70000);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('no zip end record');
    let count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
    if (cdOff === 0xffffffff || count === 0xffff) {
      // zip64 end of central directory locator sits right before the EOCD
      const loc = eocd - 20;
      if (tail.readUInt32LE(loc) === 0x07064b50) {
        const z64off = Number(tail.readBigUInt64LE(loc + 8));
        const z = Buffer.alloc(56); fs.readSync(fd, z, 0, 56, z64off);
        count = Number(z.readBigUInt64LE(32)); cdSize = Number(z.readBigUInt64LE(40)); cdOff = Number(z.readBigUInt64LE(48));
      }
    }
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const entries = [];
    let p = 0;
    for (let n = 0; n < count && p < cd.length; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const method = cd.readUInt16LE(p + 10);
      let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      const name = cd.toString('utf8', p + 46, p + 46 + nl);
      let x = p + 46 + nl; const xe = x + xl;
      while (x + 4 <= xe) {
        const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2);
        if (id === 1) { let q = x + 4; if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; } if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); } }
        x += 4 + len;
      }
      entries.push({ name: decodeURIComponent(name), method, csize, usize });
      p = xe + cl;
    }
    return entries;
  } finally { fs.closeSync(fd); }
}

function find7za() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache');
  try {
    for (const d of fs.readdirSync(base).filter((x) => /^7zip/i.test(x))) {
      for (const sub of fs.readdirSync(path.join(base, d))) {
        const p = path.join(base, d, sub, 'bin', '7za.exe');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* no cache */ }
  return null;
}

const CATEGORY = [
  [/^.*\.exe$/i, 'exe (Chromium + Node + V8, statically linked)'],
  [/^resources\/app\.asar$/, 'app.asar (the app itself)'],
  [/^resources\//, 'resources/ (other)'],
  [/^locales\//, 'locales (Chromium UI strings)'],
  [/^(dxcompiler|dxil)\.dll$/i, 'DXC shader compiler (Dawn/WebGPU; the GPU process maps it at startup)'],
  [/^d3dcompiler_47\.dll$/i, 'd3dcompiler_47 (ANGLE D3D11 shaders)'],
  [/^(vk_swiftshader\.dll|vk_swiftshader_icd\.json|vulkan-1\.dll)$/i, 'SwiftShader + Vulkan loader (software GPU fallback)'],
  [/^ffmpeg\.dll$/i, 'ffmpeg (media codecs)'],
  [/^icudtl\.dat$/i, 'ICU data (Intl, time zones)'],
  [/\.(pak)$/i, 'Chromium resource paks'],
  [/(snapshot_blob|v8_context_snapshot)\.bin$/i, 'V8 snapshots'],
  [/^LICENSE/i, 'licenses'],
];
const categoryOf = (rel) => (CATEGORY.find(([re]) => re.test(rel)) || [null, 'other'])[1];

// ---------- 1. artifacts ----------
L.push('# Open World Clock size report', '', `dist: ${o.dist}`, '');
const z7 = find7za();
if (fs.existsSync(o.dist)) {
  const arts = fs.readdirSync(o.dist).filter((f) => /\.(exe|appx|msix|appxbundle|msixbundle|blockmap|zip|7z)$/i.test(f));
  L.push('## Artifacts', '', '| file | MB |', '|---|---|');
  for (const f of arts) {
    const size = fs.statSync(path.join(o.dist, f)).size;
    out.artifacts.push({ file: f, size });
    L.push(`| ${f} | ${MB(size)} |`);
  }
  for (const f of arts.filter((x) => /\.(appx|msix)$/i.test(x))) {
    const entries = readZip(path.join(o.dist, f));
    const tot = entries.reduce((s, e) => s + e.csize, 0), totU = entries.reduce((s, e) => s + e.usize, 0);
    L.push('', `### ${f}: zip, each file deflated on its own (${MB(totU)} MB -> ${MB(tot)} MB)`, '', '| entry | MB | deflated MB | ratio |', '|---|---|---|---|');
    for (const e of entries.sort((a, b) => b.csize - a.csize).slice(0, 14)) L.push(`| ${e.name} | ${MB(e.usize)} | ${MB(e.csize)} | ${(e.csize / Math.max(1, e.usize) * 100).toFixed(0)}% |`);
    out.artifacts.find((a) => a.file === f).entries = entries;
  }
  if (z7) {
    for (const f of arts.filter((x) => /\.exe$/i.test(x))) {
      try {
        const txt = execFileSync(z7, ['l', path.join(o.dist, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const m = txt.match(/Method = (.*)/), s = txt.match(/Solid = (.*)/);
        const files = [...txt.matchAll(/^\s+\S*\s+([.A-Z]{5})\s+(\d+)\s+(\d*)\s+(.+)$/gm)].filter((x) => !x[1].startsWith('D')).map((x) => ({ name: x[4].trim(), size: +x[2] }));
        const summary = txt.match(/^\s+(\d+)\s+(\d+)\s+(\d+) files/m);
        L.push('', `### ${f}: 7z ${m ? m[1] : '?'}${s && s[1].trim() === '+' ? ', solid' : ''}: ${files.length} files, ${summary ? MB(+summary[1]) + ' MB -> ' + MB(+summary[2]) + ' MB' : ''}`);
        const extra = files.filter((x) => !fs.existsSync(path.join(o.unpacked, x.name)));
        if (extra.length) L.push(`Files not in win-unpacked: ${extra.map((x) => `${x.name} (${KB(x.size)} KB)`).join(', ')}`);
        out.artifacts.find((a) => a.file === f).inner = files;
      } catch (e) { L.push(`(7za could not list ${f}: ${e.message.split('\n')[0]})`); }
    }
  } else L.push('', '(7za not found in the electron-builder cache: skipping the installer inner listing)');
}

// ---------- 2. unpacked ----------
const target = fs.existsSync(o.unpacked) ? o.unpacked : o.electron;
const files = walk(target);
const total = files.reduce((s, f) => s + f.size, 0);
out.unpacked = { dir: target, total, files: files.map(({ rel, size }) => ({ rel, size })) };
L.push('', `## Installed app folder: ${MB(total)} MB in ${files.length} files`, `(${target})`, '', '| category | MB | share |', '|---|---|---|');
const cats = {};
for (const f of files) { const c = categoryOf(f.rel); cats[c] = (cats[c] || 0) + f.size; }
for (const [c, s] of Object.entries(cats).sort((a, b) => b[1] - a[1])) L.push(`| ${c} | ${MB(s)} | ${(s / total * 100).toFixed(1)}% |`);
L.push('', '| largest files | MB |', '|---|---|');
for (const f of [...files].sort((a, b) => b.size - a.size).slice(0, 15)) L.push(`| ${f.rel} | ${MB(f.size)} |`);
const locales = files.filter((f) => f.rel.startsWith('locales/'));
L.push('', `Locales shipped: ${locales.map((f) => f.rel.slice(8)).join(', ')} (${MB(locales.reduce((s, f) => s + f.size, 0))} MB)`);
if (fs.existsSync(o.electron) && target !== o.electron) {
  const full = walk(o.electron).filter((f) => f.rel.startsWith('locales/'));
  L.push(`Stock Electron ships ${full.length} locales (${MB(full.reduce((s, f) => s + f.size, 0))} MB): electronLanguages already trims them.`);
}

// ---------- 3. asar ----------
const asarPath = path.join(target, 'resources', 'app.asar');
let asar = null;
if (fs.existsSync(asarPath)) {
  asar = readAsar(asarPath);
  const aTot = asar.files.reduce((s, f) => s + f.size, 0);
  const groups = {};
  for (const f of asar.files) {
    const m = f.rel.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/);
    const g = m ? 'node_modules/' + m[1] : f.rel.split('/').slice(0, f.rel.startsWith('src/renderer/') ? 3 : 2).join('/');
    groups[g] = groups[g] || { size: 0, n: 0 };
    groups[g].size += f.size; groups[g].n++;
  }
  const nm = asar.files.filter((f) => f.rel.startsWith('node_modules/'));
  out.asar = { total: aTot, files: asar.files.map(({ rel, size }) => ({ rel, size })), groups };
  L.push('', `## app.asar: ${MB(fs.statSync(asarPath).size)} MB (${asar.files.length} files, stored uncompressed)`, '', '| group | KB | files |', '|---|---|---|');
  for (const [g, v] of Object.entries(groups).sort((a, b) => b[1].size - a[1].size).slice(0, 25)) L.push(`| ${g} | ${KB(v.size)} | ${v.n} |`);
  L.push('', `node_modules inside the asar: ${MB(nm.reduce((s, f) => s + f.size, 0))} MB in ${nm.length} files (${[...new Set(nm.map((f) => f.rel.split('/')[1].startsWith('@') ? f.rel.split('/').slice(1, 3).join('/') : f.rel.split('/')[1]))].length} packages).`);
  L.push('', '| largest asar files | KB |', '|---|---|');
  for (const f of [...asar.files].sort((a, b) => b.size - a.size).slice(0, 12)) L.push(`| ${f.rel} | ${KB(f.size)} |`);
}

// ---------- 4. duplicates ----------
const byHash = new Map();
const add = (hash, where, size) => { if (!size) return; const g = byHash.get(hash) || { size, where: [] }; g.where.push(where); byHash.set(hash, g); };
for (const f of files) {
  if (f.size > 64 * 1048576) continue; // the exe is unique; skip hashing it
  add(crypto.createHash('sha1').update(fs.readFileSync(f.abs)).digest('hex'), f.rel, f.size);
}
if (asar) for (const f of asar.files) add(f.hash, 'app.asar/' + f.rel, f.size);
const dups = [...byHash.values()].filter((g) => g.where.length > 1).sort((a, b) => b.size * (b.where.length - 1) - a.size * (a.where.length - 1));
out.duplicates = dups;
L.push('', `## Duplicate files (identical bytes): ${dups.length} groups, ${KB(dups.reduce((s, g) => s + g.size * (g.where.length - 1), 0))} KB redundant`, '');
for (const g of dups.slice(0, 20)) L.push(`- ${KB(g.size)} KB x${g.where.length}: ${g.where.join(', ')}`);

// ---------- 5. compression ----------
if (o.compress) {
  L.push('', '## Per-file compression: deflate (appx) vs brotli q9 (per-file stand-in for LZMA; the real solid 7z does better still)', '', '| file | MB | deflate MB | brotli MB | deflate - brotli MB |', '|---|---|---|---|---|');
  let td = 0, tb = 0;
  const rows = [];
  for (const f of files) {
    const buf = fs.readFileSync(f.abs);
    const d = zlib.deflateRawSync(buf, { level: 6 }).length;
    const b = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length;
    td += d; tb += b;
    rows.push({ rel: f.rel, size: f.size, deflate: d, brotli: b });
  }
  out.compress = rows;
  for (const r of rows.sort((a, b) => (b.deflate - b.brotli) - (a.deflate - a.brotli)).slice(0, 12)) L.push(`| ${r.rel} | ${MB(r.size)} | ${MB(r.deflate)} | ${MB(r.brotli)} | ${MB(r.deflate - r.brotli)} |`);
  L.push(`| **total** | ${MB(total)} | ${MB(td)} | ${MB(tb)} | ${MB(td - tb)} |`);
  L.push('', 'Deflate here (level 6) is close to what makeappx produces; the exe installers use LZMA2 over one solid block, which also finds redundancy across files.');
  // What-if: files that could be dropped or shrunk (estimated from the deflate/brotli sizes above).
  const est = (re) => rows.filter((r) => re.test(r.rel)).reduce((s, r) => ({ raw: s.raw + r.size, d: s.d + r.deflate, b: s.b + r.brotli }), { raw: 0, d: 0, b: 0 });
  const ideas = [
    ['dxcompiler.dll + dxil.dll (Dawn/WebGPU shader compiler; the page uses no WebGPU)', /^(dxcompiler|dxil)\.dll$/i],
    ['vk_swiftshader.dll + icd + vulkan-1.dll (software Vulkan/WebGL fallback)', /^(vk_swiftshader\.dll|vk_swiftshader_icd\.json|vulkan-1\.dll)$/i],
    ['locales/es-419.pak (es already shipped)', /^locales\/es-419\.pak$/],
    ['chrome_200_percent.pak (2x UI assets for Chromium internal pages)', /^chrome_200_percent\.pak$/],
  ];
  L.push('', '## What-if: removable candidates (raw / appx deflate / exe LZMA-class, MB)', '', '| candidate | raw | appx | exe |', '|---|---|---|---|');
  for (const [label, re] of ideas) { const e = est(re); if (e.raw) L.push(`| ${label} | ${MB(e.raw)} | ${MB(e.d)} | ${MB(e.b)} |`); }
  if (asar) {
    const nmBytes = asar.files.filter((f) => f.rel.startsWith('node_modules/')).reduce((s, f) => s + f.size, 0);
    L.push(`| node_modules in app.asar (electron-updater and deps; updates are off) | ${MB(nmBytes)} | ~${MB(nmBytes * 0.28)} | ~${MB(nmBytes * 0.22)} |`);
  }
}

console.log(L.join('\n'));
if (o.json) fs.writeFileSync(o.json, JSON.stringify(out, null, 1));
