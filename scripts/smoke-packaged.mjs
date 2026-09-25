// Packaged-build smoke test: `node scripts/smoke-packaged.mjs [path-to-win-unpacked] [folder name]`.
// npm test drives the unfused dev binary, so it cannot catch problems that only exist in a packaged build
// (fuses, asar integrity, missing files). This copies dist/win-unpacked to a temp folder, renames the exe so it
// never collides with an installed "Open World Clock.exe", starts it with a throwaway profile and Chromium's
// remote debugging port, and checks through the DevTools protocol that the renderer really loaded: the page
// URL is the app's page (app://owc/index.html), the clock cards exist, and no load error happened. Exits non-zero on failure.
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, renameSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const src = path.resolve(process.argv[2] || 'dist/win-unpacked');
const exeName = 'Open World Clock.exe';
if (!existsSync(path.join(src, exeName))) { console.error(`No ${exeName} in ${src}. Build first: npx electron-builder --win dir --x64`); process.exit(2); }

const work = mkdtempSync(path.join(tmpdir(), 'owc-smoke-'));
// Optional second argument: the folder name the copy runs from (for example 'sq[1] pct% João' or 'a%41b').
const app = path.join(work, process.argv[3] || 'app');
const profile = path.join(work, 'profile');
cpSync(src, app, { recursive: true });
renameSync(path.join(app, exeName), path.join(app, 'owc-smoke.exe'));
const port = 9300 + Math.floor(Math.random() * 500);
const child = spawn(path.join(app, 'owc-smoke.exe'), [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let result = { ok: false, reason: 'timeout waiting for the page' };
try {
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    let targets;
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { continue; }
    const page = targets.find((t) => t.type === 'page');
    if (!page) continue;
    if (!/^app:\/\/owc\/index\.html/.test(page.url)) { result = { ok: false, reason: `unexpected page url ${page.url}` }; continue; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const evaluate = (expression) => new Promise((res) => {
      const id = Math.floor(Math.random() * 1e9);
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === id) res(d.result && d.result.result && d.result.result.value); };
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    let info = null;
    for (let j = 0; j < 20; j++) {
      info = await evaluate(`({ ready: document.readyState, cards: document.querySelectorAll('.card[data-zone]').length, title: document.title, hm: (document.querySelector('.card .hm') || {}).textContent || '' })`);
      if (info && info.cards > 0 && /\d/.test(info.hm)) break;
      await sleep(500);
    }
    // IPC works both ways from the page (main trusts app://owc/index.html): a settings change comes back saved.
    const roundTrip = info && info.cards > 0 ? await evaluate('window.wc.setSettings({ showSeconds: false }).then((s) => !!s && s.showSeconds === false)') : false;
    ws.close();
    result = info && info.cards > 0 && /\d/.test(info.hm) && roundTrip === true
      ? { ok: true, reason: `renderer loaded: ${info.cards} cards, first time ${info.hm}, title "${info.title}", setSettings round trip ok` }
      : { ok: false, reason: `page loaded but no clock rendered or IPC refused: ${JSON.stringify({ info, roundTrip })}` };
    break;
  }
} finally {
  child.kill();
  await sleep(800);
  try { rmSync(work, { recursive: true, force: true }); } catch {}
}
console.log(`${result.ok ? 'PASS' : 'FAIL'} packaged smoke: ${result.reason}`);
process.exit(result.ok ? 0 : 1);
