// Marketing images from the raw captures (run by scripts/marketing-shots.mjs as an Electron app; never on its own).
// Everything is drawn on a canvas in a hidden window: no image library, no system dependency but Electron itself.
// Fonts: Outfit (site/assets/fonts, the site's headline font) for the Store headlines, Segoe UI Variable for the lines
// under them (Windows 10 and 11 have it; Segoe UI otherwise).
// Env: MKT_RAW (the captures: <raw>/<lang>/*.png and scenes.json), MKT_DEST (where the images go, repo layout;
// default the repo itself), MKT_LANGS (en,pt,es).
// Writes, for every language: store/screenshots[/pt-BR|/es]/0N-*.png (1920x1080). From English only: the website
// images in site/assets/img (home and JSON-LD screenshots) and site/assets/img/pages (cropped from the Store images,
// same crops, sizes and phone fades as before), and the README images in
// docs/readme. Prints every file with its size in bytes.
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const RAW = process.env.MKT_RAW;
const DEST = process.env.MKT_DEST || ROOT;
const LANGS = (process.env.MKT_LANGS || 'en,pt,es').split(',').filter((l) => ['en', 'pt', 'es'].includes(l));

// Headlines and the line under them, per screenshot (store/README.md lists the scenes). Plain voice, no dashes.
const COPY = {
  en: [
    ['The world clock Windows should have shipped with.', 'See who’s awake anywhere, at a glance. Completely free, open source, no strings attached.'],
    ['Easy on the eyes after dark', 'Light, dark or follow Windows. Free and open source, with no ads, no account and no telemetry.'],
    ['Convert any time in one step', 'Type 16:30 in New York and every clock follows, with +1 day and a moon where people are asleep.'],
    ['Find the hours that work for everyone', 'Working hours for each city, with the hours everyone shares highlighted.'],
    ['The whole world, live', 'Day and night on a world map, as it happens, with every city on your list.'],
    ['Fits any corner of your screen', 'Strip, compact or vertical. Pin it above your other windows, or snap it into place on Windows 11.'],
  ],
  pt: [
    ['O relógio mundial que já devia vir no Windows.', 'Bata o olho e veja quem está acordado em qualquer canto do mundo. Grátis de verdade, código aberto, sem pegadinha.'],
    ['Não cansa a vista à noite', 'Tema claro, escuro ou igual ao do Windows. Grátis e de código aberto, sem anúncios, sem cadastro e sem telemetria.'],
    ['Converta qualquer horário num instante', 'Digite 16:30 em Nova York e todos os relógios acompanham, com +1 dia e uma lua onde o pessoal está dormindo.'],
    ['Encontre o horário que serve para todos', 'O expediente de cada cidade, com as horas em comum em destaque.'],
    ['O mundo inteiro, ao vivo', 'O dia e a noite num mapa-múndi, em tempo real, com todas as cidades da sua lista.'],
    ['Cabe em qualquer canto da tela', 'Em faixa, compacto ou vertical. Fixe por cima das outras janelas ou encaixe com os layouts de ajuste do Windows 11.'],
  ],
  es: [
    ['El reloj mundial que le faltaba a Windows.', 'Mira de un vistazo quién está despierto en cualquier parte del mundo. Gratis de verdad, de código abierto y sin letra pequeña.'],
    ['Cómodo para la vista de noche', 'Tema claro, oscuro o el de Windows. Gratis y de código abierto, sin anuncios, sin cuenta y sin telemetría.'],
    ['Convierte cualquier hora al instante', 'Escribe 16:30 en Nueva York y todos los relojes se ajustan, con +1 día y una luna donde probablemente están durmiendo.'],
    ['Encuentra la hora ideal para todos', 'El horario laboral de cada ciudad, con las horas en común resaltadas.'],
    ['El mundo entero, en vivo', 'El día y la noche en un mapa mundial, en tiempo real, con todas las ciudades de tu lista.'],
    ['Cabe en cualquier rincón de la pantalla', 'Franja, compacto o vertical. Fíjalo encima de todo o acomódalo con los diseños de ajuste de Windows 11.'],
  ],
};
const STORE_DIR = { en: 'store/screenshots', pt: 'store/screenshots/pt-BR', es: 'store/screenshots/es' };

// ---------- the page side: drawing on canvases (runs in the hidden window) ----------
function page() {
  const W = 1920, H = 1080;
  const IMG = {};
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const load = (url) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
  // A window capture: the app's own drop shadow falls inside the transparent window at its rounded corners (a faint
  // tint, alpha under 45, strongest at the bottom corners); on a backdrop that reads as square corners, so those
  // pixels are cleared. The window itself is opaque, apart from its anti-aliased edge.
  window.__addImage = async (name, url, clean) => {
    let im = await load(url);
    if (clean) {
      const c = canvas(im.naturalWidth, im.naturalHeight), ctx = c.getContext('2d');
      ctx.drawImage(im, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) if (p[i + 3] < 48) p[i + 3] = 0;
      ctx.putImageData(d, 0, 0);
      im = await load(c.toDataURL('image/png'));
    }
    IMG[name] = im;
    return [im.naturalWidth, im.naturalHeight];
  };
  window.__font = async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const f = new FontFace('Outfit', bin.buffer, { weight: '150 600' });
    document.fonts.add(await f.load());
    await document.fonts.load('500 64px Outfit');
    await document.fonts.load('400 30px "Segoe UI Variable Text"');
  };
  const SUB_FONT = '"Segoe UI Variable Text", "Segoe UI", sans-serif';

  const THEMES = {
    light: { base: [234, 240, 250], blooms: [[0.18, 0.15, 0.55, [160, 188, 246]], [0.85, 0.2, 0.5, [205, 190, 244]], [0.7, 0.95, 0.6, [248, 218, 200]], [0.1, 0.9, 0.45, [182, 222, 240]]],
      head: 'rgb(15,23,42)', sub: 'rgb(71,85,105)', shadow: 0.28 },
    dark: { base: [9, 13, 27], blooms: [[0.15, 0.1, 0.6, [30, 58, 138]], [0.88, 0.25, 0.5, [76, 29, 149]], [0.65, 1.0, 0.6, [14, 90, 120]], [0.05, 0.95, 0.4, [40, 30, 90]]],
      head: 'rgb(241,245,249)', sub: 'rgb(165,180,204)', shadow: 0.55 },
  };
  // A soft backdrop: colour blooms on a small grid, scaled up, blurred, then a faint grain (seeded) so it never bands.
  const backdrops = {};
  function backdrop(theme) {
    if (backdrops[theme]) return backdrops[theme];
    const t = THEMES[theme], sw = W / 8, sh = H / 8;
    const small = canvas(sw, sh), sx = small.getContext('2d'), d = sx.createImageData(sw, sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let c = t.base.slice();
      for (const [cx, cy, r, col] of t.blooms) {
        const dist = Math.sqrt(((x / sw - cx) * 1.6) ** 2 + (y / sh - cy) ** 2);
        const a = Math.max(0, Math.min(1, 1 - dist / r)) ** 2 * 0.75;
        c = c.map((v, i) => v * (1 - a) + col[i] * a);
      }
      const o = (y * sw + x) * 4; d.data[o] = c[0]; d.data[o + 1] = c[1]; d.data[o + 2] = c[2]; d.data[o + 3] = 255;
    }
    sx.putImageData(d, 0, 0);
    const pad = 80, big = canvas(W + pad * 2, H + pad * 2), bx = big.getContext('2d');
    bx.imageSmoothingQuality = 'high';
    bx.drawImage(small, 0, 0, W + pad * 2, H + pad * 2);
    const c = canvas(W, H), cx = c.getContext('2d');
    cx.filter = 'blur(24px)';
    cx.drawImage(big, -pad, -pad);
    cx.filter = 'none';
    const img = cx.getImageData(0, 0, W, H);
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < img.data.length; i += 4) {
      const n = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()) * 1.6;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    cx.putImageData(img, 0, 0);
    return (backdrops[theme] = c);
  }
  // A window capture with a soft shadow; on a dark backdrop a faint light edge so a dark window still reads.
  function drawWin(ctx, img, x, y, w, h, strength, outline) {
    if (outline) {
      const s = canvas(w, h), sc = s.getContext('2d');
      sc.drawImage(img, 0, 0, w, h);
      sc.globalCompositeOperation = 'source-in';
      sc.fillStyle = '#fff';
      sc.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = 0.2;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(s, x + dx, y + dy);
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${strength})`;
    ctx.shadowBlur = 68;
    ctx.shadowOffsetY = 26;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }
  function wrap(ctx, s, maxw) {
    const words = s.split(' '), lines = [];
    let cur = '';
    for (const wd of words) { const t = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(t).width <= maxw || !cur) cur = t; else { lines.push(cur); cur = wd; } }
    lines.push(cur);
    if (lines.length === 2) { // balance two lines so the second is not a lone word
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (m <= maxw && (!best || m < best[0])) best = [m, [a, b]];
      }
      if (best) return best[1];
    }
    return lines;
  }
  const headFont = (px) => `500 ${px}px Outfit`;
  // Headline and line, centred over one window (strip, converter, planner, map).
  function centered(theme, img, head, sub, winW) {
    const t = THEMES[theme], c = canvas(W, H), ctx = c.getContext('2d');
    ctx.drawImage(backdrop(theme), 0, 0);
    const winH = Math.round(img.naturalHeight * winW / img.naturalWidth);
    ctx.font = headFont(66); ctx.letterSpacing = '-1.2px';
    const hl = wrap(ctx, head, 1640);
    ctx.font = `400 30px ${SUB_FONT}`; ctx.letterSpacing = '0px';
    const sl = wrap(ctx, sub, 1500);
    const group = hl.length * 80 + 22 + sl.length * 42 + 60 + winH;
    let y = Math.round((H - group) / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = t.head; ctx.font = headFont(66); ctx.letterSpacing = '-1.2px';
    for (const l of hl) { ctx.fillText(l, W / 2, y); y += 80; }
    y += 22;
    ctx.fillStyle = t.sub; ctx.font = `400 30px ${SUB_FONT}`; ctx.letterSpacing = '0px';
    for (const l of sl) { ctx.fillText(l, W / 2, y); y += 42; }
    y += 60;
    const x = Math.round((W - winW) / 2);
    drawWin(ctx, img, x, y, winW, winH, t.shadow, theme === 'dark');
    return { c, rect: { x, y, w: winW, h: winH } };
  }
  // The vertical layout, dark and light side by side on the right, words on the left.
  function verticalPair(dark, light, head, sub) {
    const t = THEMES.light, c = canvas(W, H), ctx = c.getContext('2d');
    ctx.drawImage(backdrop('light'), 0, 0);
    const h = 880, wd = Math.round(dark.naturalWidth * h / dark.naturalHeight), wl = Math.round(light.naturalWidth * h / light.naturalHeight);
    const x2 = W - 130 - wl, x1 = x2 - 56 - wd, y = Math.round((H - h) / 2) - 10;
    drawWin(ctx, dark, x1, y, wd, h, t.shadow + 0.1, false);
    drawWin(ctx, light, x2, y, wl, h, t.shadow, false);
    const left = 130, maxw = x1 - left - 80;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = headFont(62); ctx.letterSpacing = '-1.2px';
    const hl = wrap(ctx, head, maxw);
    ctx.font = `400 30px ${SUB_FONT}`; ctx.letterSpacing = '0px';
    const sl = wrap(ctx, sub, maxw);
    let ty = Math.round((H - (hl.length * 76 + 28 + sl.length * 44)) / 2) - 10;
    ctx.fillStyle = t.head; ctx.font = headFont(62); ctx.letterSpacing = '-1.2px';
    for (const l of hl) { ctx.fillText(l, left, ty); ty += 76; }
    ty += 28;
    ctx.fillStyle = t.sub; ctx.font = `400 30px ${SUB_FONT}`; ctx.letterSpacing = '0px';
    for (const l of sl) { ctx.fillText(l, left, ty); ty += 44; }
    return { c, rects: [{ x: x1, y, w: wd, h }, { x: x2, y, w: wl, h }] };
  }
  // helpers for the derived images
  function crop(src, x, y, w, h, outW = w, outH = h) {
    const c = canvas(outW, outH), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, x, y, w, h, 0, 0, outW, outH);
    return c;
  }
  // Resize in halving steps (sharper than one big drawImage step when shrinking a lot).
  function resize(src, outW, outH, fill) {
    let cur = src, cw = src.width || src.naturalWidth, ch = src.height || src.naturalHeight;
    while (cw / 2 >= outW && ch / 2 >= outH) {
      const n = canvas(Math.round(cw / 2), Math.round(ch / 2)), nx = n.getContext('2d');
      nx.imageSmoothingQuality = 'high'; nx.drawImage(cur, 0, 0, n.width, n.height);
      cur = n; cw = n.width; ch = n.height;
    }
    const c = canvas(outW, outH), ctx = c.getContext('2d');
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, outW, outH); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, outW, outH);
    return c;
  }
  // the colour of a capture's top bar (a flat fill for the corners of images that had square corners before)
  function barColour(img) {
    const c = canvas(1, 1), ctx = c.getContext('2d');
    ctx.drawImage(img, Math.round(img.naturalWidth / 2), 3, 1, 1, 0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${d[0]},${d[1]},${d[2]})`;
  }
  // an older image's alpha channel on a new picture (the phone crops fade out at one side)
  function withAlpha(pic, maskImg) {
    const c = canvas(pic.width, pic.height), ctx = c.getContext('2d');
    ctx.drawImage(maskImg, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(pic, 0, 0);
    return c;
  }
  // WebP from the canvas encoder; PNG as raw RGBA, which the main side packs (tighter than the canvas encoder)
  const encode = (c, type, q) => {
    if (type === 'image/png') {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let s = '';
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
      return Promise.resolve('raw:' + btoa(s));
    }
    return new Promise((resolve) => c.toBlob((b) => {
      const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(b);
    }, type, q));
  };

  const OUT = [];
  window.__out = OUT;
  window.__render = async (job) => {
    const put = async (p, c, type = 'image/png', q) => { OUT.push({ path: p, b64: await encode(c, type, q), w: c.width, h: c.height }); };
    const WEBP = 0.86, PAGES = 0.8; // the page images are bigger (1800px) and sit on the site at half size on phones
    const store = {};
    for (const lang of job.langs) {
      const g = (n) => IMG[`${lang}/${n}`];
      const cp = job.copy[lang], dir = job.storeDir[lang];
      const s = [
        centered('light', g('strip-light'), ...cp[0], 1720),
        centered('dark', g('strip-dark'), ...cp[1], 1720),
        centered('light', g('converter'), ...cp[2], 1720),
        centered('light', g('planner-light'), ...cp[3], 1720),
        centered('dark', g('map'), ...cp[4], 1540),
        verticalPair(g('vertical-dark'), g('vertical-light'), ...cp[5]),
      ];
      const names = ['01-strip-light', '02-strip-dark', '03-converter', '04-meeting-planner', '05-world-map', '06-vertical-layout'];
      for (let i = 0; i < 6; i++) await put(`${dir}/${names[i]}.png`, s[i].c);
      store[lang] = s;
    }
    if (!store.en || !job.site) return OUT.length;
    const [s1, s2, s3, s4, s5, s6] = store.en;
    const P = 'site/assets/img/pages';
    // website pages: the same crops of the English Store images as before (window plus its shadow)
    const stripCrop = (s) => crop(s.c, s.rect.x - 40, s.rect.y - 38, 1800, 394);
    const pages = [
      ['strip-light', stripCrop(s1), [900, 197], [0, 900]],
      ['strip-dark', stripCrop(s2), [900, 197], [0, 900]],
      ['converter', stripCrop(s3), [900, 197], [840, 960]],
      ['planner', crop(s4.c, s4.rect.x - 40, s4.rect.y - 38, 1800, 439), [900, 219], null],
      ['map', crop(s5.c, s5.rect.x - 40, s5.rect.y - 40, 1620, 740), [810, 370], [610, 1010]],
    ];
    const v = s6.rects, vx = Math.round((v[0].x + v[1].x + v[1].w) / 2 - 503);
    pages.push(['vertical', crop(s6.c, vx, v[0].y - 40, 1006, 960), [503, 480], null]);
    for (const [name, full, half, phone] of pages) {
      await put(`${P}/${name}.webp`, full, 'image/webp', PAGES);
      await put(`${P}/${name}-half.webp`, resize(full, half[0], half[1]), 'image/webp', PAGES);
      if (phone) {
        const mask = IMG[`mask/${name}-phone`];
        await put(`${P}/${name}-phone.webp`, withAlpha(crop(full, phone[0], 0, phone[1], full.height), mask), 'image/webp', PAGES);
      }
    }
    // planner with the best hours (no backdrop, like before)
    const pb = IMG['en/planner-best'];
    const pbFull = resize(pb, 1800, 422, barColour(pb));
    await put(`${P}/planner-best.webp`, pbFull, 'image/webp', PAGES);
    await put(`${P}/planner-best-half.webp`, resize(pbFull, 900, 211), 'image/webp', PAGES);
    // home page and JSON-LD screenshots (site/assets/img)
    const A = 'site/assets/img';
    await put(`${A}/strip-light.webp`, resize(IMG['en/site-strip-light'], 1331, 289), 'image/webp', WEBP);
    await put(`${A}/strip-dark.webp`, resize(IMG['en/site-strip-dark'], 1331, 289), 'image/webp', WEBP);
    const sc = IMG['en/site-converter'];
    await put(`${A}/converter.webp`, resize(sc, 1330, 288, barColour(sc)), 'image/webp', WEBP);
    const sv = IMG['en/site-vertical'];
    {
      const k = Math.min(342 / sv.naturalWidth, 680 / sv.naturalHeight);
      const c = canvas(342, 680), ctx = c.getContext('2d');
      ctx.fillStyle = barColour(sv); ctx.fillRect(0, 0, 342, 680);
      const r = resize(sv, Math.round(sv.naturalWidth * k), Math.round(sv.naturalHeight * k));
      ctx.drawImage(r, Math.round((342 - r.width) / 2), 0);
      await put(`${A}/vertical.webp`, c, 'image/webp', WEBP);
    }
    {
      const st = IMG['en/site-settings'], m = job.site.settings, k = st.naturalWidth / m.css.width;
      const b = m.box, pad = 20;
      const bx = (b.left - pad) * k, by = (b.top - 6) * k, bw = (b.right - b.left + pad * 2) * k, bh = (b.bottom - b.top + 12) * k;
      const s = Math.min(660 / bw, 714 / bh);
      const c = canvas(660, 714), ctx = c.getContext('2d');
      ctx.fillStyle = barColour(st); ctx.fillRect(0, 0, 660, 714);
      const part = resize(crop(st, bx, by, bw, bh), Math.round(bw * s), Math.round(bh * s));
      ctx.drawImage(part, Math.round((660 - part.width) / 2), Math.round((714 - part.height) / 2));
      await put(`${A}/settings.webp`, c, 'image/webp', WEBP);
    }
    // Open Graph cards (og.png, og-pt.png, og-es.png) are drawn by cloudflare/og/render.mjs, not here.
    // README: the strip crops of the Store images (same crop as before), and the converter, planner and map
    const widget = (s) => crop(s.c, s.rect.x - 40, s.rect.y - 27, 1800, 380, 1600, 338);
    await put('docs/readme/widget-light.png', widget(s1));
    await put('docs/readme/widget-dark.png', widget(s2));
    for (const th of ['light', 'dark']) {
      for (const [n, w, h] of [['converter', 1200, 260], ['planner', 1200, 271], ['map', 1200, 373]]) {
        const im = IMG[`en/readme-${n}-${th}`];
        await put(`docs/readme/${n}-${th}.png`, resize(im, w, h, barColour(im)));
      }
    }
    return OUT.length;
  };
}

// ---------- the main side ----------
// PNG from raw RGBA: RGB when every pixel is opaque, each row with the filter that gives the smallest sum (the
// usual heuristic), deflate at level 9.
const zlib = require('zlib');
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  let opaque = true;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { opaque = false; break; }
  const bpp = opaque ? 3 : 4, stride = w * bpp;
  const px = opaque ? Buffer.alloc(w * h * 3) : rgba;
  if (opaque) for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { px[j] = rgba[i]; px[j + 1] = rgba[i + 1]; px[j + 2] = rgba[i + 2]; }
  const out = Buffer.alloc((stride + 1) * h), cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = cand[f];
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const v = px[row + x], a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
        const r = (f === 0 ? v : f === 1 ? v - a : f === 2 ? v - b : f === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, c)) & 255;
        o[x] = r; sum += r < 128 ? r : 256 - r;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mime = (f) => (f.endsWith('.webp') ? 'image/webp' : 'image/png');
const dataUrl = (f) => `data:${mime(f)};base64,${fs.readFileSync(f).toString('base64')}`;

app.whenReady().then(async () => {
  let code = 0;
  try {
    if (!RAW || !fs.existsSync(RAW)) throw new Error(`MKT_RAW not found: ${RAW}`);
    const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { sandbox: true, contextIsolation: true } });
    await win.loadURL('data:text/html;charset=utf-8,<!doctype html><meta charset="utf-8"><title>compose</title><body></body>');
    await win.webContents.executeJavaScript(`(${page.toString()})(); true`);
    await win.webContents.executeJavaScript(`window.__font(${JSON.stringify(fs.readFileSync(path.join(ROOT, 'site/assets/fonts/outfit-var.woff2')).toString('base64'))})`);
    const add = (name, file, clean = false) => win.webContents.executeJavaScript(`window.__addImage(${JSON.stringify(name)}, ${JSON.stringify(dataUrl(file))}, ${clean})`);
    const STORE_SCENES = ['strip-light', 'strip-dark', 'converter', 'planner-light', 'map', 'vertical-dark', 'vertical-light'];
    const SITE_SCENES = ['planner-best', 'site-strip-light', 'site-strip-dark', 'site-converter', 'site-vertical', 'site-settings', 'og-strip',
      ...['light', 'dark'].flatMap((t) => [`readme-converter-${t}`, `readme-planner-${t}`, `readme-map-${t}`])];
    for (const lang of LANGS) for (const s of STORE_SCENES) await add(`${lang}/${s}`, path.join(RAW, lang, `${s}.png`), true);
    let site = null;
    const enMeta = path.join(RAW, 'en', 'scenes.json');
    if (LANGS.includes('en') && SITE_SCENES.every((s) => fs.existsSync(path.join(RAW, 'en', `${s}.png`)))) {
      for (const s of SITE_SCENES) await add(`en/${s}`, path.join(RAW, 'en', `${s}.png`), true);
      // the phone crops keep the fade they had (their alpha)
      for (const n of ['strip-light', 'strip-dark', 'converter', 'map']) await add(`mask/${n}-phone`, path.join(ROOT, 'site/assets/img/pages', `${n}-phone.webp`));
      site = { settings: JSON.parse(fs.readFileSync(enMeta, 'utf8')).scenes['site-settings'] };
    } else if (LANGS.includes('en')) console.log('compose: English website scenes missing, so only the Store images are made');
    const n = await win.webContents.executeJavaScript(`window.__render(${JSON.stringify({ langs: LANGS, copy: COPY, storeDir: STORE_DIR, site })})`);
    for (let i = 0; i < n; i++) {
      const o = await win.webContents.executeJavaScript(`window.__out[${i}]`);
      const file = path.join(DEST, o.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, o.b64.startsWith('raw:') ? encodePng(o.w, o.h, Buffer.from(o.b64.slice(4), 'base64')) : Buffer.from(o.b64, 'base64'));
      console.log(`${o.path} ${o.w}x${o.h} ${fs.statSync(file).size}`);
    }
  } catch (e) {
    console.error(`compose: ${e.stack || e}`);
    code = 1;
  }
  app.exit(code);
});
