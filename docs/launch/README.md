# Launch posts

Drafts for the first public launch of Open World Clock 1.3.0. Post nothing until every step of
[First public launch](../../PUBLISHING.md#first-public-launch-order-matters) in PUBLISHING.md up to step 6 passes:
the Store listing is live, the repo is public, the v1.3.0 release has its four files, the site names them, and
`npm run links` in `cloudflare/` is green. Step 7 there is this folder.

## Order

1. The Microsoft Store listing is live and opens in a private window.
2. Reddit, r/Windows11: [reddit-windows11.md](reddit-windows11.md).
3. Show HN, on a weekday morning, US time: [show-hn.md](show-hn.md).
4. Product Hunt: [product-hunt.md](product-hunt.md).

Leave time between them to answer comments. Every claim in the drafts comes from the README or PRIVACY.md; if the app changes
before posting, change the drafts too.

## Links

Every link carries the channel it is posted on, in the format from PUBLISHING.md step 7: Store links get
`?cid=launch-<channel>` (Partner Center groups installs by that campaign ID), and site links get
`?utm_source=<channel>&utm_medium=social&utm_campaign=launch-1.3.0` (the only query parameters the site's analytics
keep). The GitHub repo link stays untagged.

| Channel | `<channel>` | Store URL | Site URL |
| --- | --- | --- | --- |
| Reddit r/Windows11 | `reddit-w11` | https://apps.microsoft.com/detail/9N88FR8M81BM?cid=launch-reddit-w11 | https://openworldclock.com/?utm_source=reddit-w11&utm_medium=social&utm_campaign=launch-1.3.0 |
| Show HN | `hn` | https://apps.microsoft.com/detail/9N88FR8M81BM?cid=launch-hn | https://openworldclock.com/?utm_source=hn&utm_medium=social&utm_campaign=launch-1.3.0 |
| Product Hunt | `ph` | https://apps.microsoft.com/detail/9N88FR8M81BM?cid=launch-ph | https://openworldclock.com/?utm_source=ph&utm_medium=social&utm_campaign=launch-1.3.0 |

The web app runs right on the home page, so the site URL is also the link to try it in the browser, for example
`https://openworldclock.com/?utm_source=ph&utm_medium=social&utm_campaign=launch-1.3.0`. The tags go in the
query, never after the `#`: the web app reads the part after `#` as a shared list of cities.

Messaging, in every post: the best world clock for Windows, completely free, no strings attached. Open source (MIT),
no telemetry, no data collection, no account, no ads, no upsell. Call it a world clock, not a widget.

Repo: https://github.com/joaoCarvalho1000/open-world-clock
