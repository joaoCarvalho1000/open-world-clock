import Foundation
import WorldClockCore

/// A calendar date with no time zone attached (app.js 'YYYY-MM-DD' strings).
struct CivilDate: Hashable, Sendable, Comparable {
    var year: Int
    var month: Int
    var day: Int

    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    init(_ wall: WallClock) {
        self.init(year: wall.year, month: wall.month, day: wall.day)
    }

    /// The date at 12:00 UTC (DatePicker bindings use a UTC environment).
    init(noonUTC date: Date) {
        let parts = Calendar.gregorianUTC.dateComponents([.year, .month, .day], from: date)
        self.init(year: parts.year ?? 1970, month: parts.month ?? 1, day: parts.day ?? 1)
    }

    /// Today's date on the wall clock of `zone`.
    static func today(in zone: String, now: Date = .now) -> CivilDate {
        CivilDate(TimeMath.wallClock(zone, at: now))
    }

    var noonUTC: Date {
        var parts = DateComponents()
        parts.year = year; parts.month = month; parts.day = day; parts.hour = 12
        return Calendar.gregorianUTC.date(from: parts) ?? Date(timeIntervalSince1970: 0)
    }

    func adding(days: Int) -> CivilDate {
        CivilDate(noonUTC: noonUTC.addingTimeInterval(Double(days) * 86_400))
    }

    /// "Thu, Sep 24".
    var label: String { WCFormat.calendarDateText(year: year, month: month, day: day) }
    var longLabel: String { WCFormat.calendarDateText(year: year, month: month, day: day, long: true) }

    /// Date shortcut chip (converter and planner): "Today", "Tomorrow", then the short weekday ("Thu").
    /// `offset` = days from today (this date is `today.adding(days: offset)`).
    func chipLabel(offset: Int) -> String {
        switch offset {
        case 0: return L10n.tr("day.today")
        case 1: return L10n.tr("day.tomorrow")
        default: return WCFormat.calendarWeekdayShort(year: year, month: month, day: day)
        }
    }

    static func < (lhs: CivilDate, rhs: CivilDate) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }
}

/// The converter state: a wall time in a source zone and the instant it maps to.
struct Conversion: Hashable, Sendable {
    static let step: TimeInterval = 15 * 60

    let zone: String
    let date: CivilDate
    let time: HourMinute
    /// Stored, not recomputed: scrubbing through a clocks-back overlap must keep the exact instant.
    let instant: Date

    /// Wall time -> instant (time.js zonedToEpoch semantics: overlap = first, gap = shifted forward).
    init(zone: String, date: CivilDate, time: HourMinute) {
        self.zone = zone
        self.date = date
        self.time = time
        self.instant = TimeMath.zonedToEpoch(zone, year: date.year, month: date.month, day: date.day,
                                             hour: time.hour, minute: time.minute)
    }

    /// Instant -> wall time in `zone` (seconds dropped).
    init(zone: String, instant: Date) {
        let exact = Date(timeIntervalSince1970: (instant.timeIntervalSince1970 / 60).rounded(.down) * 60)
        let wall = TimeMath.wallClock(zone, at: exact)
        self.zone = zone
        self.date = CivilDate(wall)
        self.time = HourMinute(hour: wall.hour, minute: wall.minute)
        self.instant = exact
    }

    /// `date` rounded to the nearest 15 minutes (every real UTC offset is a multiple of 15 min).
    static func rounded(_ date: Date) -> Date {
        Date(timeIntervalSince1970: (date.timeIntervalSince1970 / step).rounded() * step)
    }
}

/// Fixed origin for the time scrubber: 00:00 of `day` in `zone`, indexed in 15-minute steps.
struct ScrubAnchor: Hashable, Sendable {
    /// Two days back to nine days ahead (covers the Today...+6 date chips with room to scrub).
    static let range: ClosedRange<Int> = -192...864

    let zone: String
    let day: CivilDate
    let midnight: Date

    init(zone: String, day: CivilDate) {
        self.zone = zone
        self.day = day
        self.midnight = TimeMath.zonedToEpoch(zone, year: day.year, month: day.month, day: day.day, hour: 0, minute: 0)
    }

    func index(for instant: Date) -> Int {
        Int((instant.timeIntervalSince(midnight) / Conversion.step).rounded())
    }

    func instant(at index: Int) -> Date {
        midnight.addingTimeInterval(Double(index) * Conversion.step)
    }

    func contains(_ instant: Date) -> Bool {
        Self.range.contains(index(for: instant))
    }
}
