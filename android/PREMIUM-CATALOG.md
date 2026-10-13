# Android Supporter catalog

The Supporter Pack adds home-screen customization. All clocks, conversion, planning, offline city search, languages, sharing and the original City, World and Meeting widgets remain free.

## Implemented catalog

The [widget manifest](widget-catalog.json) records all 13 provider identities, ten premium kinds, city limits and declared minimum dimensions. Palettes and clock faces are counted separately from widget designs.

| Feature | Contents | Boundary |
| --- | --- | --- |
| Duo widget | Two equally prominent city clocks, local dates and time difference relative to the first city | Supporter |
| Board widget | Four city clocks in a 2 by 2 board, with local dates and working status | Supporter |
| Workday widget | One live city clock, numbered daily work timeline, current position and next work start/end | Supporter |
| Sun arc | Live city clock with solar-altitude curve, sunrise/sunset and explicit polar states | Supporter |
| Atlas | Offline land map with sampled day/night shading, selected city pins and three live clocks | Supporter |
| Week | Seven local days of exact shared work windows, with a best-day summary | Supporter |
| Next window | The next shared working interval over eight days, including no-overlap state | Supporter |
| Hour ruler | Three aligned city-hour strips with fractional offsets and working-hour shading | Supporter |
| Date line | Selected cities grouped by their actual local date relative to home | Supporter |
| Clock change | Next time-zone offset transition among selected cities, or explicit no-change state | Supporter |
| Palettes | Paper, Linen, Daybreak, Mist, Sage, Blossom, Chalk, Ink, Forest, Midnight, Espresso, Plum, Slate, Ember, Cobalt, Rust | 16 Supporter palettes |
| Clock faces | System, Light, Medium, Black, Condensed, Serif, Mono | System free; six additional Supporter faces |
| Curated looks | Newsprint, Paper, Linen, Daybreak, Awning, Mist, Station, Sage, Blossom, Chalk, Receipt, Headline, Ink, Almanac, Forest, Canopy, Midnight, Terminal, Espresso, Plum, Slate, Ember, Cobalt, Rust | 24 Supporter combinations |
| Saved appearances | Up to 12 named theme/face/style presets, reusable without copying city selections | Supporter creation/application; retained after expiry |
| Preview browser | Free styles followed by Light, Dark and Vivid shelves; selected look rendered by native RemoteViews | Browsing and trying are free |

The thirteen widget types are actual configurable launcher entries. The ten additional widgets share the same entitlement as palettes, faces and saved appearances. Workday uses configured work days and hours, including overnight shifts. Its timeline spans the actual local civil day; daylight-saving changes can make this 23 or 25 hours. Dates, work status and timeline metadata update on widget refresh, normally at the platform's 30-minute interval; TextClock digits remain live independently.

Requested US base prices are **US$1/month or US$5/year**, with the same benefits. The app displays localized prices returned by Google Play, never these target amounts as a checkout fallback. Products are not configured in this development build, so real purchases are unavailable. See [BILLING.md](BILLING.md).

## Expiry and compatibility

Without verified access, premium themes/faces render the saved free style and system face. Duo, Board, Atlas, Week, Hour ruler and Date line render a free World widget; Workday, Sun arc, Next window and Clock change render a free City widget. No widget or saved configuration is deleted. The original layout and appearance return when verified access returns. The two subscription caches expire after 24 hours without ownership verification.

Stable IDs identify catalog data. Old uppercase theme/font settings migrate without changing cities or free styles. Unknown IDs resolve safely and remain stored so a future catalog version can recognize them. Clock faces are system families carried in TextClock spans across the launcher process. Native previews use the same renderer as installed widgets.

## Prioritized roadmap, not purchase promises

These are proposals, not included features or advertised future entitlements. Effort estimates are relative: small (a few focused implementation days), medium (roughly one to two weeks), large (multiple weeks plus external validation).

| Priority | Proposal and user benefit | Effort | Dependencies and proposed boundary |
| --- | --- | --- | --- |
| P0 | Server-side purchase verification and reliable expiry/revocation handling | Large | Play Developer API, authenticated verification design, notifications, privacy review. Required before a broad paid launch; infrastructure, not a paid feature |
| P0 | Play internal-track subscription lifecycle coverage | Medium | Real product setup and testers; renewals, cancellation, pending purchases, refunds, account changes, offline expiry. Release gate |
| P0 | Minimum Android and launcher compatibility matrix | Medium | Physical devices and API 26 plus common launchers; resizing, restore, pin callbacks, font resolution. Quality work for everyone |
| P1 | Minimal City layout for a quieter home screen | Small | Native layout, preview and accessibility testing. Proposed additional Supporter layout; original City stays free |
| P1 | Named appearance collections grouping saved looks by context | Medium | Bounded collection codec, migration, reorder UI. Proposed Supporter organization; existing presets retained |
| P1 | Optional compact city information controls | Medium | Size rules and native accessibility labels; hide/show date, offset or work status without hiding time. Proposed Supporter customization |
| P1 | Accessible high-contrast widget choices | Small | Contrast and large-text validation. Core accessibility stays free; no paywall for legibility fixes |
| P1 | Safe local settings export/import | Medium | Versioned document format, validation, Android document picker; no billing receipts in exports. Proposed free data portability |
| P2 | Week display preferences | Medium | Alternate first day, density and selection controls; existing seven-day widget remains included |
| P2 | Travel pair preset switching | Medium | Explicit manual city-pair selection and labels; no location permission. Proposed Supporter convenience |
| P2 | Per-widget 12/24-hour override | Small | Inherit/default setting and codec migration. Boundary to decide; app-wide switch stays free |
| P2 | Per-widget text density choice | Medium | Minimum-size metrics, font-scale testing, launcher resize behavior. Proposed customization; safe auto-sizing remains free |
| P2 | Optional palette changes following local sunrise/sunset | Medium | Clear chosen-city rule and platform refresh limitations. Proposed additional themes; existing AUTO remains free |
| P2 | Seasonal curated collections | Small | Distinct useful palettes, measured contrast and translations. Additional Supporter content only if it adds meaningful variety |
| P2 | Better workday transition freshness | Medium | Android scheduling/battery constraints, no exact-alarm permission assumption. Correctness improvements apply to all affected widgets |
| P3 | Calendar-aware availability | Large | Explicit permission design, local calendar access, privacy controls and recurrence logic. Unscoped; no current promise |
| P3 | Cross-device appearance sync | Large | Account/security/backend design, deletion/export controls and ongoing service cost. Unscoped; offline use must remain available |
| P3 | Shareable appearance files | Medium | Safe versioned import format with catalog fallback; never transfers ownership. Proposed free sharing, paid appearance still requires access |
| P3 | Additional scripts and right-to-left support | Large | Translation contributors, font and native layout coverage. Languages stay free |

No ads, accounts, analytics, forced sharing or incentivized reviews are part of this catalog. Production signing, publication and store activation are separate release steps.

## Design references and identity

Feature research considered [Timezone](https://www.timezone-app.com/) for daylight relationships, [timeanddate](https://www.timeanddate.com/android/worldclock/) for offset-change information, and [Android widget design guidance](https://developer.android.com/design/ui/widget) for native layout behavior. These informed useful jobs, not copied assets or screen designs. The collection uses Open World Clock's own daylight/ink palettes, shared current-time markers and native typography; see [DESIGN.md](DESIGN.md) for the settled visual system.
