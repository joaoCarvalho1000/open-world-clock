# Open World Clock roadmap

## Done (v1.1.0)
Card strip with day/night surfaces, converter with slider, copy times, custom labels, drag reorder, keyboard access, pin, tray, strip/compact/vertical layouts, en/pt/es, installer auto-update code (off until the builds are code-signed), iOS-inspired light design, per-component motion, help behind the "?" button.

## Batch 1: "who's awake" (done)
1. Real sunrise/sunset per city: offline solar math (sun.js) + city coordinates; cards switch day/night at the real sunset; hover shows sunrise/sunset times.
2. Time scrubber: mouse wheel over any card or drag along a day line moves every clock in 15-minute steps; "Now" returns.
3. "Likely asleep" cue: while scrubbing or converting, cities between 22:00 and 07:00 dim and show a moon.
4. Typography: thin digits at large sizes, medium weight below 20px.
5. Search: accept abbreviations ("EST") and offsets ("+3", "UTC-5").

## Batch 2: v1.2 headline (done)
6. Meeting overlap view: stacked 24h rows, working hours shaded, overlap band labeled ("3 h overlap" / "No overlap").
7. Per-city working hours and weekend days.
8. Sky-gradient cards following sun altitude (dawn, day, golden, dusk, night), slow crossfade.
9. Clock-change warnings ("Clocks change in 5 days").
10. Date shortcuts for conversions (Today, Tomorrow, weekday).

## Accessibility and launch prep (done)
15. Accessibility: a sun or moon glyph on compact cards, Windows contrast theme support, and the keyboard scrubber (`[` and `]` for 15 minutes, Page Up and Page Down for an hour), plus zoom from 100% to 200%.
16. Name: Open World Clock.
17. Store identity and GitHub repo set in package.json, privacy policy updated, Store listings and screenshots in English, Portuguese and Spanish (store/).

## Found in testing (done)
- The mouse wheel reaches cards hidden past the edge of the strip: over a card it scrolls to them, and the card's time and day line still scrub.
- When no hour works for every city, the meeting planner points to the hours when the most cities work ("Best: 12:00 to 13:00 (New York), 4 of 5 working").
- Type "3pm Tokyo" (or "Tokyo 3pm", "15h30 lisboa") in the time field to convert from that city in one step.

## Web app (done)
- The Windows app's own renderer running right on the home page, https://openworldclock.com/, built by scripts/build-web.mjs (web/README.md). Cities and settings stay in the browser.
- Share a converted time as a link: Share copies a link with the cities and the time being converted, all after the `#`.

## In progress
The iPhone app and its Home Screen, Lock Screen and StandBy widgets, under apple/.

## Batch 3: faces and modes
11. Optional faces: minimal analog (white by day, black by night) and 24h dial.
12. Big clock mode (StandBy-like), optional red night tint.
13. Transparent "wallpaper" style (digits only, no cards).
14. Size tiers: one city, strip, strip + day lines, planner.

## Batch 4: launch
18. Code signing before enabling installer auto-update (options in PUBLISHING.md, "Code signing for the website build"), then turn on wcUpdates and move electron-updater back to dependencies.
19. Distribution: Store first, then winget for the installer, then the launch posts in docs/launch/.

## Next (ideas, not promises)
Problems that testing confirmed but that were left for later. Nothing here is scheduled.
- Clearer help tips the first time you use the app.
- A copy menu with a Discord timestamp, UTC and a calendar invite (.ics).

## Not doing
Weather (would need network access; breaks the offline promise). Alarms and timers (Windows Clock covers them).
