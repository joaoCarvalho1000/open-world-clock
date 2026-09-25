import Foundation

/// Port of src/renderer/time.js plus the time helpers of app.js (relLabel, clock).
public enum TimeMath {
    private struct ZoneBox { let tz: TimeZone? }
    private static let zoneCache = LockedCache<String, ZoneBox>(limit: 100_000)

    /// Ids some Foundation/ICU builds reject, mapped to an equivalent canonical zone.
    static let zoneAliases: [String: String] = ["Asia/Tel_Aviv": "Asia/Jerusalem"]

    /// Cached `TimeZone(identifier:)` (falls back to `zoneAliases`, e.g. "Asia/Tel_Aviv" -> "Asia/Jerusalem").
    public static func timeZone(_ id: String) -> TimeZone? {
        zoneCache.value(id) {
            if id.isEmpty { return ZoneBox(tz: nil) }
            if let tz = TimeZone(identifier: id) { return ZoneBox(tz: tz) }
            return ZoneBox(tz: zoneAliases[id].flatMap { TimeZone(identifier: $0) })
        }.tz
    }

    /// Full UTC offset in seconds at `ms` (floored to whole seconds, like Intl). 0 for unknown zones.
    static func offsetSeconds(_ zone: String, ms: Double) -> Int {
        guard let tz = timeZone(zone) else { return 0 }
        let secs = (ms / 1000).rounded(.down)
        return tz.secondsFromGMT(for: Date(timeIntervalSince1970: secs))
    }

    static func offsetMinutes(_ zone: String, ms: Double) -> Int {
        Int(jsRound(Double(offsetSeconds(zone, ms: ms)) / 60))
    }

    /// UTC offset in minutes (seconds truncated like JS time.js offsetMinutes).
    public static func offsetMinutes(_ zone: String, at date: Date) -> Int {
        offsetMinutes(zone, ms: epochMs(date))
    }

    /// "+5:30", "-7", "+0"
    public static func formatOffset(_ minutes: Int) -> String {
        let sign = minutes < 0 ? "-" : "+"
        let a = abs(minutes), h = a / 60, m = a % 60
        return "\(sign)\(h)" + (m != 0 ? ":" + pad(m, 2) : "")
    }

    /// "UTC+5:30" (card .utc text).
    public static func utcLabel(_ zone: String, at date: Date) -> String {
        "UTC" + formatOffset(offsetMinutes(zone, at: date))
    }

    static func wallClock(_ zone: String, ms: Double) -> WallClock {
        let secs = Int((ms / 1000).rounded(.down))
        let local = secs + offsetSeconds(zone, ms: ms)
        var days = local / 86400
        var rem = local % 86400
        if rem < 0 { rem += 86400; days -= 1 }
        let c = civilFromDays(days)
        let weekday = (((days + 4) % 7) + 7) % 7 // 1970-01-01 was a Thursday
        return WallClock(year: c.year, month: c.month, day: c.day,
                         hour: rem / 3600, minute: (rem % 3600) / 60, second: rem % 60, weekday: weekday)
    }

    /// Wall-clock fields of `date` in `zone` (proleptic Gregorian, from the zone's offset at that instant).
    public static func wallClock(_ zone: String, at date: Date) -> WallClock {
        wallClock(zone, ms: epochMs(date))
    }

    /// "YYYY-MM-DD"
    public static func ymd(_ zone: String, at date: Date) -> String { wallClock(zone, at: date).ymd }

    static func zonedToEpochMs(_ zone: String, _ y: Int, _ m: Int, _ d: Int, _ h: Int, _ mi: Int) -> Double {
        let wall = utcMs(y, m, d, h, mi)
        let day = 86_400_000.0
        var offsets: [Int] = []
        for o in [offsetMinutes(zone, ms: wall - day), offsetMinutes(zone, ms: wall + day)] where !offsets.contains(o) {
            offsets.append(o)
        }
        let valid = offsets.map { wall - Double($0) * 60_000 }
            .filter { e in Double(offsetMinutes(zone, ms: e)) * 60_000 == wall - e }
        if let first = valid.min() { return first }
        return wall - Double(offsets[0]) * 60_000 // gap: use the pre-transition offset
    }

    /// Wall time in `zone` -> instant. Overlap (clocks back): FIRST occurrence. Gap (clocks forward):
    /// shifted forward by the gap (uses the pre-transition offset), exactly like time.js zonedToEpoch.
    public static func zonedToEpoch(_ zone: String, year: Int, month: Int, day: Int, hour: Int, minute: Int) -> Date {
        dateFromMs(zonedToEpochMs(zone, year, month, day, hour, minute))
    }

    /// Calendar-day difference between the local dates of `zone` and `refZone` at `date`.
    public static func dayDiff(_ zone: String, at date: Date, relativeTo refZone: String) -> Int {
        let a = wallClock(zone, at: date), b = wallClock(refZone, at: date)
        return daysFromCivil(a.year, a.month, a.day) - daysFromCivil(b.year, b.month, b.day)
    }

    /// nil when zone == localZone (UI shows localized "rel.local"); otherwise "±0", "+5h", "-3h30m" (app.js relLabel).
    public static func relativeOffsetLabel(_ zone: String, at date: Date, localZone: String) -> String? {
        if zone == localZone { return nil }
        let d = offsetMinutes(zone, at: date) - offsetMinutes(localZone, at: date)
        if d == 0 { return "±0" }
        let a = abs(d), h = a / 60, m = a % 60
        return (d > 0 ? "+" : "-") + "\(h)h" + (m != 0 ? pad(m, 2) + "m" : "")
    }

    /// time.js phaseOf (clock-hour fallback when a zone has no coordinates).
    public static func phaseOf(hour: Int) -> Phase {
        if hour < 5 { return .night }
        if hour < 7 { return .dawn }
        if hour < 11 { return .morning }
        if hour < 14 { return .midday }
        if hour < 17 { return .afternoon }
        if hour < 19 { return .golden }
        if hour < 21 { return .dusk }
        return .night
    }

    /// Local hour >= 22 or < 7.
    public static func isLikelyAsleep(_ zone: String, at date: Date) -> Bool {
        let h = wallClock(zone, at: date).hour
        return h >= 22 || h < 7
    }

    /// time.js uniqueClocks: zones that show the same time all year form one group (same UTC offset at `ref` and on
    /// Jan 15 and Jul 15 00:00 UTC of ref's UTC year, so the same DST rule too). Keeps the first zone of each group,
    /// in order ("Europe/London" after "Europe/Lisbon" goes). An unknown zone is its own group: offsetMinutes returns
    /// 0 for it instead of throwing like Intl, so it would otherwise join the UTC+0 group.
    public static func uniqueClocks(_ zones: [String], at ref: Date) -> [String] {
        let refMs = epochMs(ref)
        let year = civilFromDays(Int((refMs / 86_400_000).rounded(.down))).year
        let instants = [refMs, utcMs(year, 1, 15), utcMs(year, 7, 15)]
        var seen = Set<String>()
        var out: [String] = []
        for zone in zones {
            let key = timeZone(zone) == nil
                ? "zone:" + zone
                : instants.map { String(offsetMinutes(zone, ms: $0)) }.joined(separator: "|")
            if seen.insert(key).inserted { out.append(zone) }
        }
        return out
    }
}

/// Deterministic digits for cards and widgets.
public struct ClockText: Hashable, Sendable {
    /// "09:05" (24h, zero-padded hour) or "9:05" (12h).
    public var hm: String
    /// "07"
    public var seconds: String
    /// "" in 24h; locale AM/PM symbol in 12h (en: "AM"/"PM").
    public var ampm: String

    public init(hm: String, seconds: String, ampm: String) {
        self.hm = hm
        self.seconds = seconds
        self.ampm = ampm
    }

    public static func make(_ zone: String, at date: Date, hour12: Bool, locale: Locale = .current) -> ClockText {
        let w = TimeMath.wallClock(zone, at: date)
        if hour12 {
            let symbols = DayPeriodSymbols.symbols(for: locale)
            let h = w.hour % 12 == 0 ? 12 : w.hour % 12
            return ClockText(hm: "\(h):\(pad(w.minute, 2))", seconds: pad(w.second, 2),
                             ampm: w.hour < 12 ? symbols.am : symbols.pm)
        }
        return ClockText(hm: "\(pad(w.hour, 2)):\(pad(w.minute, 2))", seconds: pad(w.second, 2), ampm: "")
    }
}

/// AM/PM symbols per locale, cached (DateFormatter creation is expensive).
enum DayPeriodSymbols {
    private struct Pair { let am: String; let pm: String }
    private static let cache = LockedCache<String, Pair>(limit: 64)

    static func symbols(for locale: Locale) -> (am: String, pm: String) {
        let p = cache.value(locale.identifier) {
            let f = DateFormatter()
            f.locale = locale
            let am: String? = f.amSymbol
            let pm: String? = f.pmSymbol
            return Pair(am: (am ?? "").isEmpty ? "AM" : am!, pm: (pm ?? "").isEmpty ? "PM" : pm!)
        }
        return (p.am, p.pm)
    }
}

/// Splits a duration in minutes (absolute value) into hours and minutes; the UI localizes with "unit.h" / "unit.min".
public enum DurationParts {
    public static func split(_ minutes: Int) -> (hours: Int, minutes: Int) {
        let a = abs(minutes)
        return (a / 60, a % 60)
    }
}
