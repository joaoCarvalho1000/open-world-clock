# scripts/perf: resource benchmarks for Open World Clock

Tools to measure what the widget costs in memory, CPU, startup time and download size, and to find out why.
Windows only (they sample processes through PowerShell/CIM). No extra dependencies. Nothing here runs in the
shipped app: the hooks load through `WC_SMOKE`, which `src/main.js` honors only in unpacked/dev runs, the same way
`test/deep.js` is loaded.

| script | what it does | time |
|---|---|---|
| `node scripts/perf/measure.js` | launches the dev build N times per scenario, records memory per process type, idle CPU, cold start timeline, renderer metrics | ~95 s per run |
| `node scripts/perf/profile.js` | all-process Chromium trace, renderer CPU profile and heap snapshot of one idle state, or a startup trace | ~75 s |
| `node scripts/perf/size.js` | what the installers, the appx and the installed folder are made of | seconds (compression pass ~4 min) |
| `node scripts/perf/compare.js a.json b.json ...` | side-by-side medians of measure.js result files | instant |
| `npm run perf` (`node scripts/perf/check.js`) | checks the newest result (and dist/ sizes) against `budgets.json` | instant |

Results go to `scripts/perf/results/` (git-ignored): a `.json` with every run and a `.md` with the tables.

## Safety

- Every run gets a fresh temp folder through `WC_USER_DATA` (dev) or `--user-data-dir` (packaged copy). The real
  `%APPDATA%\Open World Clock` is never read or written, and the installed `Open World Clock.exe` is never launched
  or killed.
- `--packaged` refuses an exe named `Open World Clock.exe`: copy `dist/win-unpacked` somewhere and rename the exe
  (for example `owc-perf.exe`) so its process name never matches the installed app.
- The app windows appear on screen during runs (always on top, at the default position). They are click-through
  (`setIgnoreMouseEvents`), so a stray mouse can't add hover work or close them. Don't use the machine heavily while
  measuring: CPU numbers are per process, but a busy GPU or CPU still adds noise. Each run records the display under
  the window (scale factor, refresh rate): the refresh rate multiplies animation frames.

## measure.js

```
node scripts/perf/measure.js                                 all scenarios, 3 runs each (about an hour)
node scripts/perf/measure.js -s default,seconds-off --runs 5
node scripts/perf/measure.js --quick                         1 run, short windows: harness smoke check
node scripts/perf/measure.js --list                          scenarios
node scripts/perf/measure.js --app <dir> --label proto-x     measure another copy of the app (a prototype)
node scripts/perf/measure.js --args "--disable-gpu"          extra Electron/Chromium switches
node scripts/perf/measure.js --env WC_BACKDROP=none          extra environment
node scripts/perf/measure.js --packaged <copy>\owc-perf.exe -s default,seconds-off
node scripts/perf/measure.js -s default,seconds-off --variant "before|app=C:/path/to/old-copy" --variant "after"
```

**Compare changes with `--variant` (A/B), not with two separate sessions.** Variants run interleaved (every
variant runs each scenario once per round), so background load, thermal state or a display change hits all of
them alike. Across separate sessions on a shared machine, idle CPU drifted by 2x; interleaved, the same comparison
was stable. Spec: `"label|app=<dir>|args=<switches>|env=K=V,K2=V2|electron=<exe>|packaged=<exe>"` (all parts but the
label optional; the rest falls back to the command-line options). One `.json`/`.md` per variant; the run prints the
matching `compare.js` command.

Scenarios: `default` (strip, the 5 default cities plus the local one, seconds on), `seconds-off`, `hidden`
(hidden to tray), `minimized`, `occluded` (not on top and moved off screen, so Chromium's native occlusion tracker
marks it hidden), `compact`, `vertical`, `planner`, `map`, `cities12`, `converting` (static 9:30),
`scrub` (slider input at 30 Hz: an active cost, not idle), `transparent` (`WC_BACKDROP=none`: the Windows 10 path,
transparent window with CSS blur instead of native acrylic). Scenarios run round-robin, so drift in background
load spreads over all of them.

Timeline of one run (seconds after the scenario is applied):

| t | what |
|---|---|
| boot | startup marks through a CDP script injected before the page loads; CDP then detaches |
| 10 | memory sample from outside (`sample.ps1`), start of the CPU window |
| 10-70 | idle CPU window: 60 s, so it always holds exactly one minute boundary (the once-a-minute full render and its transitions) |
| 70 | second memory sample |
| 72+ | CDP attaches again for 10 s, placed between two minute boundaries (per-second steady state) |

What the columns mean:

- **private WS** (private working set): the Memory column of Task Manager. The honest "how much RAM" number.
- **private bytes** (commit): memory the processes reserved in the page file, whether resident or not.
- **working set**: resident pages including shared DLL pages; summing it over processes double counts, so it
  overstates. Don't publish it.
- **CPU % of one core**: sum over all app processes of CPU seconds in the window / window length. 1% = 10 ms of
  CPU per second. Source: `app.getAppMetrics()` cumulative CPU per process; the outside cross-check (Win32 kernel +
  user time between the two samples) is in the counters table.
- **cold start**: ms after `spawn()`. `main ready` = the hook ran (main.js evaluated, app ready, window and tray
  created). `wc:boot` = app.js finished its first render. `first frame after boot` = the next frame after it (the
  widget is usable). FCP comes from paint timing and is late because the page fades in from opacity 0.
- **CDP**: `Performance.getMetrics` deltas (style recalcs, layouts, script and task time per second), JS heap
  before and after a forced GC, DOM nodes (including detached ones not yet collected), elements in the document,
  JS event listeners, composited layers (`LayerTree`), animations present and running.
- **counters**: IPC messages from the renderer, `settings.json` writes during the idle window, and the size of the
  profile folder Chromium creates.

The startup marks attach CDP before the page loads (a tiny overhead); `--no-startup-cdp` skips them.

## profile.js

```
node scripts/perf/profile.js                     default strip, 30 s idle
node scripts/perf/profile.js -s map              world map open (also: hidden, planner, seconds-off)
node scripts/perf/profile.js --startup           trace from main-ready to boot + 2.5 s, plus a renderer CPU profile of
                                                 script evaluation and the first render (CDP opened before the page)
node scripts/perf/profile.js --minute            renderer CPU profile across one minute boundary (the full render)
node scripts/perf/profile.js -s scrub --no-heap --duration 10   slider scrubbing at 30 Hz
node scripts/perf/profile.js --analyze <trace>   summarize an existing trace again
```

An idle profile records, in order: (1) a `contentTracing` trace of every process with no DevTools attached,
(2) a renderer CPU profile over the same duration, (3) a heap snapshot after a forced GC. `summary.md` lists
per-thread CPU in top-level tasks, the busiest events on each main thread with the code locations that posted
their tasks, renderer lifecycle events per second (style, layout, paint, commit), JS entry points (timers,
observers, events), the top JS functions, and the heap by type and constructor. Tracing adds its own overhead:
use the trace to see *what* runs and how often, and measure.js for *how much* it costs.
Open `trace-*.json` in https://ui.perfetto.dev (or chrome://tracing), `cpu-*.cpuprofile` in DevTools >
Performance, `heap-*.heapsnapshot` in DevTools > Memory.

## size.js

```
node scripts/perf/size.js                       reads dist/ (build first)
node scripts/perf/size.js --no-compress         skip the per-file compression pass
node scripts/perf/size.js --json out.json
```

Artifact sizes, the appx entries (zip: each file deflated on its own), the NSIS/portable inner listing (7z LZMA2,
solid; uses 7za from electron-builder's cache when present), the installed folder by category, `app.asar` by
package, duplicate files, and per-file deflate vs brotli (a stand-in for LZMA) sizes, which explains why the appx
is about 1.5x the size of the exe installers. Sizes are MiB (what Explorer shows as "MB").

## check.js and budgets.json (`npm run perf`)

```
node scripts/perf/measure.js -s default,seconds-off,hidden,map,scrub --runs 3 --label check
npm run perf                                   newest result: PASS at or under target, OK under max, FAIL over max (exit 1)
node scripts/perf/check.js <result.json> --strict --no-size
```

`npm run perf` only checks (it takes a second); measure first, which takes about 25 minutes for those five
scenarios. With no file argument check.js reads the newest result in `results/`. `max` values are regression
guards the current build passes on the reference machine with some headroom for noise; `target` values are
what the current build measured there (phase 2), so OK means slower than today. Absolute CPU and startup numbers are only meaningful on a quiet
machine; on a busy one, compare against the previous build with `--variant` instead.

## Files

- `measure.js`, `hook.js` (in-app driver for measure.js), `sample.ps1` (process tree sampler)
- `compare.js` (tables from result files), `check.js` + `budgets.json` (budget gate)
- `profile.js`, `profile-hook.js` (in-app driver for profile.js)
- `size.js`

## Prototyping a change without touching src/

Copy `src/`, `package.json` and `build/icon.*` to a scratch folder, edit the copy, and point `--app` (or a
`--variant ... app=`) at it; the scratch folder does not need `node_modules` (the harness uses the repo's Electron).
Chromium switches can be tried without any copy through `--args` (e.g. `--no-proxy-server`,
`--enable-features=NetworkServiceInProcess2`, `--disable-features=CalculateNativeWinOcclusion`,
`--force-prefers-reduced-motion`); `app.disableHardwareAcceleration()` needs a main.js change (or `--disable-gpu`,
which is close but not identical).
