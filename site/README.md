# Open World Clock website

Static marketing site for Open World Clock, the free world clock for Windows, served at **https://openworldclock.com** (canonical) from Cloudflare Pages, in the app's three languages: English at `/`, Brazilian Portuguese at `/pt/` and Spanish at `/es/` (see Languages below). No build step, no frameworks, and no third-party requests from the browser: the only analytics (PostHog, cookieless) go through our own `/ingest` path, and Ko-fi loads only when a visitor clicks Support. It still works from `file://` (analytics simply stay off there).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Landing page: live local time hero (with four other cities as day and night chips under the clock), self-playing time zone converter, sticky world map scene, feature demos, comparison line, privacy, FAQ, download (a dusk scene where the sun sets behind the earth as you scroll) |
| `privacy.html` | Privacy policy (from `../PRIVACY.md`, plus a section on this website and its analytics). Served as `/privacy` |
| `features.html`, `download.html`, `faq.html`, `time-zone-converter.html`, `meeting-planner.html`, `world-map.html`, `windows-clock-alternative.html`, `multiple-time-zones-windows.html`, `world-time-buddy-alternative.html` | Content pages (`body.pg-body`, styled by `assets/pages.css` on top of `site.css`), served without `.html`. `/time-zone-converter` also carries the home page's working converter, with a city picker (up to 8 cities, nothing stored). `/multiple-time-zones-windows` is a guide to the extra taskbar clocks, the Clock app and Open World Clock (with a FAQ on the two-clock limit); `/world-time-buddy-alternative` compares the app with the World Time Buddy website (facts checked September 2026, recheck them now and then) |
| `404.html` | Not-found page (uses root-absolute paths) |
| `pt/*.html`, `es/*.html` | The same thirteen pages in Brazilian Portuguese and Spanish, written natively (not machine translated), served as `/pt/`, `/pt/features` and so on. `pt/404.html` and `es/404.html` answer missing paths under `/pt/` and `/es/` (Pages serves the nearest `404.html`). See Languages below |
| `assets/i18n.js` | The words the scripts write at run time (demo.js, theme.js) in each language, in the app's own terms, the city names that differ in Portuguese and Spanish (copied from `ZONE_I18N` in `../src/renderer/zones.js`), the language picker's memory (`wc-lang`) and the English home page's language suggestion. Loaded on every page right after `config.js` |
| `assets/config.js` | **The one place for the product name, the version, launch links, the PostHog key and the analytics host** |
| `assets/analytics.js` | Website analytics (PostHog through `/ingest`, cookieless, only on openworldclock.com, off under Do Not Track or Global Privacy Control). See Analytics below |
| `assets/kofi.js` | The Support the creator buttons (nav and floating): loads Ko-fi's overlay only on click, opens its panel, falls back to ko-fi.com in a new tab. See Ko-fi below |
| `assets/site.css` | All styles: tokens mirror `src/renderer/style.css` (light and dark) |
| `assets/demo.js` | Hero clock and sky, converter demo and its scripted autoplay, map scene, feature mini demos. Only the hero runs at load; the converter, the map scene and the feature tiles are built as their sections come within a screen of the viewport (at once for a link to a section, a click on an in-page link, a reload, back or forward, and before printing). Every part checks that its section is on the page, so `/time-zone-converter` loads the same file for its converter alone (no hero, no autoplay, no scene) |
| `assets/theme.js` | Light / dark / system toggle (stores the choice in `localStorage` only); where the View Transitions API exists, the new theme opens as a circle from the button. Also closes the page Menu and the language picker on Escape, a press anywhere outside it, or when focus moves out of it; runs the Copy buttons (`data-copy`, the winget command on `/download`) and the phones-only Share the link button (see Phones below); and drops the fade on a comparison table's right edge once it is scrolled to the end (`.at-end`) |
| `assets/sun.js` | Copied unchanged from `src/renderer/sun.js` |
| `assets/zones.js` | City names and coordinates generated from `src/renderer/zones.js` |
| `assets/world-land.js` | Land outline (Natural Earth 110m, public domain), copied from `src/renderer/views/world-land.js` |
| `assets/fonts/outfit-var.woff2` | Outfit variable font (weights 150 to 600), subset to Latin; license in `assets/fonts/OFL.txt` |
| `assets/img/*.webp` | Real app screenshots from `../dist/shots/` (written by `../test/shots.js`), converted to WebP at quality 82 (the theme tile and JSON-LD use them). `settings.webp`, `converter.webp` and `vertical.webp` show 1.2.0; `strip-light.webp` and `strip-dark.webp` are still the 1.1 top bar and need a matching light and dark pair plus new alt text. `assets/img/pages/` holds the content pages' captures |
| `assets/og.png`, `assets/og-pt.png`, `assets/og-es.png` | 1200x630 social cards, one per language (truecolour PNG, about 250 KB, so the sky has no dithering), with "Open World Clock" top left in the site's own font (Outfit 600, 32px), the home page's headline and the line under it (in that language) over the app's strip. `cloudflare/site-chrome.mjs` puts each page's own card and its alt text in `og:image` and `twitter:image`. Their source is `../cloudflare/og/og-card.html` (not deployed); render them from the repo root with `node cloudflare/og/render.mjs` (English), `node cloudflare/og/render.mjs site/assets/og-pt.png pt` and `... og-es.png es` (headless Chrome or Edge, throwaway profile; it checks the size, the colour type and the 300 KB budget). When the headline changes, change it in the card too, and re-render all three (the cards draw the logo from `assets/logo-small.svg`, so re-render all three after a logo change) |
| `assets/icon-*.png`, `assets/logo-small.svg`, `favicon.ico` | Icons generated from the SVG masters in `../build/logo/` by `../scripts/build-icons.mjs` (do not edit by hand). `logo-small.svg` is the nav and footer mark and the SVG tab icon; `icon-512-maskable.png` is the manifest's maskable icon. `assets/logo.svg` is written by it too; no page of the website uses it, but the web app's top bar does (`app/index.html`), so keep it |
| `_headers` | Cloudflare Pages headers: CSP (self plus the Ko-fi overlay, inline scripts by hash), HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, cache rules, content types and CORS for the AI files and `/api/*`, noindex on non-canonical hosts |
| `_redirects` | Path redirects (`/privacy-policy`, `/downloads`, `/README.md`, `/security.txt`). `/download`, `/faq` and `/features` are real pages and must not redirect. Domain redirects are Bulk Redirects, see `../cloudflare/README.md` |
| `_routes.json` | Only `/ingest/*` runs the Pages Function (the PostHog proxy); everything else is static |
| `sitemap.xml`, `robots.txt`, `site.webmanifest`, `.nojekyll` | SEO and hosting files. The sitemap lists every page in all three languages, each with its `xhtml:link` alternates (en, pt-BR, es, x-default) |
| `llms.txt`, `llms-full.txt` | Site guide and full product description for AI assistants (llmstxt.org format), plain text, CORS open |
| `api/app.json` | Machine-readable app facts (JSON, CORS open, noindex) |
| `.well-known/security.txt`, `.well-known/gpc.json` | Security contact (RFC 9116) and the Global Privacy Control support statement |
| `app/` | The web app (Open World Clock in the browser, served at `/app/`). **Generated**: `../scripts/build-web.mjs` builds it from `../src/renderer` plus `../web/`, so never edit it here. How it works, its own CSP in `_headers` and its tests: `../web/README.md` |

The Cloudflare side (the `/ingest` proxy Function, `wrangler.toml`, the Bulk Redirects list, deploy steps, and `site-chrome.mjs`, which writes the nav and footer of every page in every language) lives in `../cloudflare/`.

## Languages

The site speaks the app's three languages: English (default, `/`), Brazilian Portuguese (`/pt/`) and Spanish (`/es/`, neutral Latin American Spanish with "tú", like the app and the Store listing). Every public page exists in all three, at the same slug: slugs stay English (`/pt/features`, `/es/download`), so a page's three addresses differ only in the prefix and the hreflang pairs cannot drift. The Portuguese and Spanish pages were written natively, as a copywriter would write them for that audience, not line by line, and use the app's own words for its features (`../src/renderer/i18n.js`: *conversor de fuso horário*, *planejador de reuniões*, *mapa-múndi*, *expediente*; *conversor de zona horaria*, *planificador de reuniones*, *mapa mundial*, *horario laboral*). The Store button uses Microsoft's localized badge text: *Baixe na Microsoft Store*, *Descargar desde Microsoft Store*.

- **Shared frame.** The nav (page links, Menu, language picker, theme, Support, Download), the footer (page links, language links, legal line), the hreflang alternates, the canonical and `og:url`, `og:locale` with its alternates (`en_US`, `pt_BR`, `es_419`), the skip link and the script tags are written by `node cloudflare/site-chrome.mjs --write` from one table of labels per language. Edit a nav label or add a page there, never by hand in 36 files. `node cloudflare/site-chrome.mjs` (no flag) checks that every page is in step, and `npm test` and `npm run deploy` in `../cloudflare/` run that check. The script also makes every link in a `/pt/` or `/es/` page point to the same language (`/features` becomes `/pt/features`) and every asset path root-absolute (`/assets/...`), so a page copied from English only needs its words translated.
- **Each page's own words** (title, description, Open Graph text, JSON-LD strings, the page body, alt text and aria labels) are written by hand in its language. JSON-LD uses the page language (`inLanguage`), the language's own `WebSite` node (`https://openworldclock.com/pt/#website`), `/pt/` or `/es/` URLs, and FAQ answers that match the visible FAQ word for word. The app and author nodes (`#app`, `#author`) are shared.
- **Language picker.** A small globe in the nav (with the language code from 1280px; below 760px the Menu lists the other languages at its end) and a row of links in the footer, on every page. Each is a plain link to the same page in the other language, so it works without script. `assets/i18n.js` remembers a click in `localStorage` (`wc-lang`).
- **No automatic redirects.** On the English home page only, a visitor whose browser prefers Portuguese or Spanish (or who picked it before) and has not picked English sees a small suggestion in the bottom right corner, "Ver em português" or "Ver en español", with a close button. Closing it counts as picking English, so it does not come back. It is `position: fixed` and appears after the load event, so it moves nothing (CLS 0). A shared link's hash (`#c=...`) travels along.
- **The live app in the hero** gets the page language in its frame's hash: `/app/#lang=pt` on `/pt/`, `#lang=es` on `/es/`, `#lang=en` on `/`, after any shared cities or time from the page's own hash (`/app/#c=...&t=...&z=...&lang=pt`). The Share button in the app window copies a link to the page in its own language (`https://openworldclock.com/pt/#c=...`).
- **Scripts.** Every word `demo.js` and `theme.js` write at run time (card phases, day markers, the planner line, the hero's place line, the theme button's label, Copied) comes from `assets/i18n.js` in the page's language (`<html lang>`: `en`, `pt-BR` or `es`), and city names follow the app's translations (Nova York, Tóquio; Nueva York, Tokio).
- **Screenshots** are the English app (`assets/img/` is shared); their alt text and captions describe them in each language.
- **Adding a page:** write the English page, copy it to `pt/` and `es/`, translate each copy's words, add its slug to `PAGES` (and the nav or footer table, if it belongs there) in `../cloudflare/site-chrome.mjs`, run it with `--write`, and add its three URLs to `sitemap.xml` and its three paths to the HTML cache rules in `_headers`.

## Preview locally

Open `index.html` in a browser. Everything works from `file://`.

To test like a real host (clean URLs, the 404 page), serve the folder:

```
npx http-server site -p 5173
# or
python -m http.server 5173 --directory site
```

Then open http://localhost:5173. For the real Cloudflare behaviour (`_headers`, `_redirects`, the `/ingest` Function), run `npx wrangler pages dev` in `../cloudflare/` (see its README).

## Launch links

All set in `assets/config.js`, which rewrites the links at load:

| Setting | Value |
| --- | --- |
| `version` | `1.3.0`: the release the Installer and Portable buttons download. Must equal `version` in the root `package.json` (the launch gate in `../cloudflare/check-links.mjs` fails the deploy otherwise) |
| `storeLive` | `true` since the Microsoft Store listing was approved (September 2026); `false` hides every Store link. See The Store switch below |
| `storeUrl` | `https://apps.microsoft.com/detail/9N88FR8M81BM` (no query: each Store link adds its own `?cid=`, see below) |
| `downloadBase` | `https://download.openworldclock.com`: the Cloudflare R2 bucket `owc-downloads` on its own domain, which serves the installer and the portable exe |
| `githubRepo` | `joaoCarvalho1000/open-world-clock` (source, license, issues and release notes; the exe files are not on GitHub) |
| `posthogKey` | the PostHog project key (`phc_...`, public by design). Set it back to `POSTHOG_KEY` and no analytics code runs at all |
| `siteHost` | `openworldclock.com`: the only hostname that sends analytics (see Analytics below) |

The Installer and Portable buttons (`data-link="setup"` and `data-link="portable"`) download the file itself: `<downloadBase>/Open-World-Clock-<version>-setup.exe`, and the same name ending in `-portable.exe`, for example https://download.openworldclock.com/Open-World-Clock-1.3.0-setup.exe. Those are the names the build gives the files (`artifactName` in `../package.json`), uploaded to R2 as they are (the `../PUBLISHING.md` flow). Old versions stay in the bucket, so older links keep working. They are plain links, so the CSP in `_headers` needs nothing for them.

The download page (`download.html`, in all three languages) prints the SHA-256 of each file under its steps (`<p class="sha">`), and `llms-full.txt` repeats them, so people can check a download with `Get-FileHash`. Update all four with every release.

### The Store switch

`storeLive` in `assets/config.js` decides whether the site offers the Microsoft Store. While it is `false` (as it was until the listing was approved in September 2026):

- every Store button, the Store and winget option cards and sections, the "Which one should I pick?" table and each Store sentence carry `data-store` and are hidden; their twins carry `data-store-off` and show instead: "Download installer" (primary) and "Portable exe" (secondary), with a short line under them (Windows 10 and 11, x64, about 90 MB, free, and the SmartScreen note). The buttons keep `data-track="installer_click"` and `"portable_click"`, so analytics records them with their `placement` and the `version` they download
- the JSON-LD `installUrl` is the installer, `sameAs` leaves out the Store, and `processorRequirements` is `x64` (ARM64 comes with the Store build)
- the launch gate (`../cloudflare/check-links.mjs`) requests no Store URL
- `llms.txt`, `llms-full.txt` and `api/app.json` say the Store listing is coming soon and must not link it or winget (`site-chrome.mjs` fails if they do)

The static HTML carries the same state as the switch, so nothing moves when a page loads (`config.js` applies the switch again at load, which changes nothing while they agree). When the listing is approved:

1. Set `storeLive: true` in `assets/config.js`.
2. Run `node cloudflare/site-chrome.mjs --write` from the repo root. It flips every `hidden` attribute and the JSON-LD `installUrl`, `sameAs` and `processorRequirements` in all three languages.
3. By hand, in all three languages (these are text, not switched): the meta, Open Graph and Twitter descriptions and the JSON-LD description and HowTo on `download.html` (the HowTo describes the installer today), the FAQ answers in the `FAQPage` JSON-LD on `faq.html` (the visible FAQ has both versions and switches itself; the JSON-LD must match the visible one), and the Store lines in `llms.txt`, `llms-full.txt` and `api/app.json` (see git history for the Store wording).
4. `npm test` and `npm run links` in `../cloudflare/`, then deploy.

### Each release

1. Bump `version` in `assets/config.js` to the new `package.json` version.
2. Replace the old version in the static HTML and text (file names and direct links in `download.html`, `index.html` and `llms-full.txt`, the "Version" fact, `softwareVersion` in the JSON-LD and `api/app.json`, the llms files), in all three languages, for crawlers and no-JS visitors. From the repo root, for example: `sed -i 's/1\.2\.0/1.3.0/g' site/*.html site/pt/*.html site/es/*.html site/*.txt site/api/app.json`, then read the diff (the What's new list and dates need a person, in each language).
3. Upload the two exe files to R2 and update the SHA-256 lines (`../PUBLISHING.md`, Every release, step 4). Later, once releases are code-signed and installer updates are on, the same upload also takes the installer's `.blockmap` and, last, `latest.yml` (with a short cache time): signed installs check `latest.yml` on download.openworldclock.com for updates. Never upload a `latest.yml` from an unsigned build. The site itself links only the two exe files, so none of this changes the HTML.
4. Deploy with `npm run deploy` in `../cloudflare/`: the launch gate checks that both files answer on download.openworldclock.com, that the names on `download.html` match them, and that the version in `assets/config.js` is the one in `package.json`.

Store campaign ids: every Store link carries `data-cid` (today `site-hero` and `site-download`), and the static `href` repeats it as `?cid=site-hero`, so the Store's own reports show which button sent each visit. A new Store link needs its own distinct `data-cid`. A visit that arrives with `?utm_source=reddit` (letters, digits and hyphens, up to 24) gets that channel added to every id on the page (`?cid=site-hero-reddit`), so the Store reports split by launch post too; anything else in `utm_source` is ignored and nothing is stored (`cidSuffix` in `assets/config.js`, tested by `../cloudflare/analytics-gate.test.mjs`).

Also check that `posthogUi` in `assets/config.js` (`https://us.posthog.com` or `https://eu.posthog.com`) matches `POSTHOG_REGION` in `../cloudflare/wrangler.toml`.

The canonical origin is filled in as `https://openworldclock.com` (canonical links, Open Graph and Twitter tags, JSON-LD, `sitemap.xml`, `robots.txt`). If it ever changes, replace that string across `site/`, and update the hostnames in `_headers` and `../cloudflare/bulk-redirects.csv`.

Crawlers and link previews read the static HTML, so if the repo ever moves, replace it there too (from the repo root):

```
sed -i 's#joaoCarvalho1000/open-world-clock#new-owner/new-repo#g' site/*.html site/pt/*.html site/es/*.html site/*.txt site/assets/config.js cloudflare/site-chrome.mjs
```

## Renaming the product

The name is set once in `assets/config.js` (`name: 'Open World Clock'`). Changing it updates every visible name, the tab title, social tags and JSON-LD when the page loads.

For crawlers and link previews, also replace the static text (safe to run across the whole folder; the config keeps working):

```
sed -i 's/Open World Clock/Meridian/g' site/*.html site/pt/*.html site/es/*.html site/*.webmanifest site/assets/config.js cloudflare/site-chrome.mjs
```

Then change the name in `../cloudflare/og/og-card.html` and regenerate `assets/og.png` with `node cloudflare/og/render.mjs` from the repo root (the name is top left), and check that the footer wordmark still fits: `.footer-mark` in `site.css` is sized for the length of "Open World Clock". `site.webmanifest` keeps `short_name` as "World Clock" so home screen labels are not cut off.

## Analytics

The website (never the apps) uses PostHog, set up in `assets/analytics.js`:

- Runs only when `posthogKey` is a real key, the page is served over http(s), and the browser sends neither Do Not Track nor Global Privacy Control. Otherwise nothing loads.
- Runs only on `siteHost` (`openworldclock.com`). On `localhost`, `127.0.0.1`, `*.pages.dev` previews and any other host nothing loads, so local previews and test runs never send events to the production project. Tested by `../cloudflare/analytics-gate.test.mjs`.
- The SDK is requested from `/ingest/static/array.js` after the `load` event, at idle, so it never competes with the first paint or LCP. All requests go to `/ingest/*` on the site's own origin; `../cloudflare/functions/ingest/[[path]].js` forwards them to PostHog (US or EU) and strips cookies.
- `cookieless_mode: 'always'` with memory persistence and `person_profiles: 'never'`: no cookies, nothing in `localStorage` or `sessionStorage` (the only stored keys on the site stay `wc-theme`, the theme choice, and `wc-lang`, the language picked in the language picker; the web app in `/app/` keeps its own settings, see `../web/README.md`). **Turn on "Cookieless server hash mode" in PostHog (Project settings > Web analytics)** or PostHog drops these events, and turn on "Discard client IP data" so IP addresses are not stored (the privacy page says so).
- Off: autocapture, session recording, surveys, heatmaps, dead and rage clicks, web vitals, exception capture, feature flags, extra scripts. Nothing typed is ever sent.
- Store links: `assets/config.js` adds a safe `utm_source` to the Store campaign id (see Launch links), in the link itself, with no event and no storage.
- `before_send` trims URLs to origin and path (keeping only `utm_*`), trims referrers to their origin, and removes `$timezone` (the privacy page promises the demo's time zone never leaves the browser).

Events (plus PostHog's own `$pageview`, one per page load). Every event, `$pageview` included, carries `page_lang` (`en`, `pt` or `es`, from `<html lang>`): the language of the page, never anything about the visitor.

| Event | Properties | When |
| --- | --- | --- |
| `scroll_depth` | `depth`: 25, 50, 75, 100 | Each milestone, once per page view |
| `section_view` | `section`: `hero`, `demo`, `awake`, `features`, `compare`, `privacy`, `faq`, `download`, `footer` | Half of the section is on screen, or it fills half the screen (tall scenes), once each |
| `store_click` | `placement`: `hero` or `download` | Microsoft Store button (`data-track="store_click"`; hidden while `storeLive` is false) |
| `installer_click` | `placement`; `version`: the app version the button downloads (from its file name, `Open-World-Clock-1.3.0-setup.exe`, else `version` in `assets/config.js`) | Installer button (`data-track="installer_click"`) |
| `portable_click` | `placement`; `version` (as for `installer_click`) | Portable button (`data-track="portable_click"`) |
| `converter_used` | `via`: `type`, `slider`, `city`, `copy`, `back_to_now`, `clocks` | First real interaction with the converter demo (never the autoplay, never the typed value) |
| `faq_open` | `question` | A FAQ item is opened |
| `theme_toggle` | `theme`: the new choice, `light`, `dark` or `system` | Theme button |
| `kofi_click` | `location`: `nav`, `floating`, `footer` or `download` | The nav's Support the creator button, the floating button or a Support the creator on Ko-fi link (`data-kofi="..."`) |
| `language_switch` | `from` and `to`: `en`, `pt` or `es`; `via`: `picker` (the globe in the nav), `menu` (the Menu's language links), `footer` or `suggestion` (the English home page's "Ver em português") | A link to another language (`a[data-lang]`); the page's own language is not counted |
| `github_click` | `placement` (`app` for links inside the hero's app); `link`: `repo`, `issues`, `releases`, `license`, `profile` or `other` | Any link to github.com (the kind of link, never the address) |
| `hero_app_used` | `action`: `add_city`, `convert`, `scrub`, `copy`, `planner`, `map`, `settings`, `theme`, `edit_city`, `help` or `share` | The live app in the home page's hero, once per action per page view. Only real presses, keys, wheel turns and edits (`isTrusted`): never the app's startup, a shared link or anything scripted, and never what was typed or picked (no city, time or setting value). `analytics.js` listens on the frame's document (same origin); the app itself loads no analytics. What counts for each action is in `HERO_ACTIONS` in `assets/analytics.js` |

To track another link, give it `data-track="event_name"`. Link clicks are sent with `sendBeacon`, so they survive the navigation (once the SDK has loaded, about a second after the page).

## Ko-fi

Tips go to https://ko-fi.com/joaothecarvalho. Privacy and speed come first, so nothing from Ko-fi loads with the page:

- **Support the creator** in the nav (`.nav-kofi`, `data-kofi="nav"`, on every page from 760px): a quiet outline pill beside Download, with the cup, that takes the bar's own colour. The full label ("Support the creator", "Apoie o criador", "Apoya al creador") from 1280px, the cup alone below that; its `aria-label` ("Support the creator on Ko-fi", translated) names it at every width. Its click loads Ko-fi exactly like the floating button below, and the panel then hangs under the nav at the right (`html.kofi-at-nav`). From 760px it replaces the floating button, which is hidden there; phones keep the floating button.
- `#kofiFab` (on every page but the 404, below 760px) is our own button, styled like Ko-fi's floating one (`#00b9fe` with navy text and cup, 8.26:1; below 1600px just the cup in a 46px circle, still named Support the creator on Ko-fi, because the full pill reached past the left edge of the content pages' text). It is `display: none` until after the load event, then fades in, so it costs the first paint nothing (LCP and CLS unchanged). It sits bottom left, clear of phone safe areas, and steps aside over the hero (or a content page's header) and where the download section and footer have their own quiet Support on Ko-fi link. On every page below 1400px (the home page included) it also steps away while you scroll down (`.is-away`) and comes back when you scroll up or reach the end of the page; an open panel keeps it. While it is away it is `visibility: hidden`, so Tab skips it until it returns.
- A click loads `https://storage.ko-fi.com/cdn/scripts/overlay-widget.js`, draws Ko-fi's widget and opens its panel just above our button; our button then opens and closes it (Escape closes it too). Ko-fi ignores a close during the panel's first second, so a quick second click or Escape waits for that second instead of being lost. Ko-fi's own floating button stays hidden. Its button image and Google Fonts are turned off in `kofi.js`, so the only Ko-fi requests are the script, two stylesheets and the panel frame, which is exactly what the CSP allows.
- If the script fails or is blocked, or the panel is not ready within 3 s, ko-fi.com opens in a new tab, and the button is a plain link from then on.
- COOP is `same-origin-allow-popups` so PayPal's checkout popup, opened from inside the panel, keeps its opener.

## Phones

Open World Clock is for Windows PCs, so on a phone (Android or iPhone, from `navigator.userAgentData.mobile` or the user agent; iPadOS reports a desktop browser and is left alone) the inline theme script in each page's `<head>` adds `not-windows` to `<html>` before the first paint, and `site.css` then shows the Share the link button and its one-line note in the home and download heroes (they are `display: none` otherwise). Doing it in `<head>` rather than in `config.js` at the end of `<body>` means the note never pushes the page down after it has painted. That script is hashed in the CSP, so run `node cloudflare/csp-hashes.mjs --write` after any edit to it. On the home page the button takes the place of Other downloads, so the hero keeps its height. A tap opens the phone's share sheet with `https://openworldclock.com/download`; without `navigator.share` it copies the link and says Link copied. No analytics event and nothing stored. Without script nothing changes.

## Deploy

Cloudflare Pages, with the `/ingest` proxy as a Pages Function. Exact steps, custom domains, the canonical redirects, PostHog settings and how to test the proxy are in `../cloudflare/README.md`. In short, from `cloudflare/`: `npm run deploy` (it runs the launch gate first).

After editing any inline `<script>` in the HTML, run `node cloudflare/csp-hashes.mjs --write` from the repo root so the CSP in `_headers` allows it.

## Notes

- Fonts: Outfit (self-hosted, `assets/fonts/`) for display type and digits; Segoe UI Variable (Windows) or the platform UI font for body text. Nothing is fetched from a third party until a visitor clicks Support (the CSP in `_headers` enforces it), which keeps the privacy page's promise true.
- Motion: one set of tokens in `site.css` (`--ease`, `--ease-out`, `--ease-in-out`, `--ease-spring`, `--dur-1` to `--dur-6`, `--stagger`), read back by `demo.js` for its WAAPI digit rolls. Scroll-driven CSS animations where supported (map night, ruler, privacy words, the dusk scene), an IntersectionObserver fallback elsewhere, and everything off under `prefers-reduced-motion` (the page then shows each scene's final state).
- Type: five size tokens (`--fs-mega`, `--fs-display`, `--fs-h2`, `--fs-h2s`, `--fs-h3`) plus `--fs-lede`.
- Buttons with the `magnetic` class lean toward a mouse pointer (fine pointers only, capped at a few pixels, off under reduced motion). Bento tiles get a soft light under a mouse pointer (`.tile-glow`, moved with transform only).
- Cards match the app: each is lit by its own sky (`--g-day`, `--g-night`, `--g-golden`, `--g-dawn`, `--g-twilight`, light and dark). Golden hour, dawn and twilight are a second layer crossfaded with opacity. The converter bar also draws the app's date chip and toolbar (decorative).
- The planner tile is the app's hour grid (`--cell*` tokens): each cell is that city's own hour, blue for 09:00 to 18:00, slate while the sun is down, with the overlap block and the selected hour as items in the same CSS grid. It shows 8, 10 or 12 hours depending on width.
- Map pins: day cities are solid dots, night cities are moonlit (navy dot, pale ring, a moon after the time). Warm yellow is reserved for the sun.
- Choreography: the hero clock lifts and fades as you leave it, the privacy band opens from a rounded card to full bleed, the nav turns to night over the night band, the dusk and the footer, and the footer name rises as the page ends.
- Layout stability: controls that appear (Back to now, Copy) sit on a row that already exists, typing carets hang off the text's own right edge, and flipped map labels are anchored with a transform, so nothing moves another box (CLS 0).
- First visit: a fresh browser profile has no compiled GPU shaders, and the frosted nav (`--frost`), the converter (shadows, sky gradients, the cursor's drop shadow) and the map's blurred night each stalled the first scroll by 100 to 200 ms. `demo.js` draws each once at idle about 1.5 s after load, in view at 0.4% opacity inside `.gpu-warm`, one per idle slot and never while the page is scrolling, then removes it. If you add an effect with a blur, filter, mask or a new kind of gradient near the top of the page, add it to `warmSteps` too.
- Tablets: from 641 to 1100px all five converter clocks share the widget's width (portrait tablets drop the Home badge, the UTC offset and the seconds, which the ring, the relative offset and "Local" already cover). Portrait tablets (761 to 1100px) get a bigger single-row clock with four city chips, and a taller crop of the map with the cities as a row of five cards under it (`mqRows` in `demo.js` mirrors that media query). The bento goes 12 / 6 + 6 below 1000px, and the three small tiles share a row in thirds from 1000 to 1239px.
- Idle cost: nothing restyles per frame while the page sits still. The typing carets blink with opacity on the compositor and only while their tile is on screen (`.in-view`, set by an IntersectionObserver).
- Hero digits are optically aligned: `data-lead`, `data-lead2` and `data-last` on `.clock` pick the side bearings of the first figure, the minutes row's first figure (phones) and the last figure (Outfit tabular figures at weight 150). The ink, not the advance box, sits on the text column (applied with `translate`, so no layout moves), and the seconds line ends exactly under the last figure. The colon is lifted to the middle of the figures, and the chips row never sets the clock's width.
- Wheel over the converter scrubs time only with intent (the mouse moved onto the clocks and the page is at rest). Scrolling the page past it never gets trapped. The autoplay stops for good on a click, key, focus or real scrub, not on a finger or wheel passing through.
- `theme-color` follows what is under the browser toolbar: the hero sky at the top (from the sun's altitude), the canvas under the frosted nav, night over the dark scenes, in both themes.
- Page menu: every page has a `<details class="nav-menu">` Menu in the bar that lists the product pages (no script needed to open it; the guide at `/multiple-time-zones-windows` is linked from the footer and the Windows Clock page instead). It shows below 1100px, where the bar cannot hold every link; from 900px Features and FAQ stay in the bar and leave the Menu. Below 760px the language picker, and below 480px the Download pill, make room for the name and the Menu, which has Download and the other languages in it. Up to 1279px the bar tightens its gaps and the language picker and Support show their icons only, so the longest labels (Spanish) fit on one line from 360 to 1920px. The panel is solid canvas with its own text colour, so it reads the same over the hero, the light sections and the night band.
- Print: a basic stylesheet prints the words and the product in ink (no nav, sky or motion; FAQ answers open).
- Touch: under `(pointer: coarse)` every control is at least 44px, and the converter's scripted cursor becomes a fingertip that drags the slider (no mouse wheel on a phone).
- Focus: one ring colour token (`--ring`), pale on night surfaces (dark hero sky, night band, night tiles, dusk, footer); rings follow each control's own radius.
- Seams: the converter section starts in the hero's horizon colour (`--hero-end`, set by `demo.js`), and the features section fades in and out of the canvas, so no section boundary shows as a hard line.
- iPhone: the download section says iPhone widgets are in the works, with no date (once, not repeated in the FAQ). Keep it that way until there is a store link.
- Typography: curly apostrophes (’) in visible copy and social titles, typographic quotes (“ ”) in Portuguese and Spanish, inverted ¿ ¡ in Spanish; no em or en dashes anywhere, in any language (`../cloudflare/site-chrome.test.mjs` checks).
- The demo picks the visitor's time zone plus four cities with different offsets, and works out day and night with the same formulas the app uses.
