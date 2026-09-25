# Show HN

Post on a weekday morning, US time. Stay around for the first few hours to answer.

## Title

Show HN: Open World Clock, a free and open source world clock for Windows

## URL

https://github.com/joaoCarvalho1000/open-world-clock

## First comment

I wanted a world clock on Windows that was actually good and couldn't find one, so I'm building it and giving it away.

It's a small window that can stay on top, with one card per city. Each card follows that city's real sunrise and sunset,
so you can see who is awake at a glance. You can type a time in any city and every card converts, scroll the mouse
wheel over a card to move all the clocks in 15 minute steps, find the overlap in a meeting planner with per-city
working hours, or open a world map with live day and night.

A few things that might be interesting here:

- Sunrise and sunset are computed offline from each city's coordinates (src/renderer/sun.js, based on the NOAA
  formulas). Time zone rules are built into the app, so nothing needs the network.
- An iPhone version is in progress. Its core is a Swift package tested against the same reference vectors
  (shared/golden.json), which are generated from the Windows app's own code, so both apps compute the same times,
  sunsets and overlaps.
- There is also a web version, running right on the home page
  (https://openworldclock.com/?utm_source=hn&utm_medium=social&utm_campaign=launch-1.3.0), that is not a port:
  scripts/build-web.mjs joins the Windows app's own renderer files (src/renderer/) with a thin browser layer (web/)
  that stands in for the Electron bridge and keeps settings in localStorage. A link from its Share button keeps the cities and time after
  the #, so they never reach a server.
- The app has no telemetry and makes no network requests. The website does count visits: it uses PostHog without
  cookies, through its own /ingest proxy on openworldclock.com, and the script does not load under Do Not Track or
  Global Privacy Control. PRIVACY.md has the details.

It's completely free, with no ads, no account and no upsell, and MIT licensed. I don't think you should have to pay
for software like this.

Microsoft Store: https://apps.microsoft.com/detail/9N88FR8M81BM?cid=launch-hn

Website: https://openworldclock.com/?utm_source=hn&utm_medium=social&utm_campaign=launch-1.3.0

## Prepared answers

**Why Electron?** Honestly, because it was faster for me to build it that way. The cost is a bigger download than a
native app would be.

**Why is the installer unsigned?** It isn't code-signed yet. Until it is, SmartScreen may show "Windows protected
your PC" the first time (More info, then Run anyway), and the installer's automatic updates stay off: signing comes
first, then updates get turned on. The Microsoft Store build is signed by Microsoft and the Store keeps it updated,
so that is the easy route.

**Mac or Linux?** Not planned as desktop apps today. The web version runs in any modern browser, and the iPhone app
is the one in progress.

**Can I send a pull request?** Not right now; I'm not accepting pull requests yet. Issues with bugs and ideas are
very welcome.
