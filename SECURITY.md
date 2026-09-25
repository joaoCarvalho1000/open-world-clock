# Security

## Supported versions

I fix security issues in the latest 1.3.x release. If you are on an older version, please update first and check
whether the problem is still there.

## Reporting a vulnerability

Please report it privately through a GitHub security advisory:

https://github.com/joaoCarvalho1000/open-world-clock/security/advisories/new

Please don't open a public issue for it. The same address is listed in
[site/.well-known/security.txt](site/.well-known/security.txt), published at
https://openworldclock.com/.well-known/security.txt.

It helps if you tell me:

- what you found and what someone could do with it
- the steps to reproduce it
- which build you used (Microsoft Store, installer, portable or the web app) and its version, shown at the bottom of
  Settings next to the app name

I'll reply in the advisory and keep the details private until a fix is out. English, Portuguese or Spanish are all
fine.

## Scope

- The Windows app: the installer, the portable exe and the Microsoft Store build.
- The web app on the home page, https://openworldclock.com/, built from the Windows app's renderer by `scripts/build-web.mjs`
  ([web/README.md](web/README.md)).
- The iPhone app and its widgets, which are still in development.
- The website, openworldclock.com, and its `/ingest` analytics proxy (the Cloudflare Pages Function in
  [cloudflare/](cloudflare/)).
