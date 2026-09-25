import Foundation

public struct OffsetChange: Hashable, Sendable {
    /// First instant with the new offset (minute precision).
    public var at: Date
    /// +60 forward, -60 back, can be ±30.
    public var deltaMinutes: Int
    public var oldOffsetMinutes: Int
    /// Wall time at the change in the OLD offset ("at 02:00").
    public var wallClockBefore: HourMinute
    public init(at: Date, deltaMinutes: Int, oldOffsetMinutes: Int, wallClockBefore: HourMinute) {
        self.at = at
        self.deltaMinutes = deltaMinutes
        self.oldOffsetMinutes = oldOffsetMinutes
        self.wallClockBefore = wallClockBefore
    }
}

public struct ClockChangeNote: Hashable, Sendable {
    public var change: OffsetChange
    /// 0 today, 1 tomorrow, n days (calendar days in the zone).
    public var daysUntil: Int
    /// An instant on the local day of the change (for date formatting).
    public var dayOfChange: Date
    public init(change: OffsetChange, daysUntil: Int, dayOfChange: Date) {
        self.change = change
        self.daysUntil = daysUntil
        self.dayOfChange = dayOfChange
    }

    /// The card note's string key (app.js dstNote): "dst.today" (daysUntil <= 0), "dst.tomorrow" (1), else "dst.in".
    public var textKey: String { daysUntil <= 0 ? "dst.today" : daysUntil == 1 ? "dst.tomorrow" : "dst.in" }
    /// Placeholders for `textKey`: {delta} = `ClockChanges.deltaText` ("+1h", "−30m"), plus {n} for "dst.in".
    public var textVars: [String: String] {
        var v = ["delta": ClockChanges.deltaText(change.deltaMinutes)]
        if textKey == "dst.in" { v["n"] = String(daysUntil) }
        return v
    }
}

/// Port of app.js nextOffsetChange / dstNote (data only; UI localizes "dst.*").
public enum ClockChanges {
    private static let dayMs = 86_400_000.0

    /// app.js dstNote short delta (never truncates on a card): "+1h", "−1h", "−30m", "+1h30m". Minus is U+2212;
    /// the text is not localized (the full sentence lives in dst.forward / dst.back).
    public static func deltaText(_ deltaMinutes: Int) -> String {
        let a = abs(deltaMinutes), h = a / 60, m = a % 60
        return (deltaMinutes > 0 ? "+" : "\u{2212}") + (h > 0 ? "\(h)h" : "") + (m > 0 ? "\(m)m" : "")
    }

    /// First UTC-offset change within `withinDays` days after `date`: daily samples find the day, a binary
    /// search pins the minute.
    public static func nextOffsetChange(_ zone: String, after date: Date, withinDays: Int = 7) -> OffsetChange? {
        let ms = epochMs(date)
        let off = { (x: Double) in TimeMath.offsetMinutes(zone, ms: x) }
        let old = off(ms)
        guard withinDays >= 1 else { return nil }
        for d in 1...withinDays {
            let hiOff = off(ms + Double(d) * dayMs)
            if hiOff == old { continue }
            var lo = ms + Double(d - 1) * dayMs, hi = ms + Double(d) * dayMs
            while hi - lo > 60_000 {
                let mid = ((lo + hi) / 2).rounded(.down)
                if off(mid) == old { lo = mid } else { hi = mid }
            }
            let at = (hi / 60_000).rounded(.down) * 60_000
            let wallMs = at + Double(old) * 60_000
            let secOfDay = Int((wallMs / 1000).rounded(.down)) % 86400
            let sod = secOfDay < 0 ? secOfDay + 86400 : secOfDay
            return OffsetChange(at: dateFromMs(at), deltaMinutes: off(hi) - old, oldOffsetMinutes: old,
                                wallClockBefore: HourMinute(hour: sod / 3600, minute: (sod % 3600) / 60))
        }
        return nil
    }

    /// dstNote: the next change within 7 days and how many local calendar days away it is. Like app.js, the day
    /// comes from the wall clock at the change in the OLD offset, so a change at local midnight (Santiago, Beirut,
    /// Cairo, Havana) falls on the day that starts at 00:00, not on the day before.
    public static func note(_ zone: String, at date: Date) -> ClockChangeNote? {
        guard let ch = nextOffsetChange(zone, after: date) else { return nil }
        let wallMs = epochMs(ch.at) + Double(ch.oldOffsetMinutes) * 60_000
        let changeDay = Int((wallMs / dayMs).rounded(.down))
        let b = TimeMath.wallClock(zone, at: date)
        let days = changeDay - daysFromCivil(b.year, b.month, b.day)
        let c = civilFromDays(changeDay)
        let noon = TimeMath.zonedToEpoch(zone, year: c.year, month: c.month, day: c.day, hour: 12, minute: 0)
        return ClockChangeNote(change: ch, daysUntil: days, dayOfChange: noon)
    }
}
