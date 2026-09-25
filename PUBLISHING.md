# Publishing Open World Clock

Two channels for the Windows app: Microsoft Store (primary, signed by Microsoft) and website download
(portable exe + installer). Both builds come from the same source. The web app on the home page, https://openworldclock.com/, is
built from the same renderer by `scripts/build-web.mjs` and goes out with the website ([web/README.md](web/README.md)).

## Commits

Commits use the GitHub noreply address (`git config user.email` is
`14310755+joaoCarvalho1000@users.noreply.github.com`) and never carry `Co-Authored-By:` trailers. Some commit tools
add those by default, so check before every push:

```
git log origin/main..HEAD --format='%ae %ce' | sort -u          # prints only the noreply address
git log origin/main..HEAD --format=%B | grep -ci co-authored     # prints 0
```

GitHub > Settings > Emails has "Keep my email addresses private" and "Block command line pushes that expose my email"
turned on, so GitHub also refuses a push that carries a private address. A `.mailmap` does not fix an address after
the fact: GitHub shows the address stored in each commit.

## Contact address

The public contact address is in all of these, and they must always show the same address:
- the Contact line in PRIVACY.md
- the link text and the `mailto:` in site/privacy.html, site/pt/privacy.html and site/es/privacy.html
- the JSON-LD `email`, the mail button and the text on site/support.html, site/pt/support.html and site/es/support.html
- the "Support and contact" line in site/llms-full.txt
- the Support contact info row in [store/properties.md](store/properties.md)

The iPhone app's Support URL needs it too (see [apple/README.md](apple/README.md)). It should be an address on the
domain, forwarded by Cloudflare Email Routing (dashboard > openworldclock.com > Email > Email Routing). To change it,
send the new address a test mail from another account first: a privacy policy that points to a dead mailbox is worse
than an old address. Then change every place above on the same day, set "Last updated" on PRIVACY.md and the three
privacy pages (with the matching `lastmod` in site/sitemap.xml, which `cloudflare/check-links.mjs` checks), and run
`git grep -n` with the old address to confirm it is gone.

## One-time setup

1. The GitHub repo is https://github.com/joaoCarvalho1000/open-world-clock and `package.json` already points
   at it (`homepage` https://openworldclock.com, `repository.url`, `build.publish` owner `joaoCarvalho1000`,
   repo `open-world-clock`).
2. Register a Microsoft Partner Center developer account
   (https://partner.microsoft.com/dashboard). Individual accounts pay a one-time fee.
3. In Partner Center: Apps and games > New product > MSIX or PWA app. Reserve the
   name "Open World Clock" (or a variant if taken).
4. Open the product > Product management > Product identity and check that these three values match
   `package.json` under `build.appx` (they are already set; see [store/README.md](store/README.md), Step 0):
   - Package/Identity/Name -> `identityName`
   - Package/Identity/Publisher -> `publisher`
   - Package/Properties/PublisherDisplayName -> `publisherDisplayName`
5. Host the `site/` folder somewhere public (it is on Cloudflare Pages, see `cloudflare/`).
   The Store listing requires a privacy policy URL: https://openworldclock.com/privacy (`site/privacy.html`).

## Every release

1. Bump `version` in `package.json`. The Store requires a strictly increasing version.
2. Start from an empty `dist/`: move or delete everything in it first (the screenshots in `dist/shots` come back
   with the next `npm run shots`). Old builds stay in `dist/` between runs, for example files named
   `Open World Clock-1.2.0-...` with spaces, or an `Open World Clock-1.2.0.appx` with no architecture, from before
   the naming below, and it is easy to upload one by mistake. Then run `npm run dist:all`. It produces in `dist/`:
   - `Open-World-Clock-x.y.z-portable.exe` for the website, runs without installing
   - `Open-World-Clock-x.y.z-setup.exe` website installer, with `Open-World-Clock-x.y.z-setup.exe.blockmap` and
     `latest.yml` next to it
   - `Open-World-Clock-x.y.z-x64.appx` and `Open-World-Clock-x.y.z-arm64.appx` Store packages (unsigned; the
     Store signs them). `build.appx.artifactName` includes `${arch}` so the two architectures do not overwrite
     each other. `build.appx.minVersion` is `10.0.17763.0` (Windows 10 1809), written to the manifest's
     `TargetDeviceFamily MinVersion`: the oldest Windows the packages install on.

   The names use hyphens, not spaces (every `artifactName` in `package.json`). GitHub turns spaces in uploaded file
   names into dots, and `latest.yml` names the installer `Open-World-Clock-x.y.z-setup.exe` in its `url` and `path`
   fields, so with hyphens the files keep their names on upload and match `latest.yml`.

   Release checklist, before uploading anything. Run each from the repo root after the build; each one exits
   non-zero on a problem, and nothing gets uploaded until all three pass:
   - `node scripts/build-icons.mjs --check`: every icon, Store tile and logo image matches the masters in
     `build/logo/`. It needs `@resvg/resvg-js`, so run `npm install` in `build/icons-tools` once on a new PC. If it
     reports outdated files, run `node scripts/build-icons.mjs`, commit the result and build again.
   - `node scripts/build-web.mjs --check`: `site/app/` (the web app) is what `src/renderer/` and `web/` give today.
     The web app shows the version from `package.json`, so after the bump in step 1 this fails until you run
     `node scripts/build-web.mjs` and commit `site/app/`.
   - `node scripts/smoke-packaged.mjs`: starts a copy of `dist/win-unpacked` with a throwaway profile and exits
     non-zero if the packaged window did not load (fuses, asar integrity, missing files), which `npm test` cannot
     catch because it runs the unpackaged app.
3. Store: Partner Center > your product > Start new submission > Packages > upload
   both `.appx` files (the Store serves the right one per device). Fill the Store listing (description, screenshots 1366x768 or larger,
   privacy URL), the age rating questionnaire, and set pricing to Free. Submit.
   Certification usually takes 1 to 3 business days.
   The Store build hides the Ko-fi support link (Settings and tray): Store policy restricts external payment
   links, and the app hides it whenever `process.windowsStore` is set.
4. Website downloads: the installer and the portable exe are served from Cloudflare R2 (bucket `owc-downloads`,
   custom domain https://download.openworldclock.com), not from GitHub Releases. After the build and the release
   checklist above, upload both files from `dist/` as they are, with no renaming. From the repo root:

   ```
   cd cloudflare
   npx wrangler r2 object put "owc-downloads/Open-World-Clock-<version>-setup.exe" --file "../dist/Open-World-Clock-<version>-setup.exe" --content-type application/vnd.microsoft.portable-executable --cache-control "public, max-age=31536000, immutable" --remote
   npx wrangler r2 object put "owc-downloads/Open-World-Clock-<version>-portable.exe" --file "../dist/Open-World-Clock-<version>-portable.exe" --content-type application/vnd.microsoft.portable-executable --cache-control "public, max-age=31536000, immutable" --remote
   ```

   Replace `<version>` with the version, for example 1.3.0. The files are cached as immutable for a year, so never
   upload a changed file under a name that is already in the bucket: a fix gets a new version. Old versions stay in
   the bucket, so links to them keep working. Check both answer before going on:
   `curl -I https://download.openworldclock.com/Open-World-Clock-<version>-setup.exe` (and the same for
   `-portable.exe`) prints `200` and the file size.

   Then publish the checksums: `Get-FileHash dist\Open-World-Clock-<version>-setup.exe` (and `-portable.exe`) in
   PowerShell, and put the two SHA-256 values, in lower case, in the `<p class="sha">` lines under the Installer and
   Portable exe steps of `site/download.html`, `site/pt/download.html` and `site/es/download.html`, and in the
   Installer and Portable exe options of `site/llms-full.txt`.

   A GitHub Release tagged `vx.y.z` is still useful for release notes once the repo is public (and it is what the
   automatic updater would read, see "How releases feed auto-update" below), but the site does not link its files.

   The workflow in [.github/workflows/release.yml](.github/workflows/release.yml) can build the installer and the
   portable exe on a clean Windows runner instead of your PC: commit the version bump, then push the tag
   (`git tag vx.y.z`, `git push origin vx.y.z`). It checks that the tag matches `version` in `package.json`, runs
   the packaged smoke test, records a build provenance attestation and creates a draft release with the files.
   Download the two exe files from the draft and upload those to R2 as above. `gh attestation verify <file> -R
   joaoCarvalho1000/open-world-clock` then confirms a file was built by that workflow from this repo. The workflow
   does not build the Store packages: build the two `.appx` files on your PC as in step 2.
5. Site: the Installer and Portable buttons download `<downloadBase>/Open-World-Clock-<version>-setup.exe` and
   `-portable.exe` (`downloadBase` in `site/assets/config.js`), so the site does not follow the upload on its
   own. Do the steps under "Each release" in [site/README.md](site/README.md): bump `version` in
   `site/assets/config.js`, update the static HTML and the checksums, check that `site/app/` was rebuilt for this
   version (`node scripts/build-web.mjs --check`, step 2), then run `npm run deploy` in `cloudflare/`. The deploy
   uploads `site/` as it is, with no build step, and its link check stops it if either file does not answer on
   download.openworldclock.com or the site names other files.

   The Store switch: while the Microsoft Store listing is not approved, `storeLive` is `false` in
   `site/assets/config.js` and the site offers only the installer and the portable exe (no Store buttons, no winget
   steps; the Store is "coming soon"). When the listing goes live, set it to `true`, run
   `node cloudflare/site-chrome.mjs --write` and do the text steps under "The Store switch" in
   [site/README.md](site/README.md).

### winget (installer build)

The Store build is already on winget through the msstore source: `winget install 9N88FR8M81BM -s msstore`, the
command on the site, works once the Store listing is live. This adds the installer build to the community repo
(microsoft/winget-pkgs) so `winget install openworldclock` works too. It needs
[wingetcreate](https://github.com/microsoft/winget-create) and runs after the installer is uploaded to R2, because
winget checks the installer against its SHA256 and that hash only exists once the file is up. That is also
why no manifests live in this repo.

- First release on winget: run
  `wingetcreate new https://download.openworldclock.com/Open-World-Clock-x.y.z-setup.exe`.
  It downloads the installer, computes the SHA256 itself and asks for the rest: identifier
  `JoaoCarvalho.OpenWorldClock`, moniker `openworldclock`, installer scope `user`, architecture `x64`, license `MIT`,
  short description = the tagline ("The best world clock for Windows. Completely free, no strings attached."). Let it
  submit the pull request to microsoft/winget-pkgs at the end.
- Later releases: run
  `wingetcreate update JoaoCarvalho.OpenWorldClock -u https://download.openworldclock.com/Open-World-Clock-x.y.z-setup.exe -v x.y.z --submit`. Old versions stay in the bucket, so the manifests of earlier versions keep working.

Once the first winget-pkgs pull request is merged, add `winget install openworldclock` next to the msstore command
on the download page, in all three languages (`site/download.html`, `site/pt/download.html`, `site/es/download.html`).

## First public launch (order matters)

Each step depends on the one before it, so do them in this order:

1. The contact address works and is the same everywhere listed under [Contact address](#contact-address), and the
   commits pass the checks under [Commits](#commits).
2. Either the Store listing is published (https://apps.microsoft.com/detail/9N88FR8M81BM loads in a private window,
   that Store ID is the one in `storeUrl` in `site/assets/config.js`, and `storeLive` is `true` there, see
   Every release, step 5), or `storeLive` stays `false` and the site launches with the installer and the portable
   exe only.

### Repository settings on day one

Set these on https://github.com/joaoCarvalho1000/open-world-clock/settings. About, the social preview, Wiki and
Projects and Dependabot alerts can be set while the repo is still private. On a free personal account GitHub only
offers private vulnerability reporting, secret scanning, push protection and rulesets on public repos, so do those
the moment launch step 3 below makes it public, before launch step 4, and test the advisory form then (another
account cannot open a private repo).

1. Settings > Advanced Security (Code security): turn on Private vulnerability reporting. Then open
   https://github.com/joaoCarvalho1000/open-world-clock/security/advisories/new signed in as another account and
   check the form loads. [SECURITY.md](SECURITY.md), `site/.well-known/security.txt` and
   [.github/ISSUE_TEMPLATE/config.yml](.github/ISSUE_TEMPLATE/config.yml) all send reporters there, and
   `cloudflare/check-links.mjs` skips that URL (it needs a sign-in), so this is the only check it gets.
2. On the same page: turn on Secret scanning, Push protection, Dependabot alerts and Dependabot security updates.
   Version updates come from [.github/dependabot.yml](.github/dependabot.yml).
3. Settings > Rules > Rulesets > New branch ruleset: target `main`, turn on "Restrict deletions" and "Block force
   pushes". Do not require status checks or pull requests: changes are pushed straight to `main`.
4. About (the gear next to About on the repo page): description = the tagline, "The best world clock for Windows.
   Completely free, no strings attached.", website https://openworldclock.com, topics `world-clock`, `time-zones`,
   `windows`, `electron`, `meeting-planner`, `open-source`.
5. Settings > General > Social preview: upload `site/assets/og.png`.
6. Settings > General > Features: turn off Wiki and Projects, keep Issues on, and turn on Sponsorships. The Sponsor
   button then reads [.github/FUNDING.yml](.github/FUNDING.yml), which points to Ko-fi. That is the repo page, not the
   Store build, so the Store rule against payment links does not apply to it.

### Public repo, release and announcement

3. The GitHub repo is public, with LICENSE on `main` (the Store listing's license terms and the site link to it).
4. `Open-World-Clock-1.3.0-setup.exe` and `Open-World-Clock-1.3.0-portable.exe` from a fresh `dist/` are in the
   R2 bucket and answer on https://download.openworldclock.com, as in [Every release](#every-release), step 4, and
   their SHA-256 values are on the download page in all three languages and in `site/llms-full.txt`.
5. The site uses those same file names: the direct download URLs built in `site/assets/config.js` (from
   `downloadBase` and `version`), and the names printed in `site/download.html`, `site/index.html` and
   `site/llms-full.txt`.
6. In `cloudflare/`, `npm run links` passes. It checks that the version in `site/assets/config.js` matches
   `package.json`, the repo page, the LICENSE, that both exe files answer on download.openworldclock.com, that
   download.html names them exactly, the Store listing once `storeLive` is true, and every other Store, GitHub and
   download link on the site (the numbered list at the top of `cloudflare/check-links.mjs`). Then run
   `npm run deploy`: its `predeploy` script runs the same check and stops the deploy if anything fails.
   `OWC_SKIP_LINK_CHECK=1` skips the check and is only for preview deploys.
7. Only then announce (ROADMAP item 19). Tag every link with the channel it is posted on:
   - Store links get `?cid=launch-<channel>`. Partner Center groups acquisitions by that campaign ID.
   - Site links get `?utm_source=<channel>&utm_medium=social&utm_campaign=launch-1.3.0`. These `utm_*` parameters
     are the only query parameters the site's analytics keep (`KEEP_QUERY` in `site/assets/analytics.js`).

## Product name and identifiers (renamed from "World Clock")

The product was renamed from "World Clock" to "Open World Clock". Only display names changed; these identifiers
must stay as they are so existing installs upgrade in place instead of installing side by side:
- `build.appId` (`io.joao.worldclock`): the NSIS installer derives its uninstall/registry GUID from it, and the app
  uses it as the Windows AppUserModelId (taskbar grouping, login item).
- package `name` (`world-clock-widget`): the one-click per-user installer uses it as the install folder
  (`%LOCALAPPDATA%\Programs\world-clock-widget`). It stays, even though "widget" is not how the app is described
  anywhere else. A new name moves the install folder, so an upgrade would put the app in a second folder, and the
  cleanup in `src/main.js` that re-points an old login item looks for the renamed exe (`World Clock.exe`,
  `Free World Clock.exe`) in the current exe's own folder. Nobody sees the name except in that path. Settings do not
  depend on it: userData follows `productName`.
- `build.appx.identityName` and `build.appx.applicationId`: changing either makes the Store treat it as a different app.
- The appx startup task id (`WorldClockStartup` in `build/appx-extensions.xml`).

Electron stores settings under `%APPDATA%\<productName>`, so the folder moved to `%APPDATA%\Open World Clock`.
On first launch the app copies `settings.json` (and `.bak`) from `%APPDATA%\World Clock` (or
`%APPDATA%\Free World Clock`) when the new folder has none; the old folder is left in place.

## How releases feed auto-update (installer build only)

The NSIS installer build uses `electron-updater` with the `github` publish entry
in `package.json` (owner `joaoCarvalho1000`, repo `open-world-clock`). It is off until a signed build sets
`build.extraMetadata.wcUpdates` to `true` (the default package.json keeps it `false`). Once enabled, the app
checks 10 seconds after launch and every 6 hours, downloads silently, and notifies
the user; errors are ignored. The portable exe and the Store build never self-update.

Turning on `wcUpdates` requires `electron-updater` in `dependencies`. It is in `devDependencies` today, and
electron-builder only packs `dependencies`, so a build with `wcUpdates: true` but without the move would ship no
updater and nobody would get updates. `scripts/after-pack.js` stops such a build with an error that says what to
move. The build log shows `auto-update on (electron-updater packaged)` or `auto-update off`; the default build
(`wcUpdates: false`) never loads the module. Move it in the same commit that sets `wcUpdates` to `true`, and after
the build check that
`dist/win-unpacked/resources/app.asar` contains `node_modules/electron-updater`
(`node node_modules/@electron/asar/bin/asar.js list dist/win-unpacked/resources/app.asar | findstr electron-updater`
prints lines; `@electron/asar` comes with electron-builder).

For each release, the GitHub Release must carry these files from `dist/`, uploaded as they are (see
[Every release](#every-release), step 4):
- `latest.yml` (generated in `dist/` by the nsis target; the updater reads this)
- `Open-World-Clock-x.y.z-setup.exe`: the name in the `url` and `path` fields of `latest.yml`. `nsis.artifactName`
  uses hyphens so the uploaded name matches; with spaces, GitHub would store it as `Open.World.Clock-x.y.z-setup.exe`
  and the updater would not find it.
- `Open-World-Clock-x.y.z-setup.exe.blockmap` (enables differential downloads; the updater looks for the
  installer's name plus `.blockmap`)
- `Open-World-Clock-x.y.z-portable.exe` for the website (never updates itself)

The release must be published (not draft, not prerelease) for clients to see it.
Alternatively, `GH_TOKEN=... npx electron-builder --win nsis --publish always`
creates a draft release with the installer files uploaded; check that the asset names match the list above, add
the portable exe, then publish it.
Code signing is strongly recommended: unsigned updates still install but show
SmartScreen warnings.

## Launch at login in the Store build

MSIX packages cannot use `app.setLoginItemSettings`. The startup task comes from
`build/appx-extensions.xml` (wired through `build.appx.customExtensionsPath`): a `windows.startupTask`
extension with TaskId `WorldClockStartup`, declared `Enabled="false"`. `build.appx.addAutoLaunchExtension`
is `false`, so electron-builder does not add a second one. The user turns it on in Settings > Apps > Startup
(or Task Manager > Startup apps). The app reports `store: true`, so Settings shows the switch
disabled, with a note and an "Open Startup apps" button, and the tray shows a disabled hint instead of the checkbox.

## Store test before submitting

Install the appx locally to verify it launches as a packaged app:

```
Add-AppxPackage -Path ".\dist\Open-World-Clock-x.y.z-x64.appx" -AllowUnsigned
```

If Windows refuses unsigned packages, enable Developer Mode in Settings > System >
For developers, or use the Windows App Certification Kit on the appx.

## Code signing for the website build (recommended)

Unsigned exes trigger the SmartScreen "Unknown publisher" warning. Options:
- Azure Trusted Signing: monthly subscription, integrates with electron-builder via
  `win.azureSignOptions`. Cheapest route for an individual or small business. Check that individual developers in
  your country can sign up before planning around it; eligibility has been limited by region.
- OV certificate from a CA (Sectigo, DigiCert): set `win.certificateFile` and the
  `CSC_KEY_PASSWORD` environment variable, or `win.signtoolOptions` for an HSM token.
- SignPath Foundation: free for open source projects under an OSI-approved license (this one is MIT). It signs
  builds made by a CI workflow, such as [.github/workflows/release.yml](.github/workflows/release.yml), not builds
  from your PC, and the certificate names SignPath Foundation as the publisher, not you. Apply after the repo is
  public: the project has to be public to qualify.
SmartScreen reputation still builds over time even with a valid signature.
The Store build needs no certificate.

## Store listing copy

Listing text, screenshots and certification notes live in `store/` (see [store/README.md](store/README.md)).
