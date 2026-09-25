# Microsoft Store submission kit: Open World Clock

Everything needed to submit Open World Clock v1.3.0 in Partner Center, in the order you fill it in. Nothing here changes the project; the kit only holds text to paste and images to upload.

## What is in this folder

| File | Used on Partner Center page |
|---|---|
| `properties.md` | Properties (category, privacy URL, website, support, declarations, system requirements) |
| `age-rating.md` | Age ratings (IARC questionnaire answers and expected rating) |
| `certification-notes.md` | Submission options > Notes for certification |
| `listing-en.md` | Store listings > English (United States) |
| `listing-pt-BR.md` | Store listings > Portuguese (Brazil) |
| `listing-es.md` | Store listings > Spanish (Spain) |
| `screenshots/*.png` | English listing screenshots (6, 1920x1080) |
| `screenshots/pt-BR/*.png` | Portuguese listing screenshots (same 6, UI and headline in Portuguese) |
| `screenshots/es/*.png` | Spanish listing screenshots (same 6, UI and headline in Spanish) |

The screenshots are real captures of the dev build (strip light, strip dark, converter with +1 day and the asleep moon, meeting planner with a 2 hour overlap, world map, vertical layout), with the clock pinned to 23 Sep 2026 13:20 UTC and a demo local city (Lisbon in English, São Paulo in Portuguese, Mexico City in Spanish) so no real location or personal data appears.

### Regenerating the screenshots

Every marketing image comes from one script, so each release can re-shoot them from the real app:

```
node scripts/marketing-shots.mjs
```

It runs the dev build once per language (English, Portuguese, Spanish) in a throwaway profile, with the clock fixed at 23 Sep 2026 13:20 UTC and a local city and city set per language (English: Lisbon, London, New York, Los Angeles labelled San Francisco, Tokyo, Sydney; Portuguese: São Paulo, Lisbon, London, New York, San Francisco, Tokyo; Spanish: Mexico City, Madrid, Buenos Aires, New York, San Francisco, Tokyo; the first one is the local city), then draws the final images and writes them in place:

- `store/screenshots/*.png`, `pt-BR/*.png`, `es/*.png`: the six Store screenshots per language, 1920x1080, with the headlines (in `scripts/marketing/compose.cjs`, `COPY`).
- `site/assets/img/*.webp` and `site/assets/img/pages/*.webp`: the website images, same names, sizes and crops as before (the page images are cut from the English Store images; the phone crops keep their fade).
- `site/assets/og.png`: only the app window changes; the logo, the words and the sky stay.
- `docs/readme/*.png` (not the logo lockups).

It takes about four minutes. The installed app can stay open. Leave the mouse still and the display on while it runs: the capture window sits at the top-left of the primary display, away from the pointer, and each capture waits for animations to finish, with no hover or focus. `--capture` or `--compose` runs one step (the raw captures go to `dist/marketing/raw`), `--langs en` limits the languages, `--dest <folder>` writes somewhere else to compare first. The version in Settings comes from `package.json`, so bump it before re-shooting. Then look at every image, and check the captions in the `listing-*.md` files when a scene changes (the scenes are in `scripts/marketing/capture.cjs`).

## Step 0: check the identity values (do this first, once)

1. Go to https://partner.microsoft.com/dashboard > Apps and games.
2. If "Open World Clock" is not reserved yet: New product > MSIX or PWA app > reserve the name **Open World Clock**.
3. Open the product > **Product management > Product identity** and check the three values match what `package.json` already has under `build.appx`:

| Partner Center shows | Key in `package.json` | Value already set |
|---|---|---|
| Package/Identity/Name | `build.appx.identityName` | `JoaosApps.OpenWorldClock` |
| Package/Identity/Publisher | `build.appx.publisher` | `CN=CD6B4157-0217-4AC9-B7AD-1261B3EC1302` |
| Package/Properties/PublisherDisplayName | `build.appx.publisherDisplayName` | `Joao's Apps` |

4. On the same page note the **Store ID** (12 characters, starts with 9) and the **Store link**, listed as "URL for Windows 10/11" (`https://apps.microsoft.com/detail/<StoreID>`). The deep link `ms-windows-store://pdp/?productid=<StoreID>` opens the Store app directly. Both work only after the first publish. `site/assets/config.js` already has `storeUrl: 'https://apps.microsoft.com/detail/9N88FR8M81BM'`; check that 9N88FR8M81BM is this product's Store ID and fix config.js if not.

If any value differs, fix it in `package.json` and rebuild: Partner Center rejects a package whose identity does not match the product. Keep `applicationId` (`WorldClock`) and the startup task id as they are.

## Step 1: build the packages

```
npm run dist:store
```

The script builds both architectures (`appx:x64 appx:arm64`), so you get `Open-World-Clock-1.3.0-x64.appx` and `Open-World-Clock-1.3.0-arm64.appx` in `dist/`.

Store packages are unsigned; Microsoft signs them. Test locally before uploading: `Add-AppxPackage -Path ".\dist\Open-World-Clock-1.3.0-x64.appx" -AllowUnsigned` (Developer Mode on), then run the Windows App Certification Kit on it. The matching `Open-World-Clock-1.3.0-arm64.appx` is the one for ARM64 PCs.

## Step 2: start the submission

Product overview > **Start submission**. Fill the pages below in this order (Partner Center lets you jump around, but Store listings only show every language after the package is uploaded).

### 2.1 Pricing and availability

Markets: all. Visibility: public, discoverable. Price: **Free**. Release: as soon as it passes certification (or manually). Details at the end of `properties.md`.

### 2.2 Properties

From `properties.md`: category **Utilities & tools** (no subcategory), privacy policy URL `https://openworldclock.com/privacy`, website `https://openworldclock.com`, support contact, product declarations, system requirements (Windows 10 1809+ / Windows 11, x64 and ARM64).

### 2.3 Age ratings

Start the IARC questionnaire, pick **Utility, Productivity, Communication, or Other**, answer **No** to everything (table in `age-rating.md`). Expected: **3+** / ESRB Everyone / PEGI 3.

### 2.4 Packages

Drag in the `.appx` files (x64 and arm64 can go in the same submission). Partner Center checks the identity against Step 0. Under **Device family availability** keep Windows 10/11 Desktop only. The `runFullTrust` restricted capability is expected here; its justification goes in the certification notes (Step 2.6).

### 2.5 Store listings

The package declares en-US, pt-BR and es-ES, so three listings appear. For each language open the matching file and paste field by field:

| Partner Center field | Section in the listing file |
|---|---|
| Product name | Product name (pick the reserved name from the list) |
| Description | Description |
| What's new in this version | What's new in this version. Partner Center's help says to leave this field blank on a first submission; the one line in each file is there if you want to fill it anyway |
| Product features | Product features (one per box, up to 20) |
| Screenshots (Desktop) | Upload the 6 PNGs from the folder in the table below, in file order |
| Screenshot caption | Caption column of the screenshot table |
| Store logos | Optional. The package logos are used by default; a 300x300 "1:1 app tile icon" made from `build/icon.png` (512x512) improves how the tile looks in the Store |
| Trailers | None |
| Supplemental fields > Short description | Short description: the site's tagline. The Store can show it at the top of the listing, right above the description, and Partner Center recommends different text in the two fields, so the description does not repeat it |
| Supplemental fields > Search terms | Search terms (7 boxes), only if Partner Center still shows this field. Microsoft's current Store listing help no longer lists it; if it is gone, skip it |
| Additional information > Copyright and trademark info | `© 2026 João` |
| Additional information > Additional license terms | Additional license terms |
| Additional information > Developed by | `João` |
| Additional system requirements | Text in `properties.md` (per language) |

| Listing | Text file | Screenshot folder |
|---|---|---|
| English (United States) | `listing-en.md` | `screenshots/` |
| Portuguese (Brazil) | `listing-pt-BR.md` | `screenshots/pt-BR/` |
| Spanish (Spain) | `listing-es.md` | `screenshots/es/` |

### 2.6 Submission options

Paste the block from `certification-notes.md` into **Notes for certification**. Publishing hold: leave "Publish as soon as it passes certification" unless you chose manual release in 2.1.

### 2.7 Submit

Click **Submit to the Store**. Certification usually takes 1 to 3 business days. Partner Center emails the result; a failure report says which policy and which page to fix.

## After it is live

1. Open the Store link from Step 0 and check the listing in each language.
2. Confirm `storeUrl` in `site/assets/config.js` is this listing.
3. For every later release: bump `version` in package.json (the Store requires a higher version), rebuild, start a new submission, replace the packages and update "What's new".
