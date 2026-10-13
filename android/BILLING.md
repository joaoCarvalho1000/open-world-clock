# Supporter Pack

The free app includes clocks, conversion, planning, all three languages and the original widgets with automatic, light and dark appearance. The optional Supporter Pack adds ten distinct premium widgets (Duo, World Board, Workday, Solar Arc, Daylight Atlas, Week Ahead, Next Window, Time Ruler, Date Line and Clock Change), 16 palettes, six additional clock faces, 24 curated looks and saved appearance presets. It is Android-only; there is no account or cross-platform entitlement service.

## Products configured in Play Console

| Product | ID | Configuration | Requested US base price |
| --- | --- | --- | --- |
| Yearly | `supporter_yearly` | Auto-renewing subscription, base plan ID `yearly`, annual billing period (`P1Y`). No trial or introductory offer. | US$5.00/year |
| Monthly | `supporter_monthly` | Auto-renewing subscription, base plan ID `monthly`, monthly billing period (`P1M`). No trial or introductory offer. | US$1.00/month |

Yearly and monthly provide the same premium widgets and customization features while the subscription remains active. Neither plan grants permanent ownership or promises a fixed content-release schedule. The app does not offer another purchase while either entitlement is active, avoiding overlapping subscriptions. A cancelled subscription still has access until Play stops returning it as active. Manage subscription opens the Google Play page for the actual active yearly or monthly product.

The earlier lifetime proposal was never configured or sold. It is removed from the app, its receipts are not accepted as yearly subscriptions, and `supporter_lifetime` must not be activated. Use the new yearly subscription ID above.

Both base plans are active in Play Console as of 12 October 2026. US prices were saved and read back at exactly US$1.00 monthly and US$5.00 yearly. Regional prices use Play's conversion and local rounding; Brazil is R$4.99 monthly and R$24.99 yearly. The US prices were explicitly corrected after bulk conversion rounded them to $0.99 and $4.99. Names and benefits are provided in EN, PT-BR and ES-419. Actual checkout remains untested. The app displays only `ProductDetails` formatted prices returned for the user's Play country. No USD fallback or client exchange-rate conversion is used. The purchase button stays disabled if the product or verification configuration is unavailable.

At these requested US prices, yearly costs US$5 versus US$12 for twelve monthly payments. The interface presents yearly first and clearly states annual renewal. It does not hard-code a savings claim because regional prices can differ.

## Configuration and release gate

1. Register `io.joao.worldclock` in Play Console, configure the two products above and their localized descriptions, and activate the intended countries. Products are not created by a Gradle build.
2. Copy the app's **public** licensing / billing verification key from Play Console into `WORLD_CLOCK_PLAY_PUBLIC_KEY` in the developer's user-level Gradle properties (or set the same named environment variable in the signing environment). Do not paste a service-account private key or signing key. The verification key is public and is bundled in `BuildConfig`.
3. Build a signed app bundle for an internal test track. Keep release signing credentials outside this repository. The development APK and current unsigned release do not publish anything.
4. Add license testers, install from the internal track with the intended Play account, and complete the purchase matrix below using Google's test payment methods. Debug builds do not bypass receipt verification.
5. Publish an Android privacy policy covering Google Play billing/reviews, reconcile the store Data safety form with the actual bundled SDKs, and link it in the store listing. The existing public Windows/iPhone policy does not yet cover this new Android purchase integration.

Without the public key, all core functionality and appearance previews work, but purchasing and restoring show unavailable. This protects test builds from taking payment before they can verify it. The app is registered, its public key is configured outside the repository for local builds, and the payments profile and both subscription base plans are active.

## Ownership and offline behavior

`SupporterBilling` uses Play Billing Library 9.1.0. It queries subscription ownership on app resume and on Restore purchases. One subscription snapshot covers both products; before checkout it rechecks ownership to prevent a second purchase after ownership changed on another device. Only completed, signed receipts for the exact package and known subscription product are eligible; pending, suspended, foreign, malformed or unsigned purchases do not unlock features. Acknowledgement failures retain the item for retry on resume or restore. Successful empty ownership queries revoke the corresponding cached access. Transient network failures preserve the bounded receipt cache.

The app caches signed receipts in private, backup-excluded storage and verifies the signature whenever it reads them. Both yearly and monthly access require a successful active-ownership query at least every 24 hours because the client receipt contains no subscription expiry. Without a fresh check, themes and faces fall back to the free appearance and each premium widget uses its configured free-kind fallback; saved configurations and presets remain stored. Purchase, restore and expiry changes refresh all thirteen widget providers immediately while the app is running. On the launcher, appearance changes follow Android's widget refresh schedule. Opening the app checks ownership immediately. The core clock features continue to work offline without restriction.

This is a client-only integration. It does not include a purchase-validation server or real-time developer notifications. Rooted/patched clients and copied legitimate receipts are outside its protection, and refunds while permanently offline cannot be detected. Google recommends server verification and real-time lifecycle handling for stronger fraud protection. Before a broad paid launch or adding cross-platform purchases, implement a backend tied to a clear identity model. Do not claim server-grade verification or instantaneous revocation for this build.

## Required Play test matrix

Local unit/device tests are not a substitute for the actual Play checkout. On a configured internal track verify:

- Both products display local prices and yearly/monthly renewal terms in EN, PT-BR and ES-419.
- Approved yearly and monthly purchases unlock all ten premium widget layouts and appearances, are acknowledged, and restore after reinstall on the same Play account.
- A cancelled checkout and declined payment leave the app free and usable. Reopening checkout works.
- Pending payment does not unlock; a later approval unlocks after resume. A later decline remains free.
- Yearly and monthly purchase, renewal, cancellation with remaining access, expiry, payment hold, pause and resumption follow Play's active ownership result.
- A refund/revocation removes access on the next successful query, preserving free functionality and saved appearance data.
- Both subscription caches expire after 24 hours offline, then restore after a successful active check. Device clock rollback does not extend access. An expired yearly receipt does not mask a currently active monthly receipt.
- No second purchase is offered while yearly or monthly access is active. Both products are checked before launching checkout.
- Restore with no purchase reports that result; unavailable network/store reports a recoverable error without inventing ownership.
- Manage subscription opens the correct product in Google Play and exposes cancellation.
- Recreated activities, a killed app during checkout, multiple Google accounts and new devices recover through Play ownership queries.

References: [billing integration](https://developer.android.com/google/play/billing/integrate), [purchase security](https://developer.android.com/google/play/billing/security), [subscription requirements](https://support.google.com/googleplay/android-developer/answer/9900533?hl=en), [license testing](https://developer.android.com/google/play/billing/test), [supported price ranges](https://play.google.com/supported-locations?hl=en).

## Current activation status and next steps (12 October 2026)

The Android app integrates the real Play Billing SDK, not a simulated checkout. Account verification is complete, and Open World Clock is registered as `io.joao.worldclock`. The app-specific public licensing key is configured in user-level Gradle properties outside Git. A dedicated upload-signed release bundle, version code 1, was published to internal testing with owner approval on 12 October 2026, with three-language release notes and the owner account saved for internal and license testing. The payments profile is set up and both subscription base plans are active with the exact IDs and periods used by the app. The Console review has no blocking errors and one warning about missing debug symbols for bundled native code. Play Console confirms Available to internal testers. The invitation link works for the owner account. No production release or real Play purchase has been completed.

1. Account verification, app registration and the payments profile are complete.
2. Both auto-renewing subscriptions in the table above are active: `supporter_monthly` / `monthly` at US$1 and `supporter_yearly` / `yearly` at US$5. Trials and introductory offers are off. Console defaults are retained: monthly uses 7 days of grace and 53 days of account hold; yearly uses 14 days of grace and 46 days of account hold. Both calculate account hold automatically and allow resubscribe.
3. Keep the app's public licensing key configured as `WORLD_CLOCK_PLAY_PUBLIC_KEY` for subsequent builds. It is already stored in local user-level Gradle properties. Other build machines need the same public value; never substitute private service-account credentials or a signing key.
4. Run `gradlew.bat :app:verifyPlayBillingConfiguration` from this Android directory. The task checks Base64 RSA format without printing the key. It cannot verify that the key belongs to the correct Console app, that the products exist or that Google will accept a purchase.
5. Version 0.1.0 (1) is published to internal testing. Open https://play.google.com/apps/internaltest/4701618687821069635 with the owner license-test account, accept the invitation, then install through Google Play. Later uploads must use a version code greater than 1 and the existing upload key. Without external signing settings, ordinary release builds remain unsigned. Preserve existing debug-install data: Play-signed builds cannot update debug-signed installs in place, so use a separate test device/profile instead of uninstalling and losing settings.
6. Execute the required Play test matrix above before enabling a paid public release. Use Google's test payment methods, not a real charge as a substitute for testing.

Ko-fi has been removed from Android. The Supporter Pack uses Google Play subscriptions; sharing and email feedback remain available. Other platforms' support links are unchanged.

The existing client signature verification is an implemented real billing integration, but it is not a server entitlement system. Server validation and notification processing remain a separate paid-public-release requirement; no backend deployment is implied or completed by these setup steps.

## Upload signing inputs

Release signing is optional for ordinary local/CI checks. To prepare a Play upload, supply these Gradle properties or same-named environment variables outside the repository:

- `WORLD_CLOCK_UPLOAD_KEYSTORE`: absolute path to the upload keystore.
- `WORLD_CLOCK_UPLOAD_KEY_ALIAS`: upload alias.
- `WORLD_CLOCK_UPLOAD_STORE_PASSWORD`: keystore password.
- `WORLD_CLOCK_UPLOAD_KEY_PASSWORD`: optional separate key password; defaults to the store password.

`WORLD_CLOCK_PLAY_PUBLIC_KEY` remains the app's public Play licensing key. Never substitute a private key. `-PWORLD_CLOCK_VERSION_CODE=N` selects a higher version code for later uploads; the default is 1.

Run `gradlew.bat :app:verifyInternalTestingConfiguration` first, then `gradlew.bat :app:bundleRelease`. The preflight validates the public key format and presence of upload-signing inputs; bundle signing validates the actual keystore credentials. Keep private key material and passwords out of Git. A local signed bundle without the actual Play public key can test compilation but cannot activate purchases.


## Automated deployment

`.github/workflows/android-play.yml` builds a signed bundle and publishes it to a Play track without
anyone touching the Console. Run it from Actions > Android Play > Run workflow, or push a tag
matching `android-v*`. It takes a track (internal, alpha, beta, production), a status (completed or
draft) and a dry run switch.

The workflow checks every secret before it builds, runs the translation gate, the unit tests and
lint, asks Play for the next free version code, builds a signed bundle stamped with it, verifies the
bundle really is signed, and only then uploads. The bundle is also kept as a build artifact for 14
days whether or not the upload succeeds.

Required repository secrets, under Settings > Secrets and variables > Actions:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`: the upload keystore as base64 (`base64 -w0 upload.jks`). This
  must be the same upload key that signed version code 1; Play rejects anything else.
- `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_STORE_PASSWORD`, and optionally
  `ANDROID_UPLOAD_KEY_PASSWORD`.
- `WORLD_CLOCK_PLAY_PUBLIC_KEY`: the same public licensing key used for local builds.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: a Google Cloud service account key, raw JSON or base64 of it.
  Enable the Google Play Android Developer API for its project, then in Play Console open Users and
  permissions, invite the service account email and grant it "Release to testing tracks" on this
  app. Permissions can take a few minutes to take effect.

Version codes are not tracked by hand. `android/scripts/play-deploy.mjs --print-next-version-code`
asks Play for every bundle it has ever accepted and returns one above the highest, so a release
cannot collide with what is published. A code is consumed by upload even if that build is never
released, which is why a CI run number is not used: run numbers restart at 1 and would collide.

Release notes come from `store/android/fastlane/metadata/android/<locale>/changelogs/<code>.txt`,
capped at Play's 500 characters. A locale with no file for a code is skipped, and Play keeps the
previous notes for it.

The same script runs locally once `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` is set:

```
node android/scripts/play-deploy.mjs --dry-run
node android/scripts/play-deploy.mjs --aab android/app/build/outputs/bundle/release/app-release.aab \
  --track internal --notes store/android/fastlane/metadata/android
```

`--dry-run` authenticates, opens a Play edit and deletes it again. It proves the key, the
application id and the permissions while changing nothing a tester can see. Run it first after
adding or rotating credentials.
