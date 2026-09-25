# Notes for certification

Partner Center > Submission > Submission options > Notes for certification. Paste the block below: 1,940 characters counting each line break as two (CR and LF), which is what a Windows text box submits, so it is under the 2,000 limit. Recount after any edit. The sections after it are background for you, not for pasting.

## Paste this

```
Open World Clock is a free world clock for the Windows desktop (Electron app packaged as MSIX). It shows the time in cities the user picks, converts times between time zones, plans meeting overlaps and shows a day/night world map. No account, no sign-in, no purchases, no ads.

It runs as a small frameless window (no standard title bar), always on top by default, with its own buttons at the top right and a notification area (tray) icon. The "-" button minimizes it to the taskbar. The "X" button closes it to the tray, where it keeps running; click the tray icon to show it again. First launch shows a strip of city cards, including the device's time zone.

Test in 2 minutes:
1. Click "Add city", type Tokyo, press Enter. A Tokyo card appears.
2. In the "If it's" field type 3pm and choose a city in the "in" list. Every card converts; cards past midnight show "+1 day", cities between 22:00 and 07:00 show a moon. Click "Back to now".
3. Scroll the mouse wheel over any card: all clocks move in 15-minute steps.
4. Top bar buttons: globe = world map, lines icon = meeting planner (working-hours grid with an overlap band), the three layout icons = strip / compact / vertical, pin = always on top on/off, gear = settings (theme, language, 12/24 h).
5. Right-click the tray icon: Show / Hide, Pin, Reset position, Quit.

Network: the Store build makes no network requests. Time zone rules are built in, so it works offline. No telemetry.

runFullTrust: required because this is a Win32 desktop app (Electron) packaged as MSIX. It runs the desktop process, the tray icon and the frameless window. No other restricted capabilities are declared.

Startup task: the package declares a windows.startupTask (TaskId WorldClockStartup) with Enabled="false". It never turns itself on; users can enable it in Settings > Apps > Startup. The tray shows this as a hint instead of a checkbox; Settings has a button that opens that page.
```

## Background (do not paste)

- What was checked for the notes: the tray menu items come from `buildTrayMenu()` in src/main.js (Show / Hide, Pin above all windows, a disabled "Launch at login: Windows Settings > Apps > Startup" hint in the Store build, Reset position, Quit). `btnMin` minimizes to the taskbar (`window:minimize`). `btnClose`, Alt+F4 and the taskbar's Close all hide the window to the tray (`hideToTray()`; the `close` handler in `createWindow()` cancels the close unless the app is quitting), and the first time a tray notification says the app is still running. Only the tray's Quit, or Windows shutting down, ends the app (CONTRACT.md, "Closing").
- Network: `startAutoUpdate()` returns early when `process.windowsStore` is true, and auto-update is also off by default (`build.extraMetadata.wcUpdates: false`). The renderer CSP is `default-src 'self'`; permission requests are denied; navigation and new windows are blocked. The app leaves itself in two ways only. `openExternalSafe` opens https links to openworldclock.com (with or without www), github.com, apps.microsoft.com or ko-fi.com in the default browser (`EXTERNAL_HOSTS` in src/main.js). In the Store build, the "Open Startup apps" button in Settings sends `window:startupSettings`, and src/main.js opens the fixed URI `ms-settings:startupapps` (never a URI from the page). The only web link in the UI, Support on Ko-fi, is hidden in the Store build in both the tray menu (`buildTrayMenu()` in src/main.js) and Settings (`syncPanel()` in src/renderer/app.js), so a tester sees no link to a website.
- Startup task: declared in build/appx-extensions.xml (`Enabled="false"`, `TaskId="WorldClockStartup"`), wired through `build.appx.customExtensionsPath`, with `addAutoLaunchExtension: false`.
- Capabilities: electron-builder always adds `runFullTrust` and nothing else unless `build.appx.capabilities` lists more. Keep it that way; every extra capability needs its own justification.
- If a tester reports "window has no title bar" or "cannot find the app after closing": both are expected for an app that keeps running in the tray. The notes cover them.
- Windows App Certification Kit: run it on the .appx before submitting (Start > Windows App Cert Kit > Validate Store App). Electron packages usually pass; a common warning is about binaries not built with specific compiler flags, which does not block Store certification.
