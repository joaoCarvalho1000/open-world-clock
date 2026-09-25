// Contrast of the design tokens in src/renderer/style.css (WCAG 2.2: 4.5:1 text, 3:1 focus rings and control edges).
// Tokens are read from the light (:root) and dark (:root[data-theme="dark"]) blocks, so a token change that breaks a
// pair fails here. Colors with alpha are composited over the solid background, as the page draws them.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'renderer', 'style.css'), 'utf8');

// Declarations of every top-level block whose selector is exactly `sel`, merged in source order.
function tokens(sel) {
  const out = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim() !== sel) continue;
    for (const d of m[2].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0 && d.trim().startsWith('--')) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
}
const LIGHT = tokens(':root');
const DARK = { ...LIGHT, ...tokens(':root[data-theme="dark"], :root[data-theme="system"].sys-dark') };

// '#fff' | 'oklch(L C H [/ a])' | 'var(--x)' -> { rgb (gamma sRGB 0..1), a }
function color(theme, v) {
  v = v.trim();
  const ref = /^var\((--[\w-]+)(?:,[^)]*)?\)$/.exec(v);
  if (ref) return color(theme, theme[ref[1]]);
  if (v === '#fff') return { rgb: [1, 1, 1], a: 1 };
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*(?:([\d.]+)|var\([^)]*\)))?\s*\)$/.exec(v);
  assert.ok(m, `unparsed color ${v}`);
  const [L, C, h] = [+m[1], +m[2], +m[3]];
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s];
  const gam = (x) => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
  return { rgb: lin.map(gam), a: m[4] !== undefined ? +m[4] : (m[0].includes('/') ? 0.86 : 1) };
}
const over = (top, base) => top.rgb.map((v, i) => v * top.a + base[i] * (1 - top.a));
const lum = (rgb) => { const [r, g, b] = rgb.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// fg drawn on `layers` (bottom first: the solid background, then any translucent fills)
function contrast(theme, fg, ...layers) {
  let base = color(theme, 'var(--bg-solid)').rgb;
  for (const l of layers) base = over(color(theme, l), base);
  return ratio(over(color(theme, fg), base), base);
}

const PAIRS = [
  // [label, fg, layers, minimum, themes]
  ['text on filled accent (pressed date chip, Save, map source pill)', 'var(--on-fill)', ['var(--fill-accent)'], 4.5],
  ['Home badge text', 'var(--on-accent)', ['var(--accent-ink)'], 4.5],
  ['accent-ink text on accent-soft (pills, pressed toggles)', 'var(--accent-ink)', ['var(--accent-soft)'], 4.5, ['light']],
  ['accent text on accent-soft (dark pills, pressed toggles)', 'var(--accent)', ['var(--accent-soft)'], 4.5, ['dark']],
  ['danger text (Remove, errors)', 'var(--danger)', [], 4.5],
  ['text on danger (Quit hover)', 'var(--on-danger)', ['var(--danger)'], 4.5],
  ['planner off-hours digits', 'var(--plan-off-fg)', ['var(--plan-off)'], 4.5],
  ['planner working-hours digits', 'var(--plan-work-fg)', ['var(--plan-work)'], 4.5],
  ['planner night digits', 'var(--plan-night-fg)', ['var(--plan-night)'], 4.5],
  ['planner night digits on a stripe', 'var(--plan-night-fg)', ['var(--plan-night)', 'var(--plan-stripe)'], 4.5],
  ['secondary text and placeholders on a field', 'var(--fg-2)', ['var(--field)'], 4.5],
  ['focus ring (accent on the bg-solid halo)', 'var(--accent)', [], 3],
  ['control edge on the background', 'var(--ctl-edge)', [], 3],
  ['control edge on a settings group', 'var(--ctl-edge)', ['var(--group)'], 3],
];

for (const [themeName, theme] of [['light', LIGHT], ['dark', DARK]]) {
  test(`token contrast (${themeName})`, () => {
    const fails = [];
    for (const [label, fg, layers, min, only] of PAIRS) {
      if (only && !only.includes(themeName)) continue;
      const r = contrast(theme, fg, ...layers);
      if (r < min) fails.push(`${label}: ${r.toFixed(2)} < ${min}`);
    }
    assert.deepStrictEqual(fails, []);
  });
}

// Non-text contrast (WCAG 1.4.11, 3:1): marks drawn with an opacity. The opacity is read from the CSS rule itself, so
// lowering it again fails here. Cards sit on the window tint; the card background (--day) is composited over it.
const timeCss = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'renderer', 'motion', 'time.css'), 'utf8');
function ruleOpacity(text, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(text);
  assert.ok(m, `rule ${selector} not found`);
  const o = /(?:^|;)\s*opacity:\s*([\d.]+)/.exec(m[1]);
  assert.ok(o, `rule ${selector} has no opacity`);
  return +o[1];
}
function contrastA(theme, fg, alpha, ...layers) {
  let base = color(theme, 'var(--bg-solid)').rgb;
  for (const l of layers) base = over(color(theme, l), base);
  const f = color(theme, fg);
  return ratio(over({ rgb: f.rgb, a: f.a * alpha }, base), base);
}
const bestBorder = /\.plan-best\s*\{[^}]*border:\s*1\.5px dashed (var\(--accent\))/.exec(css);
const NONTEXT = [
  // [label, fg, opacity, layers]
  ['card options button (.more)', 'var(--day-fg-2)', ruleOpacity(css, '.more'), ['var(--tint)', 'var(--day)']],
  ['day line working-hours band (.arc-work)', 'var(--day-fg-2)', ruleOpacity(css, '.arc-work'), ['var(--tint)', 'var(--day)']],
  ['day line band while working (.card.working .arc-work)', 'var(--accent)', ruleOpacity(timeCss, '.card.working .arc-work'), ['var(--tint)', 'var(--day)']],
  ['planner Best band border (.plan-best)', bestBorder ? bestBorder[1] : 'var(--accent)', bestBorder ? 1 : 0, ['var(--tint)']],
];
for (const [themeName, theme] of [['light', LIGHT], ['dark', DARK]]) {
  test(`non-text contrast at 3:1 (${themeName})`, () => {
    const fails = [];
    for (const [label, fg, alpha, layers] of NONTEXT) {
      const r = contrastA(theme, fg, alpha, ...layers);
      if (r < 3) fails.push(`${label}: ${r.toFixed(2)} < 3 (opacity ${alpha})`);
    }
    assert.deepStrictEqual(fails, []);
  });
}

test('audit token values', () => {
  assert.match(LIGHT['--accent-ink'], /^oklch\(0\.46 /);
  assert.match(LIGHT['--danger'], /^oklch\(0\.52 /);
  assert.match(LIGHT['--plan-off-fg'], /^oklch\(0\.42 /);
  assert.match(LIGHT['--plan-work-fg'], /^oklch\(0\.38 /);
  assert.strictEqual(DARK['--on-fill'], 'oklch(0.2 0.04 262)');
});
