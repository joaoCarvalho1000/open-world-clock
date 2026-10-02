# Search setup status

Checked in the owner's authenticated Chrome session on October 1, 2026.

## Google Search Console

The domain property `sc-domain:openworldclock.com` was already verified and accessible.
The existing `https://openworldclock.com/sitemap.xml` submission shows **Success**,
submitted September 25 and last read September 30, with 38 discovered pages.
That count describes Google's previous sitemap processing, not the new local sitemap.

| URL path | Google inspection result |
| --- | --- |
| `/` | Indexed; Google-selected canonical is the inspected URL |
| `/time-zone-converter` | Indexed; one valid breadcrumb item |
| `/meeting-planner` | Indexed; Google-selected canonical is the inspected URL |
| `/pt/` | Indexed; Google-selected canonical is the inspected URL |
| `/es/` | Indexed; Google-selected canonical is the inspected URL |
| `/london-to-new-york-time` | Unknown to Google; new page remains local |

The inspected homepage, planner and translated homepages allow crawling and indexing,
and their latest page fetches succeeded. The Portuguese URL's sitemap-discovery field
showed a temporary processing error even though the URL is indexed and the sitemap's
overall report is successful. Recheck this after the next sitemap crawl.

Overview showed 3 total web search clicks, 28 HTTPS pages, 23 valid breadcrumb entries
and zero invalid breadcrumb entries. The aggregate indexing report was still processing;
Core Web Vitals had insufficient field data. These figures are a baseline, not evidence
of results from the unpublished changes.

## Bing Webmaster Tools

Imported **only** `https://openworldclock.com/` through the official Google Search Console
connection. Other listed properties were deselected. Bing's import uses read-only Google
access for property verification and sitemap synchronization.

The domain then became available in the site selector. Its historical sitemap report
already showed **Success**, submitted and crawled September 25, with 35 discovered URLs,
zero errors and zero warnings. No duplicate sitemap submission was needed.

| URL path | Bing inspection result | Action confirmed |
| --- | --- | --- |
| `/` | Indexed successfully | None needed |
| `/time-zone-converter` | Discovered but not crawled | Indexing requested |
| `/meeting-planner` | Discovered but not crawled | Indexing requested |
| `/pt/` | Discovered but not crawled | Indexing requested |
| `/es/` | Discovered but not crawled | Indexing requested |

Bing confirmed each of the four indexing requests. Submission is not a guarantee of
crawling or indexing. The generic exclusion text does not identify a specific technical
block; do not change Cloudflare bot protections based on that message alone.

Bing reported one image-alt notice for the homepage's September 29 crawl. Inspection
of the displayed crawled HTML found alt attributes on every image, meaningful text for
the product screenshots, and empty alt attributes on decorative logos. Preserve those
empty attributes for accessibility rather than adding redundant text to silence a notice.

## Production deployment — October 1, 2026

Published the tested SEO/UI changes and 75-page sitemap to the `main` production branch
of Cloudflare Pages project `open-world-clock`, following the owner's deployment instruction.
Deployment: `https://75805d76.open-world-clock.pages.dev`.
Production: `https://openworldclock.com`.

All predeployment checks passed: SEO, CSP, asset versions, generated web app, shared site
navigation and download links. All 75 sitemap pages returned successful HTTP responses.
The live sitemap exactly matches the local file. Most HTML files match byte for byte;
Cloudflare's existing email obfuscation transforms the support/privacy pages. The published
London–New York page's canonical and working embedded tool were verified in Chrome.

IndexNow first returned 202 (accepted, key validation pending). The notification hook now
handles that documented response without marking the deployment failed, while retaining
the old manifest for a later retry. The retry returned 200 for all 75 URLs; the manifest
was saved, and a subsequent dry run found zero changed/new/deleted URLs.

Google confirmed the refreshed sitemap submission, with **Success**, 75 discovered pages,
and October 1 submitted/last-read dates. Bing accepted the refreshed sitemap on October 1
and reports **Processing**; its previous crawl count remains 35 until processing completes.
Google's individual London–New York inspection still reports unknown/not indexed immediately
after publication. Sitemap processing and IndexNow receipt do not mean pages are indexed yet.

Review indexing, non-brand queries and tool interactions weekly using the maintenance
instructions in `README.md`. No custom analytics dashboard has been configured yet.

No credentials are stored in this report.
