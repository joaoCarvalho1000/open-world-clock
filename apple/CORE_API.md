# WorldClockCore API contract (what the app and the widgets can rely on)

Module: `WorldClockCore` (Swift Package at `apple/WorldClockCore`, library product `WorldClockCore`).
Swift tools 5.9+, language mode Swift 5 (strict concurrency warnings OK, no errors), platforms `.iOS(.v17), .macOS(.v14)`.
Imports: `Foundation` ONLY (no UIKit, SwiftUI, WidgetKit, CoreGraphics, os). Must build and test on Windows/Linux.
Everything listed below is `public`. All value types are `Sendable`, `Hashable`, and `Codable` where noted.
Callers (app, widgets) may use ONLY what is listed here. If you need more, add it to the core and to this file.

Identifiers:
- Bundle ids: app `io.joao.worldclock`, widget extension `io.joao.worldclock.widgets`.
- App Group: `group.io.joao.worldclock.shared` (exposed as `SettingsStore.appGroupID`).
- URL scheme: `worldclock` (see `DeepLink`).

Time zone ids are IANA strings (`String`). All epochs are `Date`. Weekday numbering is JS style: 0 = Sunday ... 6 = Saturday.

---------------------------------------------------------------------------------------------------------
## Basic types

```swift
public struct Coordinate: Codable, Hashable, Sendable { public var lat: Double; public var lng: Double; public init(lat: Double, lng: Double) }
public struct HourMinute: Codable, Hashable, Sendable, Comparable { public var hour: Int; public var minute: Int; public init(hour: Int, minute: Int)
    public var totalMinutes: Int { get } }
public struct WallClock: Hashable, Sendable {             // wall-clock fields of an instant in a zone
    public var year, month, day, hour, minute, second: Int
    public var weekday: Int                                // 0 = Sunday
    public var ymd: String { get }                         // "2026-09-23"
}
public enum Phase: String, CaseIterable, Codable, Sendable { case night, dawn, morning, midday, afternoon, golden, dusk
    public var localizationKey: String { get }             // "phase.night" etc. (keys of shared/strings.json)
}
```

## TimeMath (port of src/renderer/time.js + helpers from app.js)

```swift
public enum TimeMath {
    public static func timeZone(_ id: String) -> TimeZone?                 // cached TimeZone(identifier:)
    public static func offsetMinutes(_ zone: String, at date: Date) -> Int  // UTC offset in minutes (seconds truncated like JS)
    public static func formatOffset(_ minutes: Int) -> String              // "+5:30", "-7", "+0"
    public static func utcLabel(_ zone: String, at date: Date) -> String   // "UTC+5:30" (card .utc text)
    public static func wallClock(_ zone: String, at date: Date) -> WallClock
    public static func ymd(_ zone: String, at date: Date) -> String        // "YYYY-MM-DD"
    /// Wall time in `zone` -> instant. Overlap (clocks back): FIRST occurrence. Gap (clocks forward):
    /// shifted forward by the gap (uses the pre-transition offset), exactly like time.js zonedToEpoch.
    public static func zonedToEpoch(_ zone: String, year: Int, month: Int, day: Int, hour: Int, minute: Int) -> Date
    public static func dayDiff(_ zone: String, at date: Date, relativeTo refZone: String) -> Int
    /// nil when zone == localZone (UI shows localized "rel.local"); otherwise "±0", "+5h", "-3h30m" (app.js relLabel).
    public static func relativeOffsetLabel(_ zone: String, at date: Date, localZone: String) -> String?
    public static func phaseOf(hour: Int) -> Phase                          // time.js phaseOf (clock-hour fallback)
    public static func isLikelyAsleep(_ zone: String, at date: Date) -> Bool // local hour >= 22 || < 7
    /// time.js uniqueClocks: keeps the first zone of each group that shows the same time all year (same offset at `ref`
    /// and on Jan 15 and Jul 15 00:00 UTC of ref's UTC year), in order. An unknown zone is its own group ("zone:" + id).
    public static func uniqueClocks(_ zones: [String], at ref: Date) -> [String]
}
```

## ClockText (deterministic digits for cards/widgets)

```swift
public struct ClockText: Hashable, Sendable {
    public var hm: String       // "09:05" (24h, zero-padded hour) or "9:05" (12h)
    public var seconds: String  // "07"
    public var ampm: String     // "" in 24h; locale AM/PM symbol in 12h (en: "AM"/"PM")
    public static func make(_ zone: String, at date: Date, hour12: Bool, locale: Locale = .current) -> ClockText
}
public enum DurationParts { public static func split(_ minutes: Int) -> (hours: Int, minutes: Int) }   // abs value; UI localizes with "unit.h"/"unit.min"
```

## ParseTime (time.js parseTime)

```swift
public enum ParseTime {
    /// Accepts "9", "09", "930", "9:30", "9.30", "3pm", "3 pm", "3:15pm", "15h", "15h30"; nil if invalid.
    public static func parse(_ text: String) -> HourMinute?
    /// Text for an editable field that round-trips through parse(): "15:00" or "3:00 PM".
    public static func inputText(_ hm: HourMinute, hour12: Bool) -> String
}
```

## Sun (port of src/renderer/sun.js + app.js sunPhase)

```swift
public enum Polar: String, Codable, Sendable { case day, night }            // midnight sun / polar night
public struct SunTimes: Hashable, Sendable { public var sunrise: Date?; public var sunset: Date?; public var polar: Polar? }
public struct SunEvent: Hashable, Sendable { public enum Kind: String, Sendable { case sunrise, sunset }; public var kind: Kind; public var date: Date }
public enum Sun {
    public static func altitude(at date: Date, lat: Double, lng: Double) -> Double        // degrees
    public static func times(at date: Date, lat: Double, lng: Double) -> SunTimes          // solar day nearest `date`
    public static func isDay(at date: Date, lat: Double, lng: Double) -> Bool              // altitude > -0.833
    public static func isRising(at date: Date, lat: Double, lng: Double) -> Bool           // altitude(t+10min) > altitude(t)
    /// app.js sunPhase: real-sun phase; localHour only separates morning/midday/afternoon.
    public static func phase(at date: Date, coordinate: Coordinate, localHour: Int) -> Phase
    /// Convenience: coordinates from ZoneCatalog.shared; falls back to TimeMath.phaseOf(hour:) when unknown.
    public static func phase(zone: String, at date: Date) -> Phase
    public static func isDay(zone: String, at date: Date) -> Bool   // falls back to 7 <= hour < 19 without coords
    /// Sunrise/sunset instants in (from, until], sorted. Used for widget timeline entries.
    public static func events(for coordinate: Coordinate, from: Date, until: Date) -> [SunEvent]
}
```

## Sky (card gradient by sun altitude; colors ported from src/renderer/motion/sky.css + style.css)

```swift
public struct RGBA: Hashable, Sendable, Codable { public var r, g, b, a: Double }    // sRGB 0...1 (oklch converted to sRGB at build time)
public enum SkyPhase: String, CaseIterable, Sendable { case night, twilight, dawn, day, golden, dusk }   // exactly the 6 phases of motion/sky.js
public enum Sky {
    public static func phase(at date: Date, coordinate: Coordinate) -> SkyPhase         // same thresholds as motion/sky.js
    public static func phase(zone: String, at date: Date) -> SkyPhase
    public static func gradient(_ phase: SkyPhase, dark: Bool) -> (top: RGBA, bottom: RGBA)   // "a" = top, "b" = bottom
    public static func isNightSurface(_ phase: SkyPhase) -> Bool   // navy card with light text. NOTE: the card surface itself follows !Sun.isDay (like app.js is-night); prefer Sun.isDay(zone:at:) for surface choice, SkyPhase only for the gradient
}
public enum Palette {        // style.css tokens, light and dark
    public static func canvas(dark: Bool) -> RGBA          // pale blue / deep navy page background
    public static func accent(dark: Bool) -> RGBA          // single system-blue accent (home + converted)
    public static func dayCard(dark: Bool) -> RGBA; public static func nightCard(dark: Bool) -> RGBA
    public static func dayText(dark: Bool) -> RGBA; public static func nightText(dark: Bool) -> RGBA
    public static func secondaryText(night: Bool, dark: Bool) -> RGBA
}
```

## Zones (loads shared/zones.json, bundled as a package resource)
zones.json keys: `meta`, `coords`, `abbreviations`, `defaultZones`, `legacy` (app.js LEGACY), `countryCodes` (zones.js ZONE_CC),
`cityNames` (zones.js ZONE_I18N, pt/es), `countryNames` (lang -> ISO code -> short name: the Intl.DisplayNames output app.js regionOf uses,
captured by the exporter so iOS shows the same names without depending on the platform ICU).

```swift
public struct ZoneMeta: Codable, Hashable, Sendable { public var city: String; public var country: String; public var alias: String?; public var lat: Double?; public var lng: Double? }
public final class ZoneCatalog: @unchecked Sendable {
    public static let shared: ZoneCatalog                         // Bundle.module "zones.json"; fatalError only if the resource is missing
    public init(jsonData: Data) throws
    public let meta: [String: ZoneMeta]                            // curated ZONE_META
    public let abbreviations: [String: [String]]                   // lower-case abbr -> zones (app.js ABBR)
    public let legacy: [String: String]                            // legacy id -> canonical id (app.js LEGACY, e.g. "Asia/Tel_Aviv" -> "Asia/Jerusalem")
    public func canonical(_ zone: String) -> String               // app.js canonical: legacy[zone] ?? zone
    public var allZoneIDs: [String] { get }                        // every id valid for Foundation TimeZone on this OS (meta ∪ coords ∪ knownTimeZoneIdentifiers), sorted
    public func isValid(_ zone: String) -> Bool
    public func coordinate(of zone: String) -> Coordinate?        // meta lat/lng, else ZONE_COORDS
    public func cityName(of zone: String) -> String               // ENGLISH (app.js englishCity): meta city, else last path component with "_" -> " " ("UTC" -> "UTC")
    public func cityName(of zone: String, language: AppLanguage) -> String   // app.js cityOf: ZONE_I18N name (pt/es), else cityName(of:); .auto is resolved
    public func country(of zone: String) -> String?               // English ZONE_META country, else IANA area for "Region/City", else nil
    public func country(of zone: String, language: AppLanguage) -> String    // app.js regionOf: countryNames[lang][ZONE_CC], else meta country, else IANA area
    public func countryCode(of zone: String) -> String?           // ZONE_CC ISO 3166 code
    public func displayName(of zone: String, labels: [String: String]) -> String   // custom label if non-empty, else cityName
    public static let defaultZones: [String]                      // ['Europe/Lisbon','America/New_York','America/Los_Angeles','Europe/London','Asia/Singapore']
    /// First-run list: defaultZones filtered to Set(TimeMath.uniqueClocks([home] + defaultZones minus home, at: date)),
    /// in defaultZones order; home is not added (the app shows it implicitly). São Paulo -> Lisbon, NY, LA, Singapore.
    public static func firstRunZones(home: String, at date: Date) -> [String]
}
```

## Search (app.js searchZones + parseOffsetQuery)

```swift
public struct SearchResult: Hashable, Sendable {
    public enum Kind: Hashable, Sendable { case text, abbreviation, offset(minutes: Int) }
    public var zones: [String]; public var kind: Kind
}
public enum Search {
    public static func parseOffsetQuery(_ query: String) -> Int?  // exact JS semantics: CASE-SENSITIVE ("utc+5:30" ok, "UTC+5:30" -> nil); search() folds first, so "UTC+5:30" works in search. A lone "z" is NOT an offset (v1.2)
    public static func fold(_ text: String) -> String             // app.js fold: NFD, drop U+0300...U+036F, lower-case ("São" -> "sao")
    public static func search(_ query: String, excluding: Set<String> = [], labels: [String: String] = [:],
                              now: Date = Date(), limit: Int = 10, language: AppLanguage = .en,
                              catalog: ZoneCatalog = .shared) -> SearchResult
}
```
Ranking identical to app.js: query = fold(trim(query)); offset query -> zones whose current offset matches (curated first, then by localized city);
abbreviation hits first; then localized-or-English city / label prefix (0), contains (1), haystack contains curated (2) / uncurated (3), ties by
localized city name. Haystack = id, localized city, English city, label, `country(of:language:)`, meta country + alias, all folded
(accent- and case-insensitive: "sao", "zurich", "toquio" match). Callers pass the settings language (app: AddCitySheet; widgets: CityQuery).

## Working hours and Planner (app.js isWorking / cellState / buildPlanner)

```swift
public struct WorkingHours: Codable, Hashable, Sendable {
    public var start: String   // "HH:MM" 24h
    public var end: String     // end < start = overnight shift
    public var days: [Int]     // working weekdays, 0 = Sunday, sorted unique
    public static let `default`: WorkingHours   // 09:00-18:00, [1,2,3,4,5]
    public var isValid: Bool { get }            // CONTRACT.md rules
    public var startMinutes: Int { get }; public var endMinutes: Int { get }
}
public enum CellState: String, Codable, Sendable { case work, night, off }
public struct PlannerRow: Hashable, Sendable { public var zone: String; public var cells: [CellState]; public var localTimes: [HourMinute] }  // 24 each
public struct PlannerRun: Hashable, Sendable { public var start: Int; public var end: Int; public var hours: Int { get } }   // [start, end) column indexes
public struct PlannerResult: Hashable, Sendable {
    public var columns: [Date]          // 24 instants: hour h:00 of the day in the source zone (zonedToEpoch)
    public var rows: [PlannerRow]
    public var runs: [PlannerRun]       // contiguous columns where EVERY zone is .work (none if zones empty)
    public var totalHours: Int
    public var best: PlannerRun?        // longest run (first wins on ties)
}
public struct PlannerPartial: Hashable, Sendable {  // best hours of a day without a full overlap
    public var working: Int             // cities working in each column of `runs` (the day's highest count, >= 2)
    public var total: Int               // rows in the plan
    public var runs: [PlannerRun]       // maximal groups of adjacent columns with the top score (see `partial`)
    public var best: PlannerRun         // longest run (earliest on ties)
    public init(working: Int, total: Int, runs: [PlannerRun], best: PlannerRun)
}
public enum Planner {
    public static func hours(for zone: String, in hours: [String: WorkingHours]) -> WorkingHours   // invalid/missing -> .default
    public static func isWorking(_ zone: String, hours: WorkingHours, at date: Date) -> Bool
    public static func cellState(_ zone: String, hours: WorkingHours, hourStart: Date) -> CellState
    public static func plan(source: String, year: Int, month: Int, day: Int, zones: [String], hours: [String: WorkingHours]) -> PlannerResult
    /// nil when totalHours > 0, rows.count < 3 or no column has 2+ cities working. Columns score like time.js bestHours
    /// ([cities working, `prefer` zones working, minus cities at night], in that order); `runs` are the top-score runs
    /// and `best` the longest (earliest on ties), the run bestHours returns. The app passes [home zone, planner source],
    /// as app.js buildPlanner does. No golden vectors (bestHours is not exported); PlannerPartialTests checks it against
    /// bestHours results computed in node.
    public static func partial(_ plan: PlannerResult, prefer: [String] = []) -> PlannerPartial?
}
```

## Clock changes (app.js nextOffsetChange / dstNote)

```swift
public struct OffsetChange: Hashable, Sendable {
    public var at: Date                 // first instant with the new offset (minute precision)
    public var deltaMinutes: Int        // +60 forward, -60 back, can be ±30
    public var oldOffsetMinutes: Int
    public var wallClockBefore: HourMinute   // wall time at the change in the OLD offset ("at 02:00")
}
public struct ClockChangeNote: Hashable, Sendable {
    public var change: OffsetChange
    public var daysUntil: Int           // 0 today, 1 tomorrow, n days (calendar days in the zone)
    public var dayOfChange: Date        // an instant on the local day of the change (for date formatting)
    public var textKey: String { get }  // "dst.today" (daysUntil <= 0) / "dst.tomorrow" (1) / "dst.in"
    public var textVars: [String: String] { get }   // ["delta": deltaText] (+ ["n": daysUntil] for dst.in)
}
public enum ClockChanges {
    public static func nextOffsetChange(_ zone: String, after date: Date, withinDays: Int = 7) -> OffsetChange?
    public static func note(_ zone: String, at date: Date) -> ClockChangeNote?
    public static func deltaText(_ deltaMinutes: Int) -> String   // "+1h", "−1h", "−30m", "+1h30m" (U+2212; not localized)
}
```
UI text (v1.2 wording): `L10n.tr(note.textKey, note.textVars)` -> "Clocks −1h tomorrow" / "Clocks +1h in 3 days"; tooltip `dst.forward` / `dst.back`
with `{d}` = durationText ("1 h", "30 min").

## Localization helper (pure)

```swift
public enum Template {
    /// Replaces {name} placeholders like i18n.js t(key, vars); unknown placeholders are left as-is.
    public static func fill(_ template: String, _ vars: [String: String]) -> String
}
public enum AppLanguage: String, Codable, CaseIterable, Sendable { case auto, en, pt, es
    public var lprojName: String? { get }     // nil for auto, "en", "pt-BR", "es"
    /// Never .auto. auto = the FIRST preferred language the app speaks (pt* / es* / en*; others skipped; none -> en), like src/main.js
    /// systemLanguage over the OS preferred-languages list: ["fr-FR", "pt-BR"] -> .pt (v1.2; previously only the first entry counted).
    public static func resolve(_ lang: AppLanguage, preferred: [String] = Locale.preferredLanguages) -> AppLanguage
    public var localeIdentifier: String { get } // "en-US", "pt-BR", "es-419" (resolved)
}
```
String Catalog: `apple/Shared/Localizable.xcstrings` generated by `scripts/export-xcstrings.mjs` from `shared/strings.json`.
Keys = the i18n.js keys verbatim (e.g. "phase.night", "dst.in"); languages en (source), pt-BR, es; `{name}` placeholders kept literally
(no printf specifiers) and filled at runtime with `Template.fill`. The app/widget helper `L10n.tr(_ key: String, _ vars: [String: String] = [:]) -> String`
lives in `apple/Shared/L10n.swift` (compiled into BOTH app and widget targets; part of the app, not the core) and resolves the
language via `AppLanguage` + the matching `.lproj` bundle, falling back to `Bundle.main` localized lookup, then to the key.

## Settings shared through the App Group

```swift
public enum ThemeSetting: String, Codable, CaseIterable, Sendable { case system, light, dark }
public struct AppSettings: Codable, Hashable, Sendable {
    public var zones: [String]                       // ordered; zones[0] is NOT special; "home" = device zone
    public var labels: [String: String]              // custom labels (<= 40 chars)
    public var hours: [String: WorkingHours]
    public var hour12: Bool                          // default: from locale (true for en-US); default value false in `default`, app may override on first run
    public var showSeconds: Bool                     // default false
    public var theme: ThemeSetting                   // default .system
    public var language: AppLanguage                 // default .auto
    public var widgetShiftMinutes: Int               // 0 normally; +60 per "+1 h" widget button press
    public var widgetShiftExpires: Date?             // shift auto-resets after this instant (set to now + 1 h on each press)
    public static let `default`: AppSettings
    public init(from decoder: Decoder) throws        // tolerant: missing keys -> defaults; invalid zones/hours dropped
    public func sanitized(catalog: ZoneCatalog = .shared) -> AppSettings   // also migrates legacy ids (canonical); labels/hours follow them
    public func effectiveShift(at now: Date) -> Int  // widgetShiftMinutes if not expired, else 0
}
public final class SettingsStore: @unchecked Sendable {
    public static let appGroupID: String             // "group.io.joao.worldclock.shared"
    public static let storageKey: String             // "settings.v1" (JSON-encoded AppSettings)
    public static let shared: SettingsStore           // UserDefaults(suiteName: appGroupID) ?? .standard
    public init(defaults: UserDefaults)
    public func load() -> AppSettings                 // default when missing/corrupt
    public func save(_ settings: AppSettings)
    public func update(_ change: (inout AppSettings) -> Void) -> AppSettings   // load, mutate, sanitize, save, return
}
```
The app calls `WidgetCenter.shared.reloadAllTimelines()` after every save (app side, not core).

## Deep links

```swift
public enum DeepLink: Hashable, Sendable {
    case convert(zone: String?)   // worldclock://convert?zone=Asia/Tokyo  (zone percent-decoded; invalid zone -> nil)
    case planner                  // worldclock://planner
    case map                      // worldclock://map
    case settings                 // worldclock://settings
    public init?(url: URL)
    public var url: URL { get }
}
```

## World map (port of the pure helpers in src/renderer/views/map.js `_internals`) and land outline

```swift
public enum WorldMap {
    public static let sunsetAltitude: Double                              // map.js SUNSET_ALT
    public static func subsolar(at date: Date) -> Coordinate              // lat = declination, lng = subsolar longitude (-180...180)
    public static func altitude(lat: Double, lng: Double, subsolar: Coordinate) -> Double
    public static func isNight(at date: Date, lat: Double, lng: Double) -> Bool
    public static func nightAlpha(altitude: Double) -> Double             // 0...1 shading ramp
    public static func terminatorLat(lng: Double, subsolar: Coordinate) -> Double
    public static func wrapLng(_ lng: Double) -> Double
}
public struct WorldLand: Sendable {
    public static let shared: WorldLand                                   // Bundle.module "world-land.json"
    public init(jsonData: Data) throws
    public let width: Double, height: Double, north: Double, south: Double   // 3600 x 1330, lat 75N..58S; x = (lng+180)*10, y = (75-lat)*10
    public let pathData: String                                           // raw SVG "d"
    public var commands: [PathCommand] { get }                            // parsed once, absolute coordinates in width x height space
    public func point(lat: Double, lng: Double) -> (x: Double, y: Double)
}
public enum PathCommand: Hashable, Sendable { case move(x: Double, y: Double), line(x: Double, y: Double), close }
public enum SVGPathParser { public static func parse(_ d: String) -> [PathCommand] }   // supports M/m L/l H/h V/v Z/z (what world-land uses)
```
Golden: `map`: `[{ epochMs, subsolar: {lat,lng}, samples: [{lat,lng,altitude,isNight}], terminator: [{lng, lat}] }]`, tolerance 0.01 deg.

## Map labels (port of map.js `offsetFor` / `placeLabels`)

```swift
public struct MapLabelRect: Hashable, Sendable { public var x, y, width, height: Double      // points, top-left origin
    public init(x: Double, y: Double, width: Double, height: Double)
    public func intersects(_ other: MapLabelRect) -> Bool }                                   // strict (touching edges do not count)
public struct MapLabelItem: Hashable, Sendable { public var x, y, width, height: Double      // dot center + pill size
    public init(x: Double, y: Double, width: Double, height: Double) }
public enum MapLabelSide: String, CaseIterable, Hashable, Sendable { case r, l, t, b, tr, tl, br, bl }   // map.js SIDES order
public struct MapLabelPlacement: Hashable, Sendable { public var side: MapLabelSide; public var dx, dy: Double   // pill top-left minus dot center
    public init(side: MapLabelSide, dx: Double, dy: Double)
    public func rect(for item: MapLabelItem) -> MapLabelRect }
public enum MapLabels {
    public static let gap: Double                  // 8 (map.js GAP)
    public static let dot: Double                  // 5 (map.js DOT: each dot reserves a 10 x 10 square)
    public static func offset(for side: MapLabelSide, width: Double, height: Double) -> (dx: Double, dy: Double)
    public static func dotRect(x: Double, y: Double) -> MapLabelRect
    /// The four side x side corner squares of `bounds` (native only), for `place(blocked:)` on a rounded map.
    public static func corners(of bounds: MapLabelRect, side: Double = 8) -> [MapLabelRect]
    /// Items in priority order; one result per item, nil when no side fits. `blocked`: extra rectangles no pill may
    /// overlap (native only, default none; the app passes the corners its rounded map clips).
    public static func place(items: [MapLabelItem], bounds: MapLabelRect, blocked: [MapLabelRect] = []) -> [MapLabelPlacement?]
}
```
Greedy, exactly like map.js: every dot is reserved first; each item tries the sides in order with its pill rect padded by 2 pt
horizontally and 1 pt vertically, and takes the first one that stays inside `bounds` inset by 2 pt and hits no dot (other than its own)
and no pill placed before it. map.js keeps a hover position for labels that do not fit; the core returns nil instead (the iPhone has no
hover). Caller order on the map: home zone, conversion source, then the display order (map.js `layoutLabels`). Covered by
`MapLabelsTests`, including exact map.js results for fixed layouts and for 200 seeded random layouts.

## Widget timeline helper

```swift
public enum TimelineDates {
    /// Minute boundaries from the start of the minute containing `from` (inclusive), `minutes` of them,
    /// merged with every sunrise/sunset of `zones` inside that window (deduplicated, sorted).
    public static func entries(from: Date, minutes: Int, zones: [String], catalog: ZoneCatalog = .shared) -> [Date]
}
```

---------------------------------------------------------------------------------------------------------
## shared/golden.json schema (generated by scripts/export-shared.mjs by running the JS; tests must match)

Top level object:
- `meta`: `{ generatedBy, node, icu, tz }` (process.versions): informational.
- `offsets`: `[{ zone, epochMs, offsetMinutes, formatted }]`: formatted = formatOffset(offsetMinutes).
- `zonedToEpoch`: `[{ zone, y, m, d, h, mi, epochMs, note }]`: note e.g. "gap", "overlap", "normal".
- `dayDiff`: `[{ zone, refZone, epochMs, diff }]`
- `relLabel`: `[{ zone, localZone, epochMs, label }]`: label null when zone == localZone.
- `parseTime`: `[{ input, result }]`: result `[h, m]` or null.
- `inputText`: `[{ h, m, hour12, text }]`
- `phaseOf`: `[{ hour, phase }]`
- `sunTimes`: `[{ name, lat, lng, epochMs, sunriseMs, sunsetMs, polar }]`: ms or null; polar null|"day"|"night". Tolerance 60 000 ms.
- `sunAltitude`: `[{ lat, lng, epochMs, altitude }]`: tolerance 0.01 deg.
- `sunPhase`: `[{ lat, lng, epochMs, localHour, phase }]`
- `skyPhase`: `[{ lat, lng, epochMs, phase }]`: motion/sky.js thresholds.
- `isWorking`: `[{ zone, hours: {start,end,days}, epochMs, working }]`
- `planner`: `[{ name, source, y, m, d, zones, hours: {zone: {start,end,days}}, columnsMs: [24], cells: {zone: [24 states]}, runs: [[a,b]], totalHours, best: [a,b] | null }]`
- `nextOffsetChange`: `[{ zone, epochMs, result: { atMs, delta, old } | null }]`
- `dstNote`: `[{ zone, epochMs, daysUntil | null, delta | null, text | null }]`: delta = short text ("−1h"), text = English card note.
- `dstTemplates`: `{ "dst.today", "dst.tomorrow", "dst.in" -> en template }`: tests fill `textKey`/`textVars` and compare with `text`.
- `parseOffsetQuery`: `[{ input, minutes }]`
- `search`: `[{ query, lang, nowMs, excluding: [], mustInclude: [zones], mustExclude: [zones], first: zone | null, firstReliable, kind: "text"|"abbreviation"|"offset", count }]`
  (the full IANA list differs between ICU builds, so search tests assert inclusion/exclusion/first, not exact lists; `first` is only
  asserted when `firstReliable`, i.e. a curated or abbreviation hit).
- `cityName`: `[{ zone, lang, city }]`: app.js cityOf per UI language.
- `country`: `[{ zone, lang, country }]`: app.js regionOf per UI language.
- `canonical`: `[{ zone, canonical }]`: app.js LEGACY / canonical.
- `languageResolve`: `[{ preferred: [language tags], lang }]`: src/main.js systemLanguage + i18n.js setLang('auto', systemLang).
- `template`: `[{ template, vars, result }]`

All dates are pinned in the generator (no `Date.now()`); expected values come from executing the real JS code
(src/renderer/time.js, sun.js, zones.js, i18n.js, views/map.js, motion/sky.js loaded in vm sandboxes; app.js closure helpers and
src/main.js systemLanguage extracted from the source text and executed; only the buildPlanner column/run loop is a checked verbatim copy).

---------------------------------------------------------------------------------------------------------
## Later additions (additive only; nothing above was renamed or removed)

Public memberwise initializers (for previews, tests and editing UI):
- `WorkingHours(start: String, end: String, days: [Int])` (days are sorted; validity is NOT enforced, check `isValid`).
- `AppSettings(zones:labels:hours:hour12:showSeconds:theme:language:widgetShiftMinutes:widgetShiftExpires:)`, every argument defaulted to the `.default` value.
- `RGBA(r:g:b:a: = 1)`, `ClockText(hm:seconds:ampm:)`, `WallClock(year:month:day:hour:minute:second:weekday:)`,
  `SunTimes(sunrise:sunset:polar:)`, `SunEvent(kind:date:)`, `ZoneMeta(city:country:alias:lat:lng:)`,
  `SearchResult(zones:kind:)`, `PlannerRow(zone:cells:localTimes:)`, `PlannerRun(start:end:)`,
  `OffsetChange(at:deltaMinutes:oldOffsetMinutes:wallClockBefore:)`, `ClockChangeNote(change:daysUntil:dayOfChange:)`.
- `SettingsStore.update(_:)` is `@discardableResult`.
- `WorldMap.pickCenter(longitudes: [Double]) -> Double`: exact port of map.js `pickCenter` (view centre opposite the widest
  empty gap between cities; non-finite values ignored; empty -> 10; one value -> that value wrapped). Covered by
  `PickCenterTests` with expected values from running map.js `_internals.pickCenter` in node.
- Round 2 (first run and planner): `TimeMath.uniqueClocks(_:at:)`, `ZoneCatalog.firstRunZones(home:at:)`, `PlannerPartial` and
  `Planner.partial(_:prefer:)`, listed in their sections above. `uniqueClocks` must check `TimeMath.timeZone(z) == nil` itself: the Swift
  `offsetMinutes` returns 0 for an unknown zone where Intl throws, so without the check an unknown id would join the UTC+0 group.
  The app's first run saves `firstRunZones(home: deviceZone, at: .now)`; `defaultZones` (and golden.json parity) is unchanged.
  `UniqueClocksTests` ports the test/unit/time.test.js cases (Sep 23 and Dec 1 2026); `PlannerPartialTests` covers `partial`.
- `MapLabels.place(items:bounds:blocked:)` and `MapLabels.corners(of:side:)`: `blocked` (default empty) adds rectangles no pill
  may overlap, on top of the dots. map.js has no such list, so the parity tests pass none; the app passes `corners(of:)` of
  its map, whose 20 pt rounded corners would clip a pill placed there. Covered by `MapLabelsTests`.

Semantics worth knowing:
- Israel is keyed on `Asia/Jerusalem` (ZONE_META city "Tel Aviv"); `Asia/Tel_Aviv` is a legacy id (search never offers it, settings migrate it).
- `TimeMath.timeZone(_:)` falls back to an alias table when `TimeZone(identifier:)` returns nil:
  `"Asia/Tel_Aviv" -> "Asia/Jerusalem"` (so `ZoneCatalog.isValid`, `allZoneIDs` and all lookups accept it everywhere).
  Windows Foundation (Swift 6.4) accepts "Asia/Tel_Aviv" natively; the alias is a safety net for other ICU builds.
- `TimeMath.wallClock` is computed from the zone's full `secondsFromGMT(for:)` at the instant (proleptic Gregorian),
  so it is always consistent with `offsetMinutes`/`zonedToEpoch`.
- `ZoneCatalog.isValid` also requires a non-empty id shorter than 64 characters (src/main.js rule).
- `ZoneCatalog.country(of:)` returns the meta country, else the region (first path component, "_" -> " ", app.js regionOf) for "Region/City" ids, else nil.
- `Search.search` searches app.js ALL_ZONES semantics: IANA region ids (Africa/, America/, ... Pacific/) plus every curated/coords id,
  no `Etc/` ids, legacy ids (zones.json `legacy`) always replaced by their canonical name ("Asia/Tel_Aviv" is never a result).
  Ties sort with a case- and diacritic-insensitive compare (approximates JS localeCompare).
- `ClockChangeNote.daysUntil` is the raw JS value (calendar days from `date` to the local day of `at - 1 min`); UI: <= 0 today, 1 tomorrow.
- `Sky.phase(zone:at:)` without coordinates uses sky.js `phaseFromKey(TimeMath.phaseOf(hour:), night: hour < 6 || hour >= 20)` (app.js fallback).
- `Sun.events` dedupes identical events and returns them sorted; `TimelineDates.entries` floors sun events to whole seconds before
  merging, and the window is (start, start + minutes * 60 s].
- `AppSettings` label rule mirrors src/main.js: trimmed, labels longer than 40 characters are DROPPED (not truncated).
- `SettingsStore` stores JSON `Data` (JSONEncoder defaults, so `widgetShiftExpires` is seconds since 2001) and also reads a JSON `String` value.
