# Contributing

Thanks for wanting to help Open World Clock.

## What helps most right now

- **Bug reports.** Open an [issue](https://github.com/joaoCarvalho1000/open-world-clock/issues) with your Windows version, how you installed it (Microsoft Store, installer or portable exe), what you did and what happened.
- **Ideas.** If something is missing for how you work across time zones, open an issue and describe the situation, not just the feature.
- **Translations.** The app is in English, Portuguese and Spanish. If a phrase sounds off in your language, or you'd like another language, open an issue with the text and your suggestion.
- **Accessibility.** Reports from keyboard, NVDA, Narrator or high contrast users are very welcome.

## Pull requests

I'm not accepting pull requests at the moment, so the project can stay small and consistent while it's new. Please open an issue instead, and I'll credit you when your report or idea ships.

## Security

Please don't open a public issue for a security problem. See [SECURITY.md](SECURITY.md) for how to report it privately.

## Running it locally

```
npm install
npm start
npm test
```

The README has the details on the tests, the web version and the iPhone port.

## Website and maintainer checks

Maintainer and bot-authored pull requests run the same CI. The website job checks
the generated web app, SEO metadata, language links, asset versions, CSP hashes,
privacy behavior, and real browser interactions at mobile and desktop sizes.
From the repository root, with Node 24.19.0 and Chrome or Edge installed:

```sh
npm ci --ignore-scripts
npm ci --prefix cloudflare --ignore-scripts
node --test 'test/unit/*.test.js' 'cloudflare/*.test.mjs' test/web/shim.test.mjs
node scripts/build-web.mjs --check
node cloudflare/seo-check.mjs
node cloudflare/site-chrome.mjs
node cloudflare/asset-versions.mjs
node cloudflare/csp-hashes.mjs
npm audit --audit-level=high
npm audit --prefix cloudflare --audit-level=high
```

For `node test/web/seo.test.mjs`, set `PUPPETEER_CORE` to the absolute path of
`cloudflare/` and `CHROME_PATH` to the browser executable. This suite checks time
conversion, DST, sharing, localization, and mobile layouts. Screenshots are saved
under `dist/seo-shots/`.

The `CI gate` job fails if any unit, website, or desktop job fails, is cancelled,
or is skipped. Desktop failures are blocking, including runner configuration
failures. A failure already present on `main` is not permission to bypass it.
Require `CI gate` in GitHub settings after it has run; YAML alone does not enforce
merge protection. Review the latest PR commit and the generated pages before merging.
These checks do not publish the website or release desktop or iOS packages.

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
