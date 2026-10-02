# Open World Clock on the web

The web version of Open World Clock, live in the hero of the home page, **https://openworldclock.com/**. It is the Windows app's own renderer (`src/renderer/`) running in a browser: the same cards, converter, planner, map, search, shortcuts, themes and languages, from the same source files. Nothing is forked. This folder holds only what a browser needs on top.

The build writes it to `site/app/`, and the home page shows it in a same-origin frame (`#heroApp`). `/app/` is not a page of its own: it says `noindex` (meta and `X-Robots-Tag`), has no canonical, Open Graph, manifest or service worker, and opened on its own it goes to `/` with its hash (`/app/#c=...` becomes `/#c=...`), so older links still open their cities, in the hero.

Free, open source, no telemetry, no account. Cities and settings stay in the browser (`localStorage`, shared with the home page, same origin); the frame makes no requests of its own besides loading its files. The frame loads no analytics: the home page counts the visit, and its `site/assets/analytics.js` listens on the frame's document (same origin) for which parts of the app a visitor tries (`hero_app_used {action}`, real input only, never what is typed or picked; see Analytics in `site/README.md`). Opened on its own, `/app/` sends nothing.

## Rebuild

```
node scripts/build-web.mjs
```

It writes `site/app/` from scratch (safe to run any number of times) and prints the file count, the size with Brotli and the version. Run it after any change in `src/renderer/` or `web/`, and before every deploy: `npm run deploy` in `cloudflare/` uploads `site/` as it is, with no build step.

`node scripts/build-web.mjs --check` builds into a temporary folder and fails when `site/app/` is not what the current sources give (someone changed the renderer and forgot to rebuild). The output depends only on the sources, with LF line endings, so a CRLF checkout builds the same bytes as an LF one.

## Files

| File | What it is |
|---|---|
| `shim.js` | `window.wc` for browsers (the contract in `src/preload.js` and `CONTRACT.md`). Settings in `localStorage` under `owc-app-settings`, with the same DEFAULTS and validation as `src/main.js`. Also: the layout from the width, shared links (read from the home page's hash), the theme before the first paint, the redirect to `/` when opened on its own, and `window.WCWeb` for `web.js` |
| `web.js` | The page around the app: the hash for the home page's Share button (`window.WCShareHash`), the shared-link banner, times from a link, the wheel only with intent (no scroll trap in the hero), touch reorder, loading the world map after the first paint, the free and open source line in Help, removing an older version's service worker, strings in en, pt and es |
| `web.css` | Browser overrides, all under `html.is-web`: the app fills its frame, Windows-only controls and the layout choice hidden, phones and tablets, banner, toast |
| `head.html` | Page head: viewport, title, `noindex`, colour scheme |
| `top.html` | The no-JavaScript note, the shared-link banner, the status toast |
| `../scripts/build-web.mjs` | The build |
| `../test/web/` | Tests (below) and `serve.mjs`, a local server with the production headers |

### What the build writes (`site/app/`)

| File | From |
|---|---|
| `index.html` | `src/renderer/index.html` plus `head.html` and `top.html`, class `is-web`, the page's Content-Security-Policy, a preload for `app.bundle.js`, `shim.js` before the app, `web.css` after its styles, `web.js` (deferred) |
| `app.bundle.css` | Every stylesheet `src/renderer/index.html` loads, in its order, joined as they are, each under a banner with its file name |
| `app.bundle.js` | Every script it loads, the same way; each part runs in its own `try` block so one failing part still lets the others start, as separate files would |
| `app.later.js`, `app.later.css` | The world map (`views/world-land.js`, `views/map.js`, `views/map.css`, listed in `LATER` in the build), joined the same way. `web.js` loads them after the page's load event, at idle, or at once when the map is asked for first (the map button or Ctrl+M, which then opens it). `app.js` reaches the map only through `window.WCMap`, guarded, so nothing else changes |
| `shim.js`, `web.js`, `web.css` | Copied from here (`shim.js` gets the version from `package.json`) |

The contents are not changed, so a line in `app.bundle.js` reads exactly like the renderer source it came from.

The build stops with a message, rather than writing a broken page, when: an anchor it edits in `src/renderer/index.html` is missing or repeated; a renderer `.js` or `.css` file is not loaded by `index.html`; a renderer script declares something at the top level or starts with `'use strict'` (either would leak into the others in the bundle); a stylesheet uses `@import` or a relative `url()`; a local link in the page points at a missing file; a file here contains an en or em dash.

## In the home page's hero

- `site/index.html` has the frame, `<iframe id="heroApp" data-src="/app/" title="...">`, inside a window with a slim bar ("Try it here" and Share). Its height is set in `site/assets/site.css` (`--frame-h`) before anything loads, so filling it moves nothing (CLS 0).
- `site/assets/demo.js` sets the frame's `src` after the home page's load event. A same-origin frame shares the page's main thread, and starting it at once held the headline's first paint back by seconds on a slow phone; this way the headline is the largest paint and renders at once.
- Share in the window's bar asks the frame for the hash (`window.WCShareHash()` in `web.js`) and copies `https://openworldclock.com/#c=...`. `shim.js` reads a shared link from the home page's hash (the frame's parent, same origin), and `web.js` follows the home page's `hashchange`, so a link pasted into the address bar switches the hero to its cities. "Show my cities" and "Save these cities" clear the link from the home page's address too. The home page's own anchors (`#download`) are not links to cities and are ignored.
- The wheel over the frame scrubs the time only once the mouse has moved inside it and the page has come to rest (the same rule as the old converter demo); a visitor scrolling the page past the hero keeps scrolling.
- The site's theme button (`wc-theme`) reaches the app through the `storage` event, so "System" follows it at once.

## How the app is adapted

Only the web layer changes. `src/renderer/` has no web-specific code.

- **Settings.** Same keys, defaults and validators as `src/main.js` (`test/web/shim.test.mjs` runs both on the same inputs, so a change to one fails the test until the other matches). First run picks the 12 or 24-hour clock from the browser locale and adds the visitor's own city, like the app. Other tabs stay in step through the `storage` event. Blocked storage (some private modes) still works, for the visit only.
- **Window features, hidden:** pin above all windows, minimize, close to tray, launch at login, background opacity, window drag, per-view window sizes, the zoom shortcuts in Help (the browser's own zoom works), tray notices, the "drag to move" tip. Window calls in `window.wc` do nothing. Ko-fi stays (Settings > About).
- **Layout.** No choice on the web: the layout switch in the top bar and the Layout setting are hidden (`web.css`), and `shim.js` answers the strip layout, or the vertical layout under 600px wide. A layout in a settings patch is ignored and never saved. The Windows app keeps its switch; nothing in `src/renderer/` changed for this.
- **Phones** (under 600px wide) get the vertical layout. Each row shows the day line, so a finger can drag the time along it. Text fields use 16px on touch screens so iOS does not zoom into them. Copy (shown while converting) sits in the bar's top row, left of the icon buttons, so the time, the city, the day and Back to now keep one row down to 360px. While the planner is open, the hero's frame takes the planner's own height (rows plus hour scale, never more than its CSS height), so the window has no empty bottom (on desktop too). Between 760 and 900px the time slider gives way to the cards' day lines.
- **Big screens:** the app is at most 1640px wide and centered. From 1280px up every default city (five cards for most visitors: their own city plus Lisbon, New York, Los Angeles and Singapore) fits one row, with no scrolling and no edge fade. The cards take the frame's height up to 1.2x their width, so they sit about 30px under the toolbar instead of floating in a wide empty band, and the digits get a little more room than in the app (32cqw instead of 29cqw).
- **Language.** The home page in Portuguese or Spanish frames `/app/#lang=pt` or `/app/#lang=es` (a shared link's keys may follow: `#lang=pt&c=...`). `shim.js` reads it from the frame's own hash (then the home page's) once at start and on `hashchange`, and answers it as `systemLanguage`, so the app's "Automatic" language follows the page instead of the browser, and so do the strings `web.js` adds (the shared-link banner, Show my cities, Save these cities, the Help line). A language picked in the app's Settings still wins. Clearing a shared link keeps `#lang=`; Share links never carry it (the person opening the link reads their own language).
- **Theme.** The app's "System" theme follows the website's theme button (`wc-theme` in `localStorage`, from `site/assets/theme.js`) when the visitor picked one, otherwise the OS. A Light or Dark choice in the app's settings wins. The first paint already has the right theme and layout (`shim.js` runs in the head), so nothing flashes or moves when the app starts.
- **Title.** The page keeps its SEO title (the renderer's `data-i18n` on `<title>` is dropped).
- **First paint.** The world map (a sixth of the code) loads after the page, not before the clocks. Until the cards' entrance has finished (`html.web-entrance`, set by `shim.js`), the cards keep the entrance's rise but start opaque and take their day or night colours at once: a paint at opacity 0 does not count as the largest contentful paint, and a hundred colour crossfades right after the first paint only held the main thread.
- **Touch reorder.** The app moves cards with a mouse drag, Alt+Arrow keys and the card menu. On phones and tablets (pointer events, touch and pen only), touch and hold a card for 380 ms until it lifts, then drag it; the other cards make room as it passes, and a list that scrolls follows the finger near its edges. Letting go of a lifted card without moving opens its menu, as a long press did before. A quick swipe still scrolls. The drop goes through the app's own drop handler, so the saved order, the move animation and the screen reader message are the app's. Escape cancels. Reduced motion: no lift and no slide, the cards jump to their places. Help lists how to do it on touch screens.
- **Free and open source.** Help ends with "Free and open source. No account, no ads.", linked to the code on GitHub (in a new tab, so the hero stays).

## Shared links

The app also runs inside the dedicated converter, meeting planner, map and city comparison pages. Their parent wrapper opens the relevant view and preserves the current cities/time when a visitor switches tools. Sharing retains that page's path; personal state remains in the hash. A native date picker in the date-shortcut popover supports dates from 1900 through 2100 and dispatches to the same conversion engine as the desktop app.

Share (in the hero window's bar) copies a link to the cities on screen, plus the converted time while converting:

```
https://openworldclock.com/#c=Europe/Lisbon,Asia/Tokyo&t=2026-09-24T15:00&z=America/New_York
```

- Everything is in the hash, never the query string. Browsers do not send the hash to any server, and the site's analytics drop it too.
- `c`: IANA time zones, comma separated (invalid ones are skipped, at most 50). `t`: date and time, `YYYY-MM-DDTHH:MM`, in the zone `z`. `z` joins the list when it is not on it. Any of them may be missing; `t` and `z` alone convert on the visitor's own cities.
- Custom city names are not included (they can be personal).
- Opening a link shows its cities for the visit. The saved list does not change unless the visitor picks **Save these cities**; **Show my cities** goes back to it. Cities added or renamed while viewing a link stay in the visit too, until saved. A link to exactly the visitor's saved list is just their list (no banner).

## No offline copy

There is no service worker and no manifest: there is no page of its own to install or cache. `web.js` unregisters a worker an earlier version installed for `/app/` and deletes its `owc-app-*` caches.

## Tests

```
node --test test/web/shim.test.mjs     # settings parity with src/main.js, storage, shared links, theme, web strings in en, pt and es (no browser)
node test/web/web.test.mjs              # the whole page in headless Chrome
```

`web.test.mjs` builds first (skip with `--no-build`), serves `site/` on the first free port from 8810 to 8830 with the security headers from `site/_headers`, opens the home page and works the app inside its frame. It checks: no console, CSP or network errors; the default cities and their times in the hero; no layout switch or setting (map and planner stay); `/app/` is noindex, framable by this origin only, with no manifest or service worker; `/app/` opened on its own goes to `/` with the hash; adding a city; converting 15:00 in New York; planner and map; rename across a reload; the wheel with intent and no scroll trap; Share gives a home page link and a shared link round trip (the saved list untouched, a hashchange on the home page, Show my cities and Save these cities); the free and open source line in Help; the map loading after the first paint and on the first press; Portuguese and Spanish; themes, including the website's theme button live; phone layout with no horizontal overflow and a touch drag on the day line; at 360, 390 and 430 wide Copy in the bar's top row and the converter on one row, and the frame fitted to the planner; at 1280, 1440, 1536 and 1920 wide five cards on one row filling the frame; the page language from `#lang=pt` and `#lang=es` (at load, on a new hash, with a shared link, and a picked language winning); touch reorder on a phone and on a tablet with reduced motion; the home page's LCP (the headline) and CLS 0, unthrottled and on Slow 4G with 4x CPU. It saves screenshots of the home page (390 and 1440 wide, light and dark: the hero, converting, planner, map) and `metrics.json` to `dist/web-shots/` (`--shots <dir>` to change).

It needs `puppeteer-core` (`npm i --no-save puppeteer-core`, or `PUPPETEER_CORE=<folder that has it>`) and Chrome or Edge (the usual install paths, or `CHROME_PATH`).

To look at it yourself: `node test/web/serve.mjs 8817`, then open http://127.0.0.1:8817/ (the app is in the hero).

## Site settings it needs

In `site/_headers`: the site-wide policy has `frame-src 'self' https://ko-fi.com`, so the home page may frame `/app/`, and the `/app/*` rule detaches the site-wide policy and `X-Frame-Options: DENY`, then sets its own:

```
/app/*
  ! Content-Security-Policy
  ! X-Frame-Options
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'none'; worker-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests
  X-Frame-Options: SAMEORIGIN
  X-Robots-Tag: noindex
```

Checked with `wrangler pages dev`. Do not add a `/app` redirect to `site/_redirects`: it would break the frame. `/app/` is not in `sitemap.xml` or `llms.txt`, and no page links to it.

## Keeping it working

- The renderer must keep using only `window.wc` and web APIs (no Node, no Electron), as it does now.
- A new setting in `src/main.js` (DEFAULTS and VALIDATE) goes into `shim.js` too; `shim.test.mjs` fails until it does.
- A new `window.wc` call in `src/preload.js` needs a browser version (or a no-op) in `shim.js`.
- A new Windows-only control is hidden in `web.css` under `html.is-web`.
- New renderer scripts and styles only need to be in `src/renderer/index.html`; the build picks them up in order.
- `site/assets/analytics.js` (`HERO_ACTIONS` and `hookHero`) reads the app's element ids (`#btnMap`, `#convTime`, `#zoneResults`, `#copyMenu`, `.card`, `.arc` and the like) to count `hero_app_used`. Renaming one only stops that action from being counted; update it there too.
