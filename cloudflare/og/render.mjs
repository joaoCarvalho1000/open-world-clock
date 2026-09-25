// Renders cloudflare/og/og-card.html to site/assets/og.png (1200x630, truecolour PNG) with the installed Chrome or
// Edge in headless mode, using a throwaway browser profile. No dependencies.
// Run from anywhere: node cloudflare/og/render.mjs [out.png] [pt|es]
//   node cloudflare/og/render.mjs                                   English, site/assets/og.png
//   node cloudflare/og/render.mjs site/assets/og-pt.png pt          Portuguese card (and es for Spanish)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] || join(HERE, '..', '..', 'site', 'assets', 'og.png'));
const LANG = process.argv[3];
const CARD = pathToFileURL(join(HERE, 'og-card.html')).href + (LANG ? '?lang=' + encodeURIComponent(LANG) : '');

const pf = process.env.PROGRAMFILES || 'C:\\Program Files', pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
const local = process.env.LOCALAPPDATA || '';
const browser = [process.env.CHROME_PATH,
  join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
if (!browser) { console.error('No Chrome or Edge found; set CHROME_PATH.'); process.exit(1); }

const profile = mkdtempSync(join(tmpdir(), 'owc-og-'));
try {
  execFileSync(browser, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--user-data-dir=' + profile, '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630',
    '--virtual-time-budget=3000', '--screenshot=' + OUT, CARD], { stdio: 'ignore' });
} finally {
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold a file for a moment */ }
}

// check what came out: size, colour type (2 = truecolour, 3 = palette) and file size
const png = readFileSync(OUT);
const w = png.readUInt32BE(16), h = png.readUInt32BE(20), colorType = png[25];
const kb = Math.round(png.length / 1024);
console.log(`${OUT}: ${w}x${h}, colour type ${colorType}${colorType === 2 ? ' (truecolour)' : ''}, ${kb} KB`);
if (w !== 1200 || h !== 630 || colorType !== 2 || kb > 300) { console.error('Expected 1200x630 truecolour under 300 KB.'); process.exit(1); }
