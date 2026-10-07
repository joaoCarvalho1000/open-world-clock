# Cloudflare setup for openworldclock.com

The website (`../site`) is a static Cloudflare Pages project with one Pages Function: a same-origin reverse proxy that forwards `/ingest/*` to PostHog, so visitors' browsers only ever talk to our own domain. Three domains point at it; **https://openworldclock.com** is canonical and the others 301 to it with the path and query kept.

## What is here

| Path | What it is |
| --- | --- |
| `wrangler.toml` | Pages project config: name `open-world-clock`, output `../site`, the `POSTHOG_REGION` and `POSTHOG_KEY` variables |
| `functions/ingest/[[path]].js` | The Pages Function behind `/ingest` and everything under it |
| `lib/posthog-proxy.js` | The proxy itself, after PostHog's Cloudflare guide, as a strict allowlist: `GET /ingest/static/array.js` and `GET /ingest/array/<POSTHOG_KEY>/config(.js)` go to the asset host (edge cached, query dropped); `/ingest/e/`, `/i/v0/e/`, `/batch/`, `/flags/` and `/decide/` (GET or POST) go to the API host; every other path is a 404 and only GET, POST and OPTIONS are accepted. Bodies over 64 KB get a 413. Only `Content-Type`, `Content-Encoding`, `User-Agent`, `Accept` and `Accept-Encoding` are forwarded, plus `X-Forwarded-For` from `CF-Connecting-IP` (PostHog needs the visitor IP for the cookieless daily hash and a rough country); `Cookie`, `Authorization` and `Referer` never are. `Set-Cookie` is removed from responses. Tested by `test/unit/proxy.test.js` in the repo root |
| `worker/` | Optional standalone Worker with the same proxy, only if the site ever moves off Pages. Never run both on one hostname |
| `bulk-redirects.csv` | The account Bulk Redirect list: other domains, `www` and `*.pages.dev` to the canonical origin |
| `csp-hashes.mjs` | Checks or rewrites the inline script hashes in `site/_headers` (reads `site/*.html`, `site/pt/*.html` and `site/es/*.html`) |
| `site-chrome.mjs` | Writes the parts every page shares, in each of the site's three languages (English `site/`, Portuguese `site/pt/`, Spanish `site/es/`): the nav with its language picker and Support button, the footer, hreflang alternates, canonical, `og:locale`. `node site-chrome.mjs --write` rewrites them; without the flag it checks and exits 1 when a page is missing or out of step. See Languages in `../site/README.md` |
| `site-chrome.test.mjs` | The three languages on the real site: every page in all three, reciprocal hreflang, the picker links to the same page, Portuguese and Spanish pages link within their language, valid JSON-LD in the page language with FAQ answers that match the visible FAQ, no em or en dashes, and a sitemap entry with the same alternates for every page (`npm test`) |
| `check-links.mjs` | The launch gate: fails while the Store listing (only once `storeLive` is true), the GitHub repo or its LICENSE is missing, while the installer or portable exe does not answer on download.openworldclock.com, while `download.html` names other files, or while the version in `site/assets/config.js` is not the one in `package.json`. Runs before every `npm run deploy`. See Launch gate below. Tested by `check-links.test.mjs` (`npm test`) |
| `analytics-gate.test.mjs` | Loads `site/assets/config.js` and `analytics.js` in a Node `vm` sandbox and checks that analytics loads only on openworldclock.com: never on `localhost`, `127.0.0.1` or `*.pages.dev`, and never under Do Not Track. Also checks the `utm_source` suffix `config.js` adds to Store campaign ids (`?utm_source=reddit` gives `?cid=site-hero-reddit`; unsafe or long values are dropped), and the events with a stub page: `version` on the download clicks, `language_switch`, `github_click`, `theme_toggle`, and `hero_app_used` counted once per action from trusted input in the hero's frame only, never before the frame shows `/app/` or on another host (`npm test`) |
| `og/` | Source of `site/assets/og.png`: `og-card.html` (a 1200x630 page using the site's font, logo and a lossless copy of the app strip from `dist/shots/light-strip.png`) and `render.mjs`, which renders it with the installed Chrome or Edge: `node cloudflare/og/render.mjs` from the repo root. Not deployed (outside `pages_build_output_dir`) |
| `package.json`, `package-lock.json` | `npm run dev`, `npm run deploy` (runs `site-chrome.mjs` and `check-links.mjs` first), `npm run links`, `npm test`, `npm run csp`, `npm run chrome` (and `chrome:write`); Wrangler is pinned to an exact version and locked (install with `npm ci`) |

In `../site`: `_headers` (CSP, HSTS and the other security headers, cache rules, noindex on non-canonical hosts), `_redirects` (path redirects only) and `_routes.json` (only `/ingest/*` runs the Function, so static files never cost a Function invocation).

Miniflare currently pins sharp 0.35.4. The package override selects the patched
0.35.5 release for [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
Remove the override when the pinned Miniflare version includes that fix.

## Values the owner fills in

| What | Where | Value |
| --- | --- | --- |
| PostHog project key | `site/assets/config.js` `posthogKey` (placeholder `POSTHOG_KEY`) | `phc_...` from PostHog > Project settings. Until it is set, no analytics code runs |
| PostHog region | `wrangler.toml` `[vars] POSTHOG_REGION`, and `site/assets/config.js` `posthogUi` | `us` with `https://us.posthog.com`, or `eu` with `https://eu.posthog.com` (must match where the PostHog project lives) |
| Optional explicit host | `wrangler.toml` `POSTHOG_HOST` (and `POSTHOG_ASSET_HOST`) | e.g. `eu.i.posthog.com`; overrides `POSTHOG_REGION` |
| Store and GitHub links | `site/assets/config.js` (`storeUrl`, `githubRepo`), repeated in the static HTML | Already set. See `site/README.md` to change them |
| Pages project name | `wrangler.toml` `name`, `bulk-redirects.csv` line 4, the comment in `site/_redirects` | Defaults to `open-world-clock` (so `open-world-clock.pages.dev`). If you pick another name, change all three |

The canonical origin `https://openworldclock.com` is already written into the HTML, `sitemap.xml`, `robots.txt`, `_headers` and `bulk-redirects.csv`.

## 1. Before the first deploy

1. All three domains must be zones on the Cloudflare account (Add a site, then switch each registrar's nameservers to the two Cloudflare nameservers shown). Apex custom domains on Pages need the zone on Cloudflare.
   - `openworldclock.com`
   - `freewindowsworldclock.com`
   - `worldclock.download`
2. In PostHog (the project that will hold website data):
   - Project settings > Web analytics: turn on **Cookieless server hash mode**. Without it PostHog drops the site's events (the site runs `cookieless_mode: 'always'`).
   - Project settings: turn on **Discard client IP data**. The privacy page says IPs are not stored, so this must be on.
   - Copy the **Project API key** (`phc_...`) into `site/assets/config.js` (`posthogKey`) and into `POSTHOG_KEY` in `wrangler.toml` (the proxy only serves that project's remote config), and set `posthogUi` to your region.
3. Node 20 or newer. From this folder: `npm ci` (installs the pinned Wrangler from `package-lock.json`).

## 2. Create the Pages project and deploy

Direct Upload with Wrangler (the tested path):

```
cd cloudflare
npx wrangler login
npx wrangler pages project create open-world-clock --production-branch main
npm run deploy
```

`npm run deploy` first runs the launch gate (`check-links.mjs`, see below), then `wrangler pages deploy`, which reads `wrangler.toml`: it uploads `../site`, bundles `functions/` (which imports `lib/`), and applies `[vars]` (`POSTHOG_REGION`). Every later release is the same last command. Check the result on `https://open-world-clock.pages.dev` before attaching domains (that hostname answers with `X-Robots-Tag: noindex`, and redirects to the canonical once step 4 is done).

Because `wrangler.toml` holds the variables, the dashboard shows them read only. To change the region, edit `POSTHOG_REGION` (or add `POSTHOG_HOST`) in `wrangler.toml` and deploy again.

Git integration instead (optional): Workers & Pages > Create > Pages > Connect to Git, choose the repo, Root directory `cloudflare`, Build command empty, Build output directory `../site`. If the dashboard refuses an output directory outside the root, use Build command `cp -r ../site public`, Build output directory `public`, and set `pages_build_output_dir = "./public"` in `wrangler.toml`.

## Launch gate: dead Store, GitHub or download links block the deploy

`npm run deploy` runs `node check-links.mjs` first (npm's `predeploy` hook) and stops if it finds a problem. `npm run links` runs the check alone. It reads `storeLive`, `storeUrl`, `githubRepo`, `downloadBase` and `version` from `site/assets/config.js` and the version from the root `package.json`, and fails, with one line per problem, when:

- the `version` in `site/assets/config.js` is not the one in `package.json` (it builds the direct Installer and Portable download URLs, so a stale one sends people to last release's files or a 404). The line reads `site/assets/config.js says 1.1.0 but package.json is 1.2.0`
- the Store listing does not answer ok, or redirects to a `/404/` page (a listing that is not live yet answers 410). Only while `storeLive` is true; while it is false no Store URL is requested at all
- `https://github.com/<repo>` or `https://github.com/<repo>/blob/main/LICENSE` does not answer 200
- `downloadBase` is missing or not https, or `<downloadBase>/Open-World-Clock-<version>-setup.exe` or `-portable.exe` does not answer ok (not uploaded to R2 yet: see `../PUBLISHING.md`). The check cancels each body as soon as the answer arrives, so it never downloads the large exe files
- the file names in `download.html` (or in `pt/download.html` and `es/download.html`) are not those two names (`Open-World-Clock-1.2.0-setup.exe` and `-portable.exe`, as the build names them)
- freshness dates disagree (checked offline, before any request): a page in `site/sitemap.xml`, in any language (`/pt/features` is `site/pt/features.html`, `/es/` is `site/es/index.html`), whose JSON-LD `dateModified` differs from its `<lastmod>`, or a "Last updated" date in `llms-full.txt` or the privacy policy older than its own `<lastmod>` (each policy in its own words and months: "Last updated 25 September 2026", "Última atualização: 25 de setembro de 2026", "Última actualización: 25 de septiembre de 2026"). The line reads `site/meeting-planner.html dateModified 2026-09-23 but sitemap lastmod 2026-09-24`; bump both dates together when you edit a page
- any other Store or repo link in `site/*.html`, `site/pt/*.html`, `site/es/*.html`, `site/*.txt`, `site/api/app.json` or `site/site.webmanifest` does not answer ok. Links to download.openworldclock.com count too, so a link to an older version's exe must still be in the bucket. `/security/advisories/new` is skipped (it needs a sign-in), and Store links that differ only in `?cid=` count as the one listing

The Store answers quick repeat visits with 403, so its requests are spaced out and retried.

For a preview deploy before launch, `OWC_SKIP_LINK_CHECK=1 npm run deploy` skips the check with a loud warning. Never use it for the production deploy. In PowerShell, set and clear it on one line: `$env:OWC_SKIP_LINK_CHECK=1; npm run deploy; Remove-Item Env:OWC_SKIP_LINK_CHECK`. A variable set with `$env:` stays set for the rest of the session, so without the last step the next deploy would skip the check too. Running `npx wrangler pages deploy` directly also skips it, so deploy with `npm run deploy`.

## 3. Attach the custom domains

Workers & Pages > `open-world-clock` > Custom domains > Set up a custom domain, once for each of these six hostnames:

```
openworldclock.com
www.openworldclock.com
freewindowsworldclock.com
www.freewindowsworldclock.com
worldclock.download
www.worldclock.download
```

Because each zone is on Cloudflare, Pages adds the proxied CNAME record (to `open-world-clock.pages.dev`) and issues the certificate itself. Wait until each shows **Active**. Attaching every hostname means each one has a certificate and a proxied record, which the redirects in step 4 need; if a redirect were ever missing, the hostname would still serve the site, with `noindex` and a canonical link to openworldclock.com.

On each of the three zones, SSL/TLS > Edge Certificates: turn on **Always Use HTTPS**. Leave HSTS in the dashboard off: the canonical site already sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` from `_headers` (no `preload`; add it only once you are sure every subdomain will stay HTTPS for good).

## 4. Make openworldclock.com canonical (301 redirects)

Pages' `_redirects` cannot match on hostname, so the domain redirects are an account Bulk Redirect list. Bulk Redirects run before the Pages project.

1. Account home > Bulk Redirects > Create Bulk Redirect List. Name: `owc_canonical`. Content type: Redirect.
2. Upload `bulk-redirects.csv` (no header row). It creates:

| Source | Target | Options |
| --- | --- | --- |
| `freewindowsworldclock.com/` | `https://openworldclock.com/` | 301, preserve query string, include subdomains (covers `www.`), subpath matching, preserve path suffix |
| `worldclock.download/` | `https://openworldclock.com/` | 301, preserve query string, include subdomains (covers `www.`), subpath matching, preserve path suffix |
| `www.openworldclock.com/` | `https://openworldclock.com/` | 301, preserve query string, subpath matching, preserve path suffix |
| `open-world-clock.pages.dev/` | `https://openworldclock.com/` | 301, preserve query string, subpath matching, preserve path suffix (preview URLs such as `abc123.open-world-clock.pages.dev` are not redirected) |

3. Create Bulk Redirect Rule > pick `owc_canonical` > Save and Deploy.

Result: `https://worldclock.download/privacy?utm_source=x` answers `301 Location: https://openworldclock.com/privacy?utm_source=x`, and `http://` sources redirect straight to `https://openworldclock.com`.

Alternative without Bulk Redirects: on each extra zone, Rules > Redirect Rules > Create rule, Custom filter expression `(http.host in {"freewindowsworldclock.com" "www.freewindowsworldclock.com"})` (and likewise for the other zone, and `http.host eq "www.openworldclock.com"` on the canonical zone), Then: Dynamic, expression `concat("https://openworldclock.com", http.request.uri.path)`, status 301, Preserve query string on.

To add another domain later: add the zone, attach it as a custom domain (step 3), add a line to `bulk-redirects.csv` and to the list, and add a `noindex` block for it in `site/_headers`.

## 5. Zone settings that would break the CSP or the privacy promise

On `openworldclock.com` (and the Pages project):
- **Web Analytics** (Pages project > Metrics, or the zone's Web Analytics): keep automatic injection **off**. It would load a third-party beacon, which the CSP blocks and the privacy page does not mention.
- **Rocket Loader** (Speed > Optimization): **off**. It rewrites script tags, which breaks the CSP hashes.
- Bot Fight Mode JavaScript detections inject an inline script the CSP refuses; harmless, but leave it off to keep the console clean.

## 6. Test

After a deploy, from any terminal:

```
# security headers and cache rules
curl -sI https://openworldclock.com/ | grep -iE "content-security|strict-transport|x-content|referrer|permissions|cache-control"
curl -sI https://openworldclock.com/assets/fonts/outfit-var.woff2 | grep -i cache-control      # max-age=31536000, immutable

# the proxy: SDK from the asset host, same origin, no cookies
curl -sI https://openworldclock.com/ingest/static/array.js | grep -iE "^HTTP|content-type|set-cookie"   # 200, javascript, no set-cookie

# the proxy: an event reaches PostHog (replace the key; it appears in PostHog > Activity as "proxy_test")
curl -s -X POST https://openworldclock.com/ingest/i/v0/e/ -H "content-type: application/json" \
  -d '{"api_key":"phc_YOUR_KEY","event":"proxy_test","distinct_id":"proxy-test","properties":{"$process_person_profile":false}}'

# canonical redirects
curl -sI "https://worldclock.download/privacy?utm_source=x" | grep -iE "^HTTP|location"
curl -sI https://www.freewindowsworldclock.com/ | grep -iE "^HTTP|location"
curl -sI https://www.openworldclock.com/faq | grep -iE "^HTTP|location"

# 404 page with a real 404 status
curl -s -o /dev/null -w "%{http_code}\n" https://openworldclock.com/no-such-page
```

In a browser, open https://openworldclock.com with DevTools:
- Network, filter `ingest`: `array.js` (200) about a second after load, then `POST /ingest/e/` batches (200). No request to any other host.
- Application > Cookies: none. Local Storage: only `wc-theme` after using the theme button and `wc-lang` after picking a language (plus the web app's own settings once you use it).
- PostHog > Activity (or Web analytics): `$pageview` and the site's events arrive within a minute.
- With Global Privacy Control on (Firefox: Settings > Privacy > Tell websites not to sell or share my data; Brave: on by default) or Do Not Track on, reload: no `ingest` requests at all.

Logs from the proxy: `npx wrangler pages deployment tail --project-name open-world-clock`.

## Local testing

```
cd cloudflare
npm install
npx wrangler pages dev --port 8788
```

This serves `../site` with the real `_headers`, `_redirects` and `_routes.json` and runs the Function locally, at http://localhost:8788. To exercise the proxy without sending anything to PostHog, point it at a local stand-in: `npx wrangler pages dev --port 8788 --binding POSTHOG_HOST=http://127.0.0.1:9999 --binding POSTHOG_ASSET_HOST=http://127.0.0.1:9999`. The pages themselves never send analytics locally: `analytics.js` runs only when the hostname is `siteHost` in `site/assets/config.js` (`openworldclock.com`), so exercise the proxy with `curl` as in the Test section.

On Windows, if the build fails with "Unexpected import in JSON" pointing at a `package.json` in your temp folder, run Wrangler from this folder's own `node_modules` (`npm install` here), not from a copy installed under `%TEMP%`.

## Maintenance

### Search publishing

- Run `npm run prepare:site` to regenerate the curated pages, language links, sitemap, asset hashes and CSP. `npm run seo` is the read-only search gate; it also runs before deployment.
- `npm run deploy` now runs an IndexNow postdeploy hook. It verifies the public key file before notifying `https://api.indexnow.org/indexnow`. The key is public proof of site ownership, not a credential. `indexnow-key.txt` and its matching file in `site/` must stay in sync.
- `npm run indexnow` is a dry run. `node indexnow.mjs --submit` retries notification after a successful deployment. The local manifest is `.wrangler/seo-indexnow-state.json`; preserve it between deploys to send only changed and deleted URLs. The first run submits the full canonical sitemap. An unsuccessful notification leaves the manifest unchanged, and does not undo a deployment. Receipt is not a promise of indexing.
- Google does not use IndexNow. Verify a Search Console domain property for `openworldclock.com`, using the exact DNS token Google supplies; then submit `https://openworldclock.com/sitemap.xml`. Inspect `/`, `/time-zone-converter`, `/meeting-planner`, `/london-to-new-york-time`, `/pt/` and `/es/`. Check Google-selected canonicals and indexing exclusions. No verification token is fabricated in the repository.
- In Bing Webmaster Tools, import the verified Google property or use Bing's own verification method. Submit the same sitemap and inspect the same priority pages. Check Cloudflare's verified-bot logs before changing any bot rules.

### Weekly search review

Track Google and Bing separately: non-brand clicks and impressions, priority-page indexing, query/page CTR, and country/device/language. Compare each page's organic visits with trusted `tool_used` / `hero_app_used`, then Store or installer clicks. A Store click is not an install; confirmed installs require Microsoft's acquisition reports. Cookieless analytics with opt-outs are directional, not a complete census.

Use the existing events to create: (1) an organic landing-page trend, (2) a landing-page to tool-action to download-click funnel, (3) a language/device breakdown. Search Console and Bing provide the search-query side; keep personal city selections out of analytics. Real-user LCP/INP/CLS should be reviewed in Search Console/PageSpeed when traffic is sufficient, alongside the local browser metrics.

The first content pilot is ten city pairs in three languages. Review indexing and useful interactions before adding more routes. `/press` supplies facts, screenshots, logo files and the contact link for editorial coverage; contact publishers individually only when outreach is authorized. No automated outreach is performed by deployment.

- Before a release: `npm run links` (the deploy runs it anyway). After changing `check-links.mjs`, `npm test`.
- Edited a nav or footer label, or added a page? Edit the table in `site-chrome.mjs` and run `node cloudflare/site-chrome.mjs --write` (or `npm run chrome:write` here), then `npm test`.
- Edited an inline `<script>` in `site/*.html` (or the Portuguese and Spanish pages)? Run `node cloudflare/csp-hashes.mjs --write` (or `npm run csp:write` here) before deploying; `npm run csp` checks without writing.
- Caching: static responses explicitly use `public, max-age=0, must-revalidate, no-transform` (so a deploy shows at once and repeat visits get 304s). The `no-transform` directive prevents Cloudflare from injecting its Web Analytics beacon into the tested HTML. Keep the existing consent and privacy controls in `analytics.js`; do not enable a second analytics script at the edge. Fonts are cached for a year, images and icons for a week. If CSS or JS ever get content hashes in their names, give them a year with `immutable` in `_headers`, detaching the default Cache-Control before setting an asset-specific policy and retaining `no-transform` (overlapping rules otherwise join with a comma).
- Costs: only `/ingest/*` runs the Function (`_routes.json`); each analytics request counts toward the Workers requests quota (100,000 a day on the free plan). Static files are free and unmetered.
