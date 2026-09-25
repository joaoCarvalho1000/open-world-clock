// Launches the app with the in-app test suite attached and relays the report. Exit code 1 on any failure.
// `--shots` runs the screenshot harness (test/shots.js) instead and prints where the PNGs went.
// The app runs against a throwaway userData dir (WC_USER_DATA), so the user's real settings are never touched. It can
// run while the installed app is open: main moves userData before requestSingleInstanceLock, and Electron keys that
// lock on the userData folder, so the two never meet. deep.js and shots.js refuse to run without WC_USER_DATA.
// The app's stderr goes to test/deep-stderr.log (git-ignored); its tail is printed when no report was produced.
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const electron = require('electron');

const shots = process.argv.includes('--shots');
const suite = path.resolve(__dirname, shots ? 'shots.js' : 'deep.js');
const shotsDir = process.env.WC_SHOTS_DIR || path.resolve(__dirname, '..', 'dist', 'shots');
const report = shots ? path.join(shotsDir, 'shots.txt') : path.join(__dirname, 'deep.txt');
const stderrLog = path.join(__dirname, shots ? 'shots-stderr.log' : 'deep-stderr.log');

try { fs.unlinkSync(report); } catch {}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-test-'));

let status = 1, stderr = '';
try {
  const r = spawnSync(electron, [path.resolve(__dirname, '..')], {
    env: { ...process.env, WC_USER_DATA: tmp, WC_LANG: 'en', WC_SMOKE: suite, WC_SHOTS_DIR: shotsDir },
    stdio: ['ignore', 'ignore', 'pipe'], timeout: shots ? 240000 : 150000, maxBuffer: 64 * 1024 * 1024,
  });
  status = r.status;
  stderr = r.stderr ? r.stderr.toString('utf8') : '';
  if (r.error) stderr += `\n[run.js] ${r.error.message}`;
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
try { fs.writeFileSync(stderrLog, stderr); } catch {}

const hasReport = fs.existsSync(report);
const text = hasReport ? fs.readFileSync(report, 'utf8') : 'no report produced';
console.log(text);
if (!hasReport) {
  const tail = stderr.trimEnd().split(/\r?\n/).slice(-40).join('\n');
  console.log(`\napp exit status ${status}; last lines of its stderr (${path.relative(process.cwd(), stderrLog)}):\n${tail || '(empty)'}`);
}
if (shots) process.exit(status === 0 ? 0 : 1);
process.exit(status === 0 && /, 0 failed/.test(text) ? 0 : 1);
