# Open World Clock Privacy Policy

Last updated: 25 September 2026

The published policy is https://openworldclock.com/privacy. This file has the same text. When the two differ, this
file is the newer one and the page catches up with the next website update.

**The short version:** the Open World Clock apps collect nothing. Your settings stay on your device, the apps work
offline, and they make no network requests of their own. The website counts visits with cookieless, anonymous
analytics, and skips them entirely if your browser sends Do Not Track or Global Privacy Control. Ko-fi loads only if
you click Support.

Open World Clock is a desktop application for Windows that shows the current time in the time zones you choose and
converts times between them. An iPhone app with widgets is in development; it has its own section below.

## Data the app collects

None. Open World Clock does not collect, transmit or share any personal data, usage data or telemetry. There is no
account and no sign-in.

## Data stored on your device

Your choices are saved in a local settings file inside your Windows user profile:

- The cities you add and their order, and any custom labels you give them.
- The working hours and workdays you set per city for the meeting planner.
- Your layout (strip, compact or vertical) and language, plus theme, 12 or 24-hour clock, seconds, opacity, always
  on top, launch at login, zoom level, the window's position and the size you gave each view.

This file never leaves your device. Uninstalling the Microsoft Store build removes it. Uninstalling the installer
build keeps it (in the Open World Clock folder under AppData\Roaming) so your cities survive a reinstall; delete that
folder to remove it.

## Network access

Time zone rules are built into the app, and sunrise and sunset are calculated on your PC, so clocks, conversions
and day and night all work fully offline.

- Installer build (the setup .exe from the website or GitHub): makes no network requests. Automatic update checks
  are turned off until the installer is code-signed, so to update, download the new version from the website. If a
  future signed release turns update checks on, this policy will say so first; the check would only ask the
  project's public GitHub Releases feed for a newer version, with no personal data, settings or identifiers beyond
  what any HTTPS request to GitHub carries, such as your IP address, which GitHub handles under its own privacy
  policy.
- Portable build: makes no network requests and never updates itself.
- Microsoft Store build: makes no requests of its own; the Store handles updates.
- Settings has Website, Report a problem and Check for updates links. They only open the page in your browser; the
  app itself sends nothing. The Report a problem link fills in the app version and build (Installer, Portable or
  Microsoft Store) on the GitHub form, and you see and can change that before anything is sent.
- Copy times puts the times on the clipboard as text and as a small table. Save calendar invite writes an .ics file
  only where you pick in the save dialog. Neither sends anything anywhere.

## Third parties

The app includes no third-party services, analytics, crash reporting or advertising SDKs. The sections above are
about the Windows app. The iPhone app has its own section next, and the last section is only about the website.

## iPhone app and widgets (in development)

The iPhone app and its widgets make no network requests. There is no account, no analytics and no ads, and the app
does not ask for location permission: your home city comes from the iPhone's own time zone setting.

Your cities and their order, custom names, working hours, 12 or 24-hour clock, seconds, theme, language and the
temporary +1 h shift you set from a widget are saved on your iPhone, in storage shared only between the app and its
own widgets (the App Group `group.io.joao.worldclock.shared`). This data never leaves your iPhone. Deleting the app
deletes it.

## The website (openworldclock.com)

Everything above is about the apps; this section is only about the website.

The website (not the apps) uses [PostHog](https://posthog.com/privacy) analytics to count visits and learn which
parts of the page are useful. It is set up to be anonymous:

- **No cookies** and no analytics identifiers in your browser's storage. PostHog counts visitors with a one-way hash
  it computes on its servers from your IP address, browser user agent, the site's name and a random value that
  changes every day and is then deleted, so a visit cannot be linked to you or to your visits on other days.
- **Through our own domain.** Your browser only talks to openworldclock.com. We forward the analytics requests to
  PostHog and strip any cookies on the way. PostHog uses your IP address for that hash and a rough country, and our
  PostHog project is set to discard IP addresses instead of storing them (a PostHog project setting, "Discard client
  IP data").
- **What is recorded:** the pages you view, how far you scroll, which sections come into view, and clicks on a few
  controls (the download buttons, the converter demo, FAQ questions, the theme button, the language picker, links to
  GitHub and Support). Never what you
  type, no session recordings, no time zone, and web addresses are trimmed to the page itself, apart from any
  `utm_` campaign tags in the link you followed.
- **Do Not Track and Global Privacy Control:** if your browser sends either signal, the analytics script does not
  load at all.

**Ko-fi.** The Support button and the Support on Ko-fi links are for tips through
[Ko-fi](https://ko-fi.com/joaothecarvalho). Nothing from Ko-fi loads when you view the page: no script, frame or
cookie. Only if you click Support does your browser load Ko-fi's panel (or open ko-fi.com), and from then on
[Ko-fi's privacy policy](https://more.ko-fi.com/privacy) applies to what you do there. We only count that the button
was clicked, as described above.

**The web app.** The web app runs right on the home page, openworldclock.com. It is the Windows app running in your
browser. Your cities and settings are kept in your browser's local storage and never sent anywhere; clearing this
site's data in your browser removes them. The app loads no analytics of its own. The home page counts the visit as
described above, and which parts of the app you try (adding a city, the converter, the planner, the map, settings,
Share and so on), once each. Nothing you type or choose is recorded: no cities, times or settings. A link made with Share carries its cities and time after the # sign, a part of the address that browsers
never send to a server, and the analytics drop it too.

Nothing else is loaded from other servers. The live demo reads your time zone inside your browser and never sends it
anywhere. If you pick a light or dark theme, that choice is kept in your browser's local storage.

## Contact

Questions about this policy: support@openworldclock.com
