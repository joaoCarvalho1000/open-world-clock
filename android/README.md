# Open World Clock for Android

Native Kotlin and Jetpack Compose app with Android home-screen widgets. This project lives alongside the desktop, web, and iPhone apps and reads the existing offline city catalog from `../shared/zones.json`.

## Build

Requires JDK 17, Android SDK platform 36, and build tools 36.0.0. The Gradle 8.13 wrapper is included with a pinned distribution SHA-256. Set `JAVA_HOME` to JDK 17 and `ANDROID_HOME` to your SDK, or put `sdk.dir=/path/to/Android/Sdk` in the ignored `local.properties` file.

```sh
cd android
bash gradlew testDebugUnitTest lintDebug assembleDebug assembleRelease
```

On Windows use `gradlew.bat`. The debug APK is `app/build/outputs/apk/debug/app-debug.apk`. The optimized release APK is unsigned; production signing and store publication are separate tasks. Do not put signing keys in the repository.

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n io.joao.worldclock/.MainActivity
bash gradlew connectedDebugAndroidTest
```

## Product

- Live city clocks show local dates, daylight, time differences, and working status. Search works offline by city, country, aliases, abbreviations, IANA identifier, or UTC offset, including half-hour and quarter-hour zones.
- Saved cities can be renamed, reordered, and removed. Long-press and drag a card to reorder it, with haptic feedback and scrolling at the edges. Move up/down controls remain available for accessibility. Working hours and weekdays are configurable per city, including overnight shifts.
- The converter accepts a source city, date, and time. DST gaps are explained; repeated times offer both occurrences. Time-step buttons move along the actual timeline.
- The planner compares work schedules at the same instant in every city. Every city row has readable hour numbers, including minutes for fractional offsets. Narrow layouts scroll all rows together.
- The offline world map shows live solar night shading and city pins, with an accessible city list. Open it from the globe button on Clocks.
- Widgets have a dedicated gallery and per-instance configuration. City clock, World clock, and Meeting planner are separate launcher entries. Widgets can follow the app's city list or hold their own selection, with automatic, light, and dark styles.
- The app supports system, light, and dark appearance, 12/24-hour time, and phone/tablet layouts.
- English, Brazilian Portuguese, and Latin American Spanish are available in Settings, with a system-language default. City names, search, dates, accessibility labels, and widget text follow the selected language.
- Native sharing sends the app or a selected meeting time through Android's chooser. Meeting links open the website with the same cities, language, and exact minute, including repeated daylight-saving hours.
- Settings includes the Supporter Pack, sharing, and feedback. Play Store installations also expose rating and a paced native review prompt.
- The optional Supporter Pack adds ten distinct premium widgets (Duo, Board, Workday, Sun arc, Atlas, Week, Next window, Hour ruler, Date line and Clock change), 16 palettes, six additional clock faces, 24 curated looks and up to 12 saved appearance presets. Yearly and monthly subscriptions use Google Play Billing; all existing clock features, languages and widget styles remain free. Requested US base prices are $5/year and $1/month, with actual local prices supplied by Play. See [BILLING.md](BILLING.md) for product IDs, verification behavior and the remaining Play Console setup.

## Widget behavior

Native `RemoteViews` with `TextClock` keep clock digits live in the launcher, even when the app process is gone. The app does not run a foreground service or request exact alarms. Localized dates, daylight colors, work status, relative offsets, and meeting recommendations refresh on the platform's periodic schedule (30 minutes), relevant system broadcasts, or changes in the app. These metadata values may lag a transition; the clock itself continues ticking.

Widget choices are stored separately for each `appWidgetId`. Deleting a widget removes its configuration. Tap a city to open its converter; the meeting widget opens the planner. Resizing is supported within each provider's declared minimum size. Pinning requires launcher support; widgets can also be added through the launcher's widget picker.

## Privacy

Clocks, conversion, planning and the original widgets work offline. There are no app accounts, ads, app analytics, location requests or developer backend. Google Play Billing adds billing, internet and network-state permissions for optional purchases and its SDK operations. Google handles checkout, subscription management and payment data. Signed receipts and their last verification time are cached in private device storage; the app does not receive card details or send receipts to a developer server. Cities, widget configuration and appearance presets also stay in private storage; cloud backup and device transfer are disabled. Uninstalling clears local data, while purchases can be restored through the same Play account. Device time-zone rules come from Android, so current OS time-zone updates are needed when governments change clock rules.

Support and feedback open an external browser or email app on your request. Sharing presents the system chooser; the app never sends a message itself. Review pacing uses local counters only. Eligible Play Store release installs can request Google's review card after seven days, three active days, and five useful actions, with a 180-day cooldown. An explicit rating action opens the store listing, while development installs offer feedback. Google controls whether its review card is shown; see the [official review guidance](https://developer.android.com/guide/playcore/in-app-review). Store review behavior requires a Play test track before publication.

## Verification

12 October refresh: Ko-fi removed from Android and billing entitlement refresh extended to all providers. The refreshed source passes 60 JVM tests and eight affected device tests (purchase UI, premium gating, localization and sharing). Debug/test APK builds and lint pass with zero errors, 525 warnings and 6 hints. Translation parity is 310 keys. The earlier full-suite and visual evidence below remains historical; this refresh does not claim a new full launcher/visual pass. A subsequent build with the real app public licensing key passes all 60 JVM tests, release lint checks and signed-bundle/debug-APK builds. Version code 1 was published to internal testing with owner approval on 12 October 2026, and the owner is configured for internal and license testing. The payments profile is set up and both subscription base plans are active at US$1.00 monthly and US$5.00 yearly, with Play-converted regional prices and three-language metadata. Play Console confirms Available to internal testers. No production release has been published; actual Play checkout remains untested.

Unit tests exercise the shared reference vectors for offsets, solar altitude, conversions, and civil dates, plus repeated-hour selection, overnight work schedules, DST planner columns, offline search, and settings recovery. The Android converter deliberately makes overlap selection explicit; the desktop's iterative overlap default is not a universal contract.

Instrumentation tests exercise the real Compose app on an Android device or emulator. CI runs unit tests, lint, and both debug and optimized release builds.

Verified locally on 11 October 2026 with JDK 17 and an Android 15 (API 35) Pixel emulator:

- All 44 JVM tests pass. All 27 device tests have passing results: the full run passed 26, then both UI gating tests passed after correcting an ambiguous test selector (the configure screen legitimately has two Unlock buttons). The final production change for that correction is a semantics tag, with no behavior change. They cover city search/edit/persistence/removal, long-press drag ordering, language persistence, warm deep links, share/support intents, per-widget configuration, permissions, and real `RemoteViews` inflation. Supporter tests cover signed receipts, monthly cache expiry, preset retention, legacy widget settings, paid themes and faces at minimum/large sizes, and free appearance restored onto reused launcher views in both system themes. Purchase presentation tests exercise localized prices at 150% text, pending payments, restoration, unavailable products and subscription management. The drag test also passed in the tablet grid layout.
- All 310 translatable resource strings have matching English, Portuguese and Spanish keys and formatting placeholders. Language resources remain bundled for offline switching in app bundles.
- Lint, debug APK, test APK and optimized unsigned release APK builds pass. Lint reports zero errors, 443 warnings and 6 hints, chiefly widget preview text/numeric marks, dependency updates, layout advice, and attributes ignored on older Android versions. No lint baseline or check suppression was added.
- The three original free widget types were placed on the launcher during baseline validation. City taps open the converter, configuration changes stay independent, and a clock advanced across a minute while the app had no running process.
- Baseline inspection covered English, Portuguese and Spanish screens, both themes, 12/24-hour time, normal and 150% text at a 360 dp phone width, the widget gallery and launcher previews, the day/night map, phone landscape, and both tablet orientations.
- Inspected the Supporter sheet on phone and tablet, large translated text, locked customization previews, restoration feedback and rendered Paper/Forest/Ink widgets. Price screenshots are explicitly labelled test fixtures. Real checkout, subscription lifecycle and restore through Google Play still require the configuration and internal-track checks in [BILLING.md](BILLING.md).

Premium validation separately exercises all ten kinds at provider minima and larger sizes, English/Portuguese/Spanish, normal and 150% text, native parcel/inflate/reapply behavior, solar polar states, absent working windows and retained choices after expiry. The clock-face matrix covers 16 palettes and seven faces in 12/24-hour formats. The gallery uses the actual RemoteViews renderer; its inspection is not evidence of launcher placement, host cropping or launcher resize behavior for paid kinds.

Screenshots and local build logs are in the ignored `captures/` directory. Physical-device, additional launcher, and minimum-API coverage remain release validation work; this is an installable development build, not a store publication.

The implemented premium catalog and separate proposals are documented in [PREMIUM-CATALOG.md](PREMIUM-CATALOG.md). Visual and interaction decisions are in [DESIGN.md](DESIGN.md).

## Current scope

This Android version supports the same three interface languages as the website. Desktop-specific window/tray features do not apply. Import/export and app-store publication are not implemented in this initial Android version. The offline map uses a fixed world view without pan or zoom.

## Protected Play publishing

Android Play accepts manual dispatch from main only and remains disabled unless
`ANDROID_PLAY_ENABLED` is `true`. Its validation job runs Android tests, lint and
builds without release secrets before publishing can start.

Before enabling it, a maintainer must create the `android-production` environment,
require an independent reviewer, disable administrator bypass, and allow only the
main branch. Move the signing and Play service-account secrets into that environment
and remove repository-level copies. These settings are required setup, not something
a workflow file can enforce by itself. Keep the enable switch off until setup is verified.
No tag triggers publishing. A successful submission does not prove store availability;
draft releases remain drafts. Dry runs verify authentication and edit access only.

Device QA exits nonzero for incomplete contrast or widget coverage, including explicitly
skipped widgets. Its regional contrast heuristic detects gross contrast failures; it does
not certify text-level accessibility. Importing its PNG helpers does not discover devices.
