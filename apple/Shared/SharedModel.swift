import Foundation
import WorldClockCore

/// Model helpers shared by the app and the widget extension (Foundation + WorldClockCore only),
/// so both targets validate the device zone, build the city list and draw working hours the same way.

// MARK: - Device zone

enum DeviceZone {
    /// The device time zone ("home"). Drops the cached system zone first (the app and the widget process
    /// can outlive a travel / zone change); see `validated` for legacy and unknown ids.
    static func current(catalog: ZoneCatalog = .shared) -> String {
        NSTimeZone.resetSystemTimeZone()
        return validated(TimeZone.current.identifier, catalog: catalog)
    }

    /// Legacy ids map to their canonical names first ("Europe/Kiev" to "Europe/Kyiv", "Asia/Calcutta" to
    /// "Asia/Kolkata"), as app.js readLocalZone does, so a device on a legacy id does not get a second Home card
    /// next to the saved canonical city. If the system tz data does not know the canonical name, the id is kept
    /// as it is; ids the catalog does not accept at all fall back to "UTC".
    static func validated(_ id: String, catalog: ZoneCatalog = .shared) -> String {
        let canonical = catalog.canonical(id)
        if catalog.isValid(canonical) { return canonical }
        return catalog.isValid(id) ? id : "UTC"
    }
}

// MARK: - City list

enum DisplayZones {
    /// The list the app shows: the device zone first when it is not one of the saved cities, then the saved
    /// cities in their order. Unconfigured widgets use the same list.
    static func list(saved: [String], home: String) -> [String] {
        saved.contains(home) ? saved : [home] + saved
    }
}

// MARK: - First run

/// Settings before the app has saved anything. The app writes them on its first launch; the widget extension
/// shows them (read-only) when a widget is added before the app was ever opened, so both agree.
enum FirstRun {
    /// The App Group defaults `SettingsStore.shared` reads and writes.
    static var defaults: UserDefaults { UserDefaults(suiteName: SettingsStore.appGroupID) ?? .standard }

    /// Nothing saved yet in the App Group.
    static var isFirstRun: Bool { isFirstRun(in: defaults) }

    static func isFirstRun(in defaults: UserDefaults) -> Bool {
        defaults.object(forKey: SettingsStore.storageKey) == nil
    }

    /// The device locale's default clock is 12 h (`AppSettings.default` has hour12 = false).
    static var prefers12h: Bool {
        (DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: .current) ?? "").contains("a")
    }

    /// `AppSettings.default` with the locale's 12/24 h and the default cities minus any that shows the same time
    /// all year as the device zone or an earlier default (Windows first run), so a Lisbon or London user does not
    /// get two cards with the same clock.
    static func settings(home: String, now: Date = .now) -> AppSettings {
        var settings = AppSettings.default
        settings.hour12 = prefers12h
        settings.zones = ZoneCatalog.firstRunZones(home: home, at: now)
        return settings
    }
}

// MARK: - Working hours on a 24 h line

/// One working-hours segment of a local day, 0...1 (0 = local midnight).
struct WorkBand: Hashable, Sendable {
    var start: Double
    var end: Double
    /// The shift this segment belongs to falls on a non-working day (drawn faint).
    var off: Bool
}

enum WorkBands {
    /// Working-hours segments of the local day whose weekday is `weekday` (0 = Sunday).
    /// Consistent with core `Planner.isWorking`: the early-morning part of an overnight shift (end < start)
    /// belongs to the shift that started the day before, so it is "off" when yesterday is not a working day.
    static func bands(_ hours: WorkingHours, weekday: Int) -> [WorkBand] {
        let start = Double(hours.startMinutes) / 1440
        let end = Double(hours.endMinutes) / 1440
        let today = hours.days.contains(weekday)
        if end > start { return [WorkBand(start: start, end: end, off: !today)] }
        if end < start {
            let yesterday = hours.days.contains((weekday + 6) % 7)
            var bands: [WorkBand] = []
            if end > 0 { bands.append(WorkBand(start: 0, end: end, off: !yesterday)) }
            bands.append(WorkBand(start: start, end: 1, off: !today))
            return bands
        }
        return []
    }
}

// MARK: - Clock-change notes

/// `ClockChanges.note` memoized per zone and minute: a card, its VoiceOver summary and repeated body
/// evaluations within the same minute share one computation.
enum ClockChangeCache {
    static func note(_ zone: String, at date: Date) -> ClockChangeNote? {
        ClockChangeStorage.shared.note(zone, at: date)
    }
}

private final class ClockChangeStorage: @unchecked Sendable {
    static let shared = ClockChangeStorage()

    /// `Optional` payload so "no change within 7 days" is cached too.
    private struct Entry { let note: ClockChangeNote? }

    private let lock = NSLock()
    private var entries: [String: Entry] = [:]

    func note(_ zone: String, at date: Date) -> ClockChangeNote? {
        let minute = Int((date.timeIntervalSince1970 / 60).rounded(.down))
        let key = "\(zone)|\(minute)"
        if let hit = lock.withLock({ entries[key] }) { return hit.note }
        let note = ClockChanges.note(zone, at: date)
        lock.withLock {
            if entries.count > 512 { entries.removeAll(keepingCapacity: true) }
            entries[key] = Entry(note: note)
        }
        return note
    }
}

// MARK: - Calendar

extension Calendar {
    /// Gregorian calendar in UTC (civil dates, time-of-day pickers, fixed-date formatting).
    static let gregorianUTC: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return calendar
    }()
}

// MARK: - Accessible accent fill

extension Palette {
    /// Deeper accent for FILLED shapes that carry white text (Home pill, selected chips, prominent buttons, widget
    /// pills and badges). The regular `accent` is too light under white text (4.34:1 light, 2.47:1 dark).
    /// Light: oklch(0.50 0.19 255), white text 6.04:1. Dark: oklch(0.52 0.19 255), white text 5.56:1 and 3.04:1
    /// against the navy canvas (WCAG 1.4.11 for the shape itself). App-side addition, not part of the core API.
    static func accentFill(dark: Bool) -> RGBA {
        dark ? RGBA(r: 0.0000, g: 0.3945, b: 0.8236, a: 1)
             : RGBA(r: 0.0000, g: 0.3697, b: 0.7968, a: 1)
    }

    /// Accent for TEXT drawn straight on a card or the canvas (converted digits, compact converting time, map list,
    /// planner summary and home name, widget digits while shifted). The regular `accent` is below 4.5:1 there
    /// (light accent on the pale day gradients, dark accent on the dark-theme day card). Mirrors style.css
    /// --accent-ink (light) and --accent-on-night (dark theme or night surfaces).
    /// Light day surfaces: the `accentFill` light value, oklch(0.50 0.19 255). Dark theme or night surfaces:
    /// oklch(0.80 0.11 245) (the light-theme --accent-on-night). Every pair is at least 4.5:1 against the canvas,
    /// the day and night cards and every `Sky.gradient` stop of its family (checked with a WCAG luminance script;
    /// see apple/README.md). Keep `accent` for strokes, fills, dots, the scrubber indicator and the tint.
    static func accentText(dark: Bool, night: Bool) -> RGBA {
        dark || night ? RGBA(r: 0.4971, g: 0.7732, b: 1.0000, a: 1)
                      : RGBA(r: 0.0000, g: 0.3697, b: 0.7968, a: 1)
    }
}
