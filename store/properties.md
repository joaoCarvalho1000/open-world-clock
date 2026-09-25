# Properties

Partner Center > Submission > Properties. Values to enter, in page order.

## Category

| Field | Value |
|---|---|
| Category | **Utilities & tools** |
| Subcategory | None. Utilities & tools has no subcategories in Partner Center (only Books & reference, Education, Games and a few others do) |
| Secondary category (if offered) | Productivity |

## Privacy and support

| Field | Value |
|---|---|
| Privacy policy URL | https://openworldclock.com/privacy |
| Website | https://openworldclock.com |
| Support contact info | `support@openworldclock.com`, once a test mail to it has arrived (see "Contact address" in [PUBLISHING.md](../PUBLISHING.md#contact-address)). This is required before submitting, and this row must show the same address as PRIVACY.md and the site. Fallback if the address is not ready: the GitHub issues page `https://github.com/joaoCarvalho1000/open-world-clock/issues` once the repo is public, or `https://openworldclock.com/faq` while it is still private |

Before submitting, open https://openworldclock.com/privacy in a private window and confirm it loads (Partner Center rejects a policy URL that 404s). The page must state that the Store build makes no network requests, which the page already says.

## Product declarations

| Declaration | Check? | Why |
|---|---|---|
| This app allows users to make purchases, but does not use the Microsoft Store commerce system | No | Free, no purchases |
| This app has been tested to meet accessibility guidelines | Yes, after a 5 minute Narrator pass | The app has keyboard access to every control, a visible focus ring, screen reader announcements (aria-live) and reduced-motion support. Tick it only after you tab through the main window, the card menu and settings with Narrator on (Win+Ctrl+Enter) and hear sensible labels |
| Customers can install this app to alternate drives or removable storage | Yes (default) | Nothing in the app depends on the system drive |
| Windows can include this app's data in automatic backups to OneDrive | Yes (default) | Only a small settings file |
| This app depends on non-Microsoft drivers or NT services | No | |
| This app is a game / supports Xbox Live / other game declarations | No (not shown for Utilities) | |
| This app requires a Microsoft account / primarily targets children | No | |

## System requirements

Enter under "System requirements" (Minimum / Recommended). Everything not listed stays unchecked.

| Item | Minimum | Recommended |
|---|---|---|
| OS (shown in "Additional system requirements" text) | Windows 10 version 1809 (build 17763) or later, Windows 11 | Windows 11 22H2 or later (for Snap and the acrylic backdrop) |
| Architecture | x64 or ARM64 | |
| Memory | 2 GB | 4 GB |
| Mouse | | Checked (scroll-to-scrub and drag; everything also works from the keyboard) |
| Keyboard | | Checked |
| Touch screen, camera, microphone, NFC, Bluetooth, telephony | Unchecked | Unchecked |
| DirectX / video memory | Not required | |

Text for "Additional system requirements" (listing page, per language), English:
`Windows 10 version 1809 or later, or Windows 11. x64 or ARM64. Snap and the acrylic backdrop need Windows 11 22H2 or later.`

pt-BR: `Windows 10 versão 1809 ou posterior, ou Windows 11. x64 ou ARM64. O Snap e o fundo acrílico exigem o Windows 11 22H2 ou posterior.`

es: `Windows 10 versión 1809 o posterior, o Windows 11. x64 o ARM64. Snap y el fondo acrílico requieren Windows 11 22H2 o posterior.`

Package note: `build.appx.minVersion` in package.json is `10.0.17763.0` (Windows 10 1809), so the package itself refuses older Windows builds and matches the listing text above. The app runs on Electron 44.

## Display mode and device families

- Device family: **Windows Desktop only** (the manifest targets `Windows.Desktop`). In Packages > Device family availability, keep Windows 10/11 Desktop checked and leave Xbox, Holographic (HoloLens) and Team (Surface Hub) unchecked.
- Display mode: a windowed desktop app (a small frameless window). It is not full screen, not a game and has no 4K or HDR modes, so leave any display mode or "supports 4K" options unchecked.
- Input: mouse and keyboard, with touch working through standard pointer events.

## Pricing and availability (separate page, for reference)

- Markets: all markets.
- Visibility: Public audience, discoverable in the Store.
- Pricing: **Free**. No free trial, no sale pricing.
- Release: "As soon as it passes certification", or "Manually" if you want to publish at the same moment as the website update.
