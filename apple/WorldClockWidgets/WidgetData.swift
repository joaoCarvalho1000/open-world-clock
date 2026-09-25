import Foundation
import WidgetKit
import WorldClockCore

// MARK: - Entry model (everything precomputed so views stay dumb and cheap)

/// A normalized [start, end) span of the local day, 0...1 (0 = local midnight).
struct DaySpan: Hashable, Sendable {
    var start: Double
    var end: Double
}

/// The 24 h day line: working hours bands, night shading and the "now" marker, in local wall time.
struct DayLine: Hashable, Sendable {
    var now: Double
    /// Working-hours segments; `off` segments belong to a shift on a non-working day (overnight-aware, shared `WorkBands`).
    var work: [WorkBand]
    var night: [DaySpan]

    static let empty = DayLine(now: 0, work: [], night: [])
}

struct CitySnapshot: Hashable, Sendable, Identifiable {
    var zone: String
    var id: String { zone }
    var name: String
    var abbreviation: String           // "TOK" for circular Lock Screen widgets
    var clock: ClockText
    var phaseKey: String               // "phase.night"
    var phaseText: String              // localized "Night"
    var sky: SkyPhase                  // background gradient (motion/sky.js phase)
    var isNightSurface: Bool           // navy card with light text = !Sun.isDay (app.js is-night)
    var isHome: Bool                   // device zone
    var relative: String               // "+5h", "−3h30m" or localized "Local"
    var spokenRelative: String         // VoiceOver: "5 hours ahead", "Local"
    var dayMarker: String?             // "+1 day" when the city's date differs from the device's
    var asleep: Bool                   // only surfaced while shifted (like the converter in the desktop app)
    var dayLine: DayLine
    var url: URL                       // worldclock://convert?zone=...

    var timeText: String { WCFormat.timeText(clock) }
}

/// Widget-only strings, resolved once per timeline in the app's chosen language.
struct WidgetStrings: Hashable, Sendable {
    var title: String          // "Open World Clock"
    var now: String            // "Now"
    var shiftBadge: String     // current shift, "+1 h" / "+2 h" (empty when not shifted)
    var plusOneHour: String    // "+1 h" button label
    var shiftA11y: String      // "Show one hour later"
    var nowA11y: String        // "Back to the current time"
    var empty: String          // "No cities yet"
    var home: String           // "Home"
    var asleep: String         // "likely asleep"
    var shiftPrefix: String    // VoiceOver prefix while shifted: "In 1 h:" (empty when not shifted)
    var speechLanguage: String // BCP 47 tag of the app language ("pt-BR"), for VoiceOver labels
}

struct ClockEntry: TimelineEntry, Sendable {
    let date: Date
    let displayDate: Date      // date + shift
    let cities: [CitySnapshot]
    let shiftMinutes: Int
    let strings: WidgetStrings

    var isShifted: Bool { shiftMinutes != 0 }
}

// MARK: - Building entries

enum WidgetData {
    /// Minutes of timeline per reload. One entry per minute plus sunrise/sunset instants.
    static let timelineMinutes = 90
    static let maxCities = 6

    /// The list the app shows: the device zone first unless it is saved, then the saved cities (shared `DisplayZones`).
    static func userZones(_ settings: AppSettings, home: String) -> [String] {
        DisplayZones.list(saved: settings.zones, home: home)
    }

    /// Configured zones (valid only), or the app's list when the configuration is empty.
    static func resolveZones(configured: [String], settings: AppSettings, home: String, limit: Int) -> [String] {
        let catalog = ZoneCatalog.shared
        var seen = Set<String>()
        let valid = configured.filter { catalog.isValid($0) && seen.insert($0).inserted }
        let zones = valid.isEmpty ? userZones(settings, home: home) : valid
        return Array(zones.prefix(limit))
    }

    /// Saved settings, or (read-only, nothing is written) the first-run settings the app will save on its first
    /// launch, so a widget added before the app was ever opened shows the locale's 12/24 h and different clocks.
    static func currentSettings(home: String, now: Date = Date()) -> AppSettings {
        FirstRun.isFirstRun ? FirstRun.settings(home: home, now: now) : SettingsStore.shared.load()
    }

    static func timeline(configured: [String], limit: Int, now: Date = Date()) -> Timeline<ClockEntry> {
        let home = DeviceZone.current()
        let settings = currentSettings(home: home, now: now)
        let zones = resolveZones(configured: configured, settings: settings, home: home, limit: limit)
        var dates = TimelineDates.entries(from: now, minutes: timelineMinutes, zones: zones)
        if let expires = settings.widgetShiftExpires, expires > now,
           let last = dates.last, expires < last, !dates.contains(expires) {
            dates.append(expires)
            dates.sort()
        }
        if dates.isEmpty { dates = [now] }
        var builder = EntryBuilder(settings: settings, zones: zones, home: home)
        var entries: [ClockEntry] = []
        entries.reserveCapacity(dates.count)
        for date in dates { entries.append(builder.entry(at: date)) }
        return Timeline(entries: entries, policy: .atEnd)
    }

    static func single(configured: [String], limit: Int, now: Date = Date()) -> ClockEntry {
        let home = DeviceZone.current()
        let settings = currentSettings(home: home, now: now)
        let zones = resolveZones(configured: configured, settings: settings, home: home, limit: limit)
        var builder = EntryBuilder(settings: settings, zones: zones, home: home)
        return builder.entry(at: now)
    }

    /// Static sample for placeholders, the widget gallery and previews (no App Group access). Without `zones`, the
    /// first-run cities for the device zone (never two cities with the same clock); previews pass their own.
    static func sample(zones: [String]? = nil, shift: Int = 0, at date: Date = Date(), limit: Int = maxCities) -> ClockEntry {
        let home = DeviceZone.current()
        let zones = zones ?? ZoneCatalog.firstRunZones(home: home, at: date)
        var settings = AppSettings.default
        settings.zones = zones
        if shift != 0 {
            settings.widgetShiftMinutes = shift
            settings.widgetShiftExpires = date.addingTimeInterval(3600)
        }
        var builder = EntryBuilder(settings: settings, zones: Array(zones.prefix(limit)), home: home)
        return builder.entry(at: date)
    }
}

/// Builds entries for one timeline; caches per-day work/night spans (they only change at local midnight).
struct EntryBuilder {
    let settings: AppSettings
    let zones: [String]
    let localZone: String
    let language: AppLanguage          // resolved (never .auto): localized city names
    let locale: Locale
    let baseStrings: WidgetStrings
    private var dayCache: [String: (work: [WorkBand], night: [DaySpan])] = [:]

    /// `home` = the device zone (`DeviceZone.current()`, same validation as the app).
    init(settings: AppSettings, zones: [String], home: String) {
        self.settings = settings
        self.zones = zones
        self.localZone = home
        // L10n (apple/Shared) resolves the app's language from this static; the widget process sets it itself.
        L10n.language = settings.language
        let language = AppLanguage.resolve(settings.language)
        self.language = language
        // Same date/time locale as the app (`L10n.locale`: the device region when the device language matches).
        self.locale = L10n.locale
        let table = WidgetText(language: language)
        self.baseStrings = WidgetStrings(
            title: L10n.tr("app.title"),
            now: table.tr("Now"),
            shiftBadge: "",
            plusOneHour: WCFormat.shiftText(60),
            shiftA11y: table.tr("Show one hour later"),
            nowA11y: table.tr("Back to the current time"),
            empty: L10n.tr("empty.title"),
            home: L10n.tr("card.home"),
            asleep: L10n.tr("card.asleep"),
            shiftPrefix: "",
            speechLanguage: language.localeIdentifier)
    }

    private func strings(_ shift: Int) -> WidgetStrings {
        var s = baseStrings
        s.shiftBadge = shift == 0 ? "" : WCFormat.shiftText(shift)
        s.shiftPrefix = shift == 0 ? "" : L10n.tr("widget.inShift", ["d": WCFormat.spokenDuration(shift)])
        return s
    }

    mutating func entry(at date: Date) -> ClockEntry {
        let shift = settings.effectiveShift(at: date)
        let display = date.addingTimeInterval(TimeInterval(shift * 60))
        var cities: [CitySnapshot] = []
        cities.reserveCapacity(zones.count)
        for zone in zones { cities.append(city(zone, at: display, shifted: shift != 0)) }
        return ClockEntry(date: date, displayDate: display, cities: cities, shiftMinutes: shift, strings: strings(shift))
    }

    private mutating func city(_ zone: String, at date: Date, shifted: Bool) -> CitySnapshot {
        let catalog = ZoneCatalog.shared
        let custom = settings.labels[zone] ?? ""
        let name = custom.isEmpty ? catalog.cityName(of: zone, language: language) : custom
        let wall = TimeMath.wallClock(zone, at: date)
        let phase = Sun.phase(zone: zone, at: date)
        let sky = Sky.phase(zone: zone, at: date)
        let relative = TimeMath.relativeOffsetLabel(zone, at: date, localZone: localZone) ?? L10n.tr("rel.local")
        let marker = WCFormat.dayMarker(TimeMath.dayDiff(zone, at: date, relativeTo: localZone))
        return CitySnapshot(
            zone: zone,
            name: name,
            abbreviation: Self.abbreviation(of: name),
            clock: ClockText.make(zone, at: date, hour12: settings.hour12, locale: locale),
            phaseKey: phase.localizationKey,
            phaseText: L10n.tr(phase.localizationKey),
            sky: sky,
            isNightSurface: !Sun.isDay(zone: zone, at: date),
            isHome: zone == localZone,
            relative: relative,
            spokenRelative: WCFormat.spokenRelative(zone, at: date, localZone: localZone),
            dayMarker: marker.isEmpty ? nil : marker,
            asleep: shifted && TimeMath.isLikelyAsleep(zone, at: date),
            dayLine: dayLine(zone, wall: wall),
            url: DeepLink.convert(zone: zone).url)
    }

    /// Short badge for circular Lock Screen widgets: initials of capitalized words for multi-word names
    /// ("New York" -> "NY", "Rio de Janeiro" -> "RJ"), else the first three letters ("Tokyo" -> "TOK").
    static func abbreviation(of name: String) -> String {
        let words = name.split(whereSeparator: { $0 == " " || $0 == "-" })
        let initials = words.compactMap(\.first).filter(\.isUppercase)
        if words.count >= 2, initials.count >= 2 {
            return String(initials.prefix(3)).uppercased()
        }
        return String(name.prefix(3)).uppercased()
    }

    // MARK: Day line

    private mutating func dayLine(_ zone: String, wall: WallClock) -> DayLine {
        let now = Double(wall.hour * 60 + wall.minute) / 1440
        let hours = Planner.hours(for: zone, in: settings.hours)
        let key = "\(zone)|\(wall.ymd)|\(hours.start)|\(hours.end)|\(hours.days)"
        if let cached = dayCache[key] {
            return DayLine(now: now, work: cached.work, night: cached.night)
        }
        // Overnight shifts: the early-morning part belongs to the previous day's shift (core Planner.isWorking).
        let work = WorkBands.bands(hours, weekday: wall.weekday)
        let night = Self.nightSpans(zone, wall: wall)
        dayCache[key] = (work, night)
        return DayLine(now: now, work: work, night: night)
    }

    /// Night shading sampled every 15 minutes of the local day (handles polar day/night and DST days).
    static func nightSpans(_ zone: String, wall: WallClock) -> [DaySpan] {
        let slots = 96
        var spans: [DaySpan] = []
        var runStart: Int?
        for i in 0..<slots {
            let minute = i * 15 + 7
            let instant = TimeMath.zonedToEpoch(zone, year: wall.year, month: wall.month, day: wall.day,
                                                hour: minute / 60, minute: minute % 60)
            let night = !Sun.isDay(zone: zone, at: instant)
            if night, runStart == nil { runStart = i }
            if !night, let start = runStart {
                spans.append(DaySpan(start: Double(start) / Double(slots), end: Double(i) / Double(slots)))
                runStart = nil
            }
        }
        if let start = runStart { spans.append(DaySpan(start: Double(start) / Double(slots), end: 1)) }
        return spans
    }
}

// MARK: - Widget-only strings (apple/WorldClockWidgets/Widgets.xcstrings)

/// Looks up the "Widgets" table in the app's chosen language (falls back to the system language, then the key).
struct WidgetText {
    private let bundle: Bundle

    init(language: AppLanguage) {
        if let lproj = language.lprojName,
           let path = Bundle.main.path(forResource: lproj, ofType: "lproj"),
           let bundle = Bundle(path: path) {
            self.bundle = bundle
        } else {
            self.bundle = .main
        }
    }

    func tr(_ key: String) -> String {
        bundle.localizedString(forKey: key, value: key, table: "Widgets")
    }
}
