# Open World Clock for iPhone (native port)

Native SwiftUI app + WidgetKit extension that ports the Windows app (Electron) to iPhone. Everything Apple-specific lives in `apple/`; the Electron app in `src/` is untouched and stays the source of truth for time math, zones and strings.

## Status

Verified 2026-09-24 on Windows 11 with Swift 6.4 (swift-6.4-RELEASE) + VS 2022 Build Tools (MSVC 14.44, Windows 11 SDK).

| Check | Result |
| --- | --- |
| `swift test` (WorldClockCore, Windows) | 74 XCTest tests, 0 failures, 0 skipped |
| Golden parity vectors (`shared/golden.json`, Node 24.19 / ICU 78.3 / tz 2026b) | 1219 vectors plus 22 map-constant checks, tzdata allow-list empty |
| Map label placement (`MapLabels`, port of map.js `placeLabels`) | exact map.js results for fixed layouts and 200 seeded random layouts; no pill leaves the map, overlaps another pill or covers a dot |
| Shared/L10n.swift, SharedFormatting.swift, SharedModel.swift, WorldClock/Models/Conversion.swift, CopyText.swift, App/AppModel.swift, WorldClockWidgets/WidgetData.swift, plus the map pill glue in Views/Map/WorldMapScreen.swift (`labelPlacements`, `MapPillMetrics`) and the planner summary in Views/Planner/PlannerScreen.swift (`summary`, `rangeText`) | type-checked against WorldClockCore on Windows with small stubs for UIKit/WidgetKit/TipKit symbols (0 errors, 0 warnings, `-warnings-as-errors`) |
| Shared helpers at runtime (Windows) | overnight working-hours bands agree with `Planner.isWorking` over two weeks in 3 zones; display list, device-zone validation, clock-change cache, spoken-offset keys, civil dates (22 checks); `AppModel` first-run cities, widget deep links (live tap, shifted tap, expired shift, unlisted city, no city), `startConverting` with the convert tip invalidation, and the planner summary text in English (19 checks); legacy device zone ids mapped to canonical names, such as Europe/Kiev to Europe/Kyiv with no second Home card (5 checks); `FirstRun` settings shared by `AppModel` and the widgets, the read-only widget path before the app ran and the gallery sample with 4 different clocks (14 checks); the region-aware date locale `L10n.locale(current:)` for en_GB, en_US, pt_PT, pt_BR, es_MX and Spanish on an en_US device, with unchanged `formatTime` strings for en-US, pt-BR and es-419 (16 checks); `Palette.accentText` at 4.94:1 or better on 60 surface pairs (2 checks) |
| All app + widget Swift files (18 + 6, plus 4 in Shared) | `swiftc -parse` clean (syntax only; SwiftUI/WidgetKit/AppIntents not available on Windows) |
| String catalogs | `Localizable.xcstrings`: every i18n.js key plus the 45 native-only keys of `shared/strings-native.json` (incl. the 9 `widget.intent.*` App Intents strings, `settings.privacyPolicy` and `plan.legend.best`), written by `scripts/export-shared.mjs` then `scripts/export-xcstrings.mjs`; `Widgets.xcstrings` 7 keys; en / pt-BR / es complete, placeholders match; every literal `L10n.tr` / `LocalizedStringResource` / widget-table key exists. Both checks are enforced by `StringCatalogTests` in `swift test`, which names the missing keys |
| `swift test` (WorldClockCore, macOS) | not run yet; see the iOS workflow in GitHub Actions |
| `xcodegen generate` + `xcodebuild` (app + widgets) | not run yet (no Mac available); see the iOS workflow in GitHub Actions |

On Windows, run `swift test` from a shell with the MSVC environment loaded (VsDevCmd.bat / Launch-VsDevShell.ps1) and `SDKROOT` set, otherwise SwiftPM reports "could not find CLI tool `link`" or "unable to load standard library".

## Architecture

```
 src/renderer/*.js  (Electron app: time.js, sun.js, zones.js, i18n.js, app.js helpers)
        |
        |  node scripts/export-shared.mjs      (runs the real JS in node:vm sandboxes)
        v
 shared/zones.json  shared/strings.json  shared/world-land.json  shared/golden.json
        |                     |
        |  sync-resources.mjs |  node scripts/export-xcstrings.mjs
        v                     v
 apple/WorldClockCore/     apple/Shared/Localizable.xcstrings  (en, pt-BR, es)
 (Swift package,           apple/Shared/L10n.swift, SharedFormatting.swift, SharedModel.swift, Color+RGBA.swift
  Foundation only)                       |
        |                                |   (compiled into BOTH targets)
        +---------------+----------------+
                        |
          +-------------+--------------+
          v                            v
   WorldClock (app)            WorldClockWidgets (extension)
   apple/WorldClock/           apple/WorldClockWidgets/
          |                            ^
          |   App Group UserDefaults   |   SettingsStore.shared (key "settings.v1", JSON AppSettings)
          +---- group.io.joao.worldclock.shared ----+
          |                            |
          |   WidgetCenter.reload...   |   ShiftTimeIntent writes widgetShiftMinutes / widgetShiftExpires
          +<------ worldclock:// deep links -------+
```

- **WorldClockCore** (`apple/WorldClockCore`, Swift package, `Foundation` only, builds on Windows/Linux/macOS): time zone math, clock text, parse-time, sun position and phases, sky gradients and palette, zone catalog and search, working hours and meeting planner, clock-change notes, settings model and App Group store, deep links, world map helpers and collision-free map label placement, widget timeline dates. The public API is frozen in [`CORE_API.md`](CORE_API.md); app and widgets use only that.
- **apple/Shared**: localization helper `L10n.tr(key, vars)` (resolves the language chosen in settings through `AppLanguage` + the matching `.lproj`), shared formatting (`WCFormat`: clock text, day markers, durations, sunrise/sunset line, spoken offsets, VoiceOver summaries), shared model helpers (`SharedModel.swift`: `DeviceZone` validation with legacy ids mapped to canonical names, `DisplayZones` list, `FirstRun` settings, overnight-aware `WorkBands`, per-minute `ClockChangeCache`, `Calendar.gregorianUTC`, `Palette.accentFill` for filled shapes under white text and `Palette.accentText` for accent text), the RGBA to `Color` bridge, and the generated String Catalog. Compiled into both targets, so the app and the widgets agree on the device zone, the default city list and working-hours drawing.
- **WorldClock app** (`apple/WorldClock`): SwiftUI screens (clock cards, converter, planner, map, settings). Saves settings through `SettingsStore.shared` and calls `WidgetCenter.shared.reloadAllTimelines()` after every save and whenever the device time zone changes.
- **WorldClockWidgets** (`apple/WorldClockWidgets`, bundle id `io.joao.worldclock.widgets`):
  - `City Clock` (`SelectCityIntent`): systemSmall (sky gradient, big thin digits, StandBy layout), accessoryCircular (gauge = position in the local day), accessoryInline ("Tokyo 21:05").
  - `World Clocks` (`SelectCitiesIntent`, array of `CityEntity`, at most 4 / 6 / 3 cities per family via the parameter's `size`): systemMedium (up to 4 rows), systemLarge (up to 6 rows with a 24 h day line: night shading, working-hours band, now dot), accessoryRectangular (3 rows).
  - Empty configuration = the same list the app shows (`DisplayZones`: the device zone first unless it is saved, then `settings.zones`). Before the app was ever opened, the widgets read `FirstRun.settings` (the locale's 12/24 h and the first-run cities) without writing anything; the gallery sample uses the same first-run cities. `CityEntity.id` is the IANA zone; its query uses `Search.search` and suggests that list.
  - Timeline: `TimelineDates.entries(from:minutes: 90, zones:)` (one entry per minute plus each city's sunrise/sunset so day/night surfaces flip on time), policy `.atEnd`. Digits are precomputed `ClockText` per entry, because `Text(date, style: .time)` cannot show another zone.
  - Interactive buttons (`Button(intent:)`): `ShiftTimeIntent(minutes: 60)` "+1 h" and `ShiftTimeIntent(minutes: 0)` "Now". The shift expires one hour after the last tap (`AppSettings.effectiveShift(at:)`); shifted times use the accent color and show a badge.
  - Deep links: a city (`worldclock://convert?zone=<IANA>`) opens the app at that city: live Clocks, scrolled to the city and outlined for a moment (`AppModel.focusZone`); while the widget is shifted (+1 h) it opens the converter at the shifted time instead, and the shift ends. A city the app does not list, or the Lock Screen rectangular widget (no city), just opens Clocks. The large widget header opens `worldclock://planner`.
  - Rendering modes: full color draws day (light) and night (navy) surfaces; StandBy, the iOS 18 tinted/clear Home Screen and the Lock Screen drop the background and fall back to hierarchical styles, with the digits marked `.widgetAccentable()`.
  - Strings: App Intents titles, descriptions and parameter names use `widget.intent.*` keys in the default table (`Localizable.xcstrings`, from `shared/strings-native.json`), because the App Intents metadata step always resolves the default table. Only the gallery names/descriptions and the "Now" / button hints stay in `apple/WorldClockWidgets/Widgets.xcstrings`; everything else comes from the shared catalog via `L10n.tr`.

Identifiers: app `io.joao.worldclock`, widgets `io.joao.worldclock.widgets`, App Group `group.io.joao.worldclock.shared`, URL scheme `worldclock` (`worldclock://convert?zone=…`, `planner`, `map`, `settings`).

## What is shared and what is native

| Area | Source of truth | How parity is enforced |
| --- | --- | --- |
| Offsets, zoned-to-epoch (DST gaps/overlaps), day diff, relative labels, parse-time | `src/renderer/time.js`, `app.js` helpers | Ported to Swift; `shared/golden.json` vectors are generated by executing the JS and asserted by `WorldClockCoreTests` |
| Sun altitude, sunrise/sunset, phases, sky phase | `sun.js`, `app.js sunPhase`, `motion/sky.js` | Golden vectors (60 s tolerance for sun times, 0.01° for altitude) |
| Zone metadata, coordinates, abbreviations, default cities | `zones.js`, `app.js ABBR`, `main.js DEFAULTS` | Exported to `shared/zones.json` and bundled as a package resource, not re-typed |
| Search ranking, offset queries | `app.js searchZones` / `parseOffsetQuery` | Golden vectors (first result + inclusion, because ICU zone lists differ per OS) |
| Working hours and planner | `app.js isWorking` / `buildPlanner` | Golden vectors |
| Clock-change notes | `app.js nextOffsetChange` / `dstNote` | Golden vectors |
| UI strings | `src/renderer/i18n.js` | Exported to `shared/strings.json`, then `Localizable.xcstrings`; `{name}` placeholders kept and filled by `Template.fill` |
| Colors | `style.css`, `motion/sky.css` | oklch tokens converted to sRGB in `Sky`/`Palette` |
| UI, widgets, intents, App Group storage, deep links | native only | Manual checklist below |

## Regenerating shared data

From the repo root (Node 20+):

```sh
node scripts/export-shared.mjs && node scripts/export-xcstrings.mjs && node apple/WorldClockCore/sync-resources.mjs
```

- `export-shared.mjs` writes `shared/*.json` from the renderer JS (idempotent, pinned dates).
- `export-xcstrings.mjs` writes `apple/Shared/Localizable.xcstrings` from `shared/strings.json`.
- `sync-resources.mjs` copies `shared/*.json` into the WorldClockCore package resources.

Strings that exist only in the native app (not in `i18n.js`) live in `shared/strings-native.json` and are merged into the same catalog; that includes the widget's App Intents strings (`widget.intent.*`). The few remaining widget-only strings (gallery names and descriptions, "Now", button hints) are in `apple/WorldClockWidgets/Widgets.xcstrings`, edited by hand.

Then run the core tests. Commit the regenerated files together with the JS change that caused them.

## Core tests

**Windows**
1. Install the Swift toolchain: `winget install --id Swift.Toolchain -e`. It needs the Visual Studio Build Tools with the "Desktop development with C++" workload (MSVC + Windows SDK); install them first if `swift --version` or linking fails (`winget install --id Microsoft.VisualStudio.2022.BuildTools -e`, then add the workload in the Visual Studio Installer).
2. Open a new terminal, then:
   ```sh
   cd apple/WorldClockCore
   swift test
   ```

**macOS**: with Xcode 26 selected (`sudo xcode-select -s /Applications/Xcode.app`), run `swift test --package-path apple/WorldClockCore`, or open `apple/WorldClockCore/Package.swift` in Xcode and press Cmd-U.

The core tests are not duplicated as an Xcode test target.

## Building on a Mac

1. Install Xcode 26 (iOS 26 SDK; the app targets iOS 17.0+) and XcodeGen: `brew install xcodegen`.
2. Generate the project: `cd apple && xcodegen generate`. It writes `apple/WorldClock.xcodeproj` (a build product: regenerate it after editing `project.yml` or adding files; do not hand-edit it). It also rewrites the two `Info.plist` files and the `.entitlements` files from `project.yml`.
3. `open WorldClock.xcodeproj`, select the `WorldClock` scheme.
4. Signing: set your team in `project.yml` (`DEVELOPMENT_TEAM`) and regenerate, or pick it in Signing & Capabilities for both targets.
5. If you cannot use the `io.joao.*` identifiers, change them in one pass:
   - `project.yml`: `bundleIdPrefix`, both `PRODUCT_BUNDLE_IDENTIFIER`s (the widget id must be prefixed by the app id), and the App Group in both `entitlements` blocks;
   - `WorldClockCore/Sources/WorldClockCore` `SettingsStore.appGroupID` (and `CORE_API.md`);
   - regenerate with `xcodegen generate`.
6. Before testing widgets (they read settings through the App Group, so signing matters even on a simulator):
   set `DEVELOPMENT_TEAM`, and register the App IDs `io.joao.worldclock` and `io.joao.worldclock.widgets` with the App Group `group.io.joao.worldclock.shared` in the developer portal for BOTH targets, or let automatic signing create them on the first build. Without the group, the widget silently falls back to default settings.
7. Run on a simulator or device, add the widgets from the Home Screen / Lock Screen gallery.
8. After the first build, check that `pt-BR.lproj` and `es.lproj` are inside both `WorldClock.app` and `WorldClock.app/PlugIns/WorldClockWidgets.appex` (Products > Show in Finder > Show Package Contents). If a language is missing, the String Catalogs were not compiled into that target. CI can check this with `apple/ci/check-bundle.sh` (see CI below).

Debugging widgets: run the app once so the App Group has settings, then select the `WorldClockWidgets` target in the scheme menu (Xcode creates a scheme on demand) or attach to the widget process. Xcode Previews for every family are at the bottom of `WidgetViews.swift`.

Intent string table: intent titles, parameter names and descriptions use `LocalizedStringResource("widget.intent.…", defaultValue: "…")` in the default table (`Localizable.xcstrings`). Keep new App Intents strings there (add them to `shared/strings-native.json`); custom tables are not reliably resolved by the App Intents metadata step, which shows raw keys or English-only text in the configuration UI and Shortcuts.

App Intents note: `ShiftTimeIntent`, `SelectCityIntent` and `SelectCitiesIntent` are compiled into the widget target only. They run in the extension (`openAppWhenRun = false`). If an intent ever needs to open the app (`openAppWhenRun = true`), it must also be added to the app target.

## TestFlight and App Store

1. **Developer portal** (Certificates, Identifiers & Profiles): create the App Group `group.io.joao.worldclock.shared`; create the App IDs `io.joao.worldclock` and `io.joao.worldclock.widgets`, both with the App Groups capability pointing at that group. With automatic signing, Xcode can create these for you on first build if your account has the right role.
2. **App Store Connect**: New App → iOS, name "Open World Clock" (or an available variant), primary language English, bundle id `io.joao.worldclock`, SKU of your choice. The Home Screen name (`CFBundleDisplayName`, app and widget extension) is "World Clock", which fits under the icon without truncation.
   - Already set in `project.yml`: iPhone only, portrait only (`UISupportedInterfaceOrientations`), launch screen = `UILaunchScreen.UIColorName` `LaunchBackground` (asset with the light/dark app canvas colors, `Palette.canvas`), app icon with light (opaque, the mark on a pale sky gradient), dark (the mark on a transparent background, per Apple's dark icon guidance) and tinted (grayscale mark on a black plate) appearances. All three are rendered from the logo master `build/logo/mark.svg` by `scripts/build-icons.mjs` (`node scripts/build-icons.mjs`, or `--check` to verify them); do not edit the PNGs in `AppIcon.appiconset` by hand. To change the icon, change the master (see `build/logo/README.md`) and rerun the script.
3. **Archive**: in Xcode choose "Any iOS Device (arm64)", Product → Archive. Bump `CURRENT_PROJECT_VERSION` in `project.yml` for every upload (and `MARKETING_VERSION` per release).
4. **Upload**: Organizer → Distribute App → App Store Connect → Upload. `ITSAppUsesNonExemptEncryption = false` is already set, so no export compliance question.
5. **TestFlight**: once processing finishes, add the build to an internal testing group (no Beta App Review needed for internal testers). External testing needs a short Beta App Review.
6. **Listing**:
   - Listing drafts, one per locale, with Name, Subtitle, Keywords, Promotional Text, Description and What's New and their character counts: [English (U.S.)](appstore/listing-en.md), [Portuguese (Brazil)](appstore/listing-pt-BR.md), [Spanish (Mexico)](appstore/listing-es-MX.md). They describe only what is in `apple/` and reuse the app's own words in each language. Read them before upload.
   - Name: "Open World Clock". If it is taken: "Open World Clock: Time Zones" (28 of 30 characters).
   - Support URL (blocker): needs an iPhone support page on openworldclock.com with what the app does and the contact email from privacy.html, and no Ko-fi link or Microsoft Store badges (Guideline 1.5 asks for an easy way to contact the developer, and the home page has no contact link). The site owner builds it; do not submit with the home page.
   - Privacy: "Data Not Collected". The app has no network access, analytics or accounts; `PrivacyInfo.xcprivacy` declares no tracking, no collected data and only the UserDefaults required-reason API (`CA92.1` for the app's own defaults, `1C8F.1` for the App Group shared with the widgets). Privacy Policy URL: https://openworldclock.com/privacy.
   - Privacy page (blocker): `site/privacy.html` must include the "iPhone app and widgets" section from `PRIVACY.md` (no data collected, settings stay on the device and in the App Group shared with the widgets) before submitting. The in-app link (Settings > Privacy policy) opens the same page, so App Review reads it from inside the app too. Check the live page, not only the repo, before submitting.
   - Source repo (blocker): the repo must be public with `LICENSE` on main. Until then, remove the Source line from the review notes below.
   - Accessibility Nutrition Labels (App Store Connect): declare only the features checked on a device during the checklist pass: VoiceOver, Larger Text, Dark Interface, Differentiate Without Color Alone, Sufficient Contrast, Reduced Motion. Declare Sufficient Contrast only after a device pass confirms the converted digits on the cards, the map list and pills while converting, and the planner summary: they use `Palette.accentText`, which measures 4.94:1 or better against the canvas, both cards and every sky gradient stop, but the materials behind the map pills and the real rendering are only checked on a device.
   - Screenshots: one 6.9" set at 1320 × 2868 (iPhone 16/17 Pro Max). App Store Connect scales it down for the smaller iPhones, so no 6.5" set is needed. Include at least one Home Screen shot with the widgets.
   - Age rating questionnaire: all "None" → 4+.
   - Pricing: Free, all territories you want.
   - Availability: uncheck "Make this app available on Mac (Apple silicon)" and "Apple Vision Pro" for 1.0. The app is portrait only, single scene, and untested there. Turn them on only after a test pass on those devices.
   - Copyright: 2026 João Carvalho
   - Content Rights: the app contains no third-party content that needs a license. The one outside source bundled with it is the map land outline in `shared/world-land.json`, from Natural Earth (public domain, credited in the root README); time zone rules come from the system's own tz data at run time. `shared/` itself carries no attribution fields, so to stay on the safe side answer "Yes" to third-party content and "Yes" to having the rights to use it, with Natural Earth as the reason.
   - What's New (1.0): use the text in the listing draft of each locale. App Store Connect may not ask for it on the first version.
   - Category: Utilities (secondary: Productivity).
   - Review notes: "No login. Widgets: long-press the Home Screen → Edit → Add Widget → World Clock. The +1 h widget button previews times an hour ahead and resets automatically after an hour. Deep links use the worldclock:// scheme. What the built-in Clock app does not offer: a meeting planner with working hours per city, a converter with a scrub wheel and date chips, sunrise and sunset with a day and night map, and an interactive +1 h widget. Source: https://github.com/joaoCarvalho1000/open-world-clock"
7. **Trader status (EU Digital Services Act)**: in App Store Connect > Business, declare trader or non-trader before submitting. Without it the app is not distributed in EU storefronts, Portugal included. A trader's address, phone and email are shown on the EU product page.
8. Submit for review.

## Not verified without a Mac (checklist)

Everything under `apple/` except the core package was written on Windows without Xcode. Before the first TestFlight build, verify:

- [ ] `xcodegen generate` succeeds with the current XcodeGen (2.4x) and the project opens.
- [ ] App and widget extension compile with Xcode 26 (Swift 5 mode, `SWIFT_STRICT_CONCURRENCY = complete` warnings reviewed).
- [ ] The three spots most likely to break in the first build log: `WorldClockWidgets/Intents.swift` `@Parameter(title:size:)` on `[CityEntity]?` (fallback: a non-optional `[CityEntity]` with default `[]` and `zones = cities.map(\.id)`); the `AttributedString` `accessibilitySpeechLanguage` use in `WorldClockWidgets/Theme.swift`; the `@MainActor` `NightLayerCache` `ImageRenderer` in `WorldClock/Views/Map/MapPainter.swift`. Change them only after a compiler result.
- [ ] The `WorldClockCore` resource bundle (`zones.json`, `world-land.json`) is found at runtime in both the app and the widget extension (`Bundle.module`).
- [ ] Xcode Previews render for every widget family.
- [ ] Widget rendering modes: full color, iOS 18 tinted and dark Home Screen, iOS 26 clear/glass look, `.widgetAccentable()` groups legible.
- [ ] StandBy (systemSmall): background removed, large digits, night-mode red tint legible.
- [ ] Lock Screen: circular gauge label placement, inline text length, rectangular rows.
- [ ] Intent configuration UI: city search, suggestions, multi-select capped at 4 (medium) / 6 (large) / 3 (rectangular) via `@Parameter(size:)`, empty = the app's list (device zone first); intent titles localized in pt-BR / es (default table).
- [ ] `Button(intent:)` +1 h / Now updates the widget, the badge appears, and the shift expires after one hour.
- [ ] Widget deep links: at 10:07, tapping Tokyo on the medium widget opens live Clocks (no converter panel, no accent digits) with Tokyo scrolled into view and outlined for about a second; after tapping +1 h, tapping Tokyo opens the converter at 11:07 and the widget goes back to Now; a cold launch from a widget also scrolls to the city (the Clocks tab scrolls on appear and once more 120 ms later, in case the rows were not laid out yet); the rectangular Lock Screen widget opens Clocks; the large widget header opens the Planner.
- [ ] First run: with the device set to Lisbon or London, the saved list leaves out the other one (same clock all year) and an unconfigured medium widget shows 4 different clocks; with São Paulo there are 5 cards (São Paulo, Lisbon, New York, Los Angeles, Singapore), as on Windows. An existing install keeps its cities. A medium widget added before the app is ever opened already shows the locale's 12/24 h and 4 different clocks, and opening the app afterwards shows the same cities. The widget gallery preview never shows Lisbon and London with the same clock.
- [ ] Settings > Privacy policy opens openworldclock.com/privacy in Safari.
- [ ] Date formats follow the device region when the device language is the app language: on an en_GB device, cards and date chips show Tue 22 Sep and the date picker is day-first; app language Spanish on an en_US device shows es-419 formats. The app's own 12/24 h switch still wins over the device setting, and with 12 h on in pt_PT the longer AM/PM text still fits the cards.
- [ ] iOS 26: converter panel, planner bar and toast use glass, stay legible over bright day cards and sit clear of the floating tab bar; iOS 17 and 18 look unchanged.
- [ ] Compact cards while converting: with 6 cities, tapping the 5th card leaves all 6 compact rows visible above the converter panel on a 6.1 inch iPhone, and the tapped row stays on screen; digits roll while scrubbing; Now brings back the full cards with no scroll jump; VoiceOver reads the same summary and hint on a compact row; at AX5 the name is not truncated (name, time and phase stack); with Reduce Motion on, the rows change size without animation. Estimated from the fonts, a compact row is about 54 pt (about 57 pt with a day marker such as "+1 day"), so 6 rows with their 6 pt gaps (about 360 to 378 pt) fit in the about 382 pt above the panel.
- [ ] Settings > Compact cards: with the toggle on, about 8 cities fit on a 6.1 inch screen without converting, the live times use the primary text color (the accent only while converting), converting and Now keep the same compact rows, VoiceOver reads the same summary and hint, and at AX5 name, time and phase stack without truncation. Widgets look the same with the toggle on or off.
- [ ] Haptics and Share: copying (converter Copy button, card menu Copy time) gives a success tap, also when copying again while "Copied" is still showing (`AppModel.flashCount`); adding, removing or reordering a city gives a light tap; picking a date chip or a date in the picker (converter and Planner) gives a selection tick, and a midnight rollover or a scrub past midnight gives none from the chips. Share in the converter and in the card menu opens the share sheet with exactly the text Copy puts on the clipboard, and nothing is sent until a target is picked.
- [ ] Planner without an overlap: the first-run cities from São Paulo show a dashed band and "Best: 4 of 5 working · 1:00 PM to 2:00 PM (São Paulo)" in the primary color, and the legend's third item becomes a dashed "Best hours" swatch (a solid "Overlap" swatch otherwise); on a tie the band goes to the hours where home and the source city work, then to fewer cities at night, the same hours the Windows planner picks (`Planner.partial(_:prefer:)`, time.js bestHours); removing Singapore gives a real overlap, with the solid band and "1 h overlap"; the VoiceOver "Overlap" rotor reaches the dashed band and its cells say "Best: 4 of 5 working"; with Differentiate Without Color on, the dash tells the two bands apart; at an AX size the stacked grid marks the same hours per cell (dashed outline and a faint fill; overlap cells there have the dashed outline without the fill); the "Best" part of the pt and es summaries stays on one line at the default text size and the whole summary wraps without truncation, like the English one.
- [ ] Converter wheel: no jitter or feedback loop while typing a time, tapping a date chip or scrubbing; the converter updates on every detent (iOS 17 and later), with no jitter while flinging, and a fling ends with the times matching the centered tick; the selection haptic fires only for finger-driven scrolls; a date chip tapped (or a time typed) while the wheel is still decelerating stops the fling, the wheel moves to the new time and the chip's date is kept (iOS 18 and 26), also for a chip outside the wheel's range, after which typing a time still moves the wheel.
- [ ] Map: the night layer (rasterized once per displayed minute by `NightLayerCache` with `ImageRenderer`) matches the live-drawn shading and scrubbing the converter stays smooth.
- [ ] Map pills (`MapLabels`): at the default text size and at an AX size, pills never overlap each other or cover a dot, stay inside the rounded map with no pill cut by a rounded corner (the 8 pt corner squares are blocked, `MapLabels.corners(of:)`), sit next to their own dot, and do not move while scrubbing; a city without room shows only its dot (the list below still has it); 12 h and 24 h both fit the capsule, also with Bold Text on.
- [ ] Convert tip (TipKit): on first launch "Tap a city to convert a time" shows above the first card; tapping a card starts the converter, and the tip stays gone after a relaunch; closing it with its X leaves no empty row; VoiceOver reads it. Settings shows the Widgets section, and its steps match iOS 17 (the + button) and iOS 18 and 26 (Edit, then Add Widget).
- [ ] Dynamic Type (largest sizes: card header, add-city rows and planner stack vertically; converter panel scrolls at AX3+) and a VoiceOver pass on app and widgets (rows read name, Home, time, phase, spoken offset such as "5 hours ahead"; planner "Overlap" rotor; widget rows prefixed "In 1 hour:" while shifted; `accessibilitySpeechLanguage` / `accessibilityLanguage` follow the app language).
- [ ] String Catalogs compile (`Localizable.xcstrings`, `Widgets.xcstrings`); Xcode may add extracted keys to the generated catalog on build, which `export-xcstrings.mjs` then overwrites; keep an eye on that diff.
- [ ] App icon: light (opaque), dark (transparent background, system-drawn backdrop) and tinted appearances look right on device; launch screen shows the canvas color in light and dark mode.
- [ ] App Group entitlement provisioned for both targets (settings written by the app are read by the widget).
- [ ] Per-minute timelines (~90 entries per reload): memory under the widget limit, reload budget acceptable, correct flip at sunrise/sunset and at local midnight.
- [ ] Privacy manifest appears in the archive's privacy report (Organizer → Generate Privacy Report).

## CI

`.github/workflows/ios.yml` runs on a macOS 26 runner with Xcode 26 for pushes to main and pull requests that touch `apple/**`, `shared/**`, `scripts/export-*.mjs` or the workflow itself, and on `workflow_dispatch`: `swift test` for the core package, `xcodegen generate` (XcodeGen 2.46.0, checked against its SHA-256), then unsigned Debug (iOS Simulator) and Release (generic iOS device) builds of the app + widgets with the same project and scheme. The Release build for the device slice (arm64) also covers optimizer and `#if DEBUG` differences and the App Intents metadata extraction for arm64.

The first green run replaces the two "not run yet" rows in the Status table with real results; a red run's log is where the three spots in the checklist above show up first.

`apple/ci/check-bundle.sh` checks the contents of that Release build: `en`, `pt-BR` and `es` `.lproj` folders, `PrivacyInfo.xcprivacy` and a `*WorldClockCore*.bundle` holding `zones.json` and `world-land.json` in both `WorldClock.app` and `PlugIns/WorldClockWidgets.appex`, `plutil -lint` on both `Info.plist` files, `Metadata.appintents` in the extension, and the same `CFBundleShortVersionString` and `CFBundleVersion` in the app and the extension. Each problem is a `::error::` line, and the script exits 1 at the end. It takes the products folder as its argument and defaults to `$RUNNER_TEMP/DerivedData/Build/Products/Release-iphoneos`.

Still to do: add a step after the Release build in `.github/workflows/ios.yml`: `bash apple/ci/check-bundle.sh`. When that step is green, tick the checklist lines for the core resource bundle, the privacy manifest in both targets and the String Catalogs (the languages in both targets; the runtime lookup of `Bundle.module` still needs a device run).
