import Foundation
import WorldClockCore

/// Display formatting shared by the app and the widgets (Foundation + WorldClockCore only).
/// Every text follows `L10n.language`; formats mirror src/renderer/app.js.
enum WCFormat {
    /// Locale for dates and times (follows the language setting, like i18n.js LOCALES).
    static var locale: Locale { L10n.locale }

    // MARK: Clock digits

    /// Card digits for `zone` at `date` ("09:05" / "9:05" + "AM").
    static func clock(_ zone: String, at date: Date, hour12: Bool) -> ClockText {
        ClockText.make(zone, at: date, hour12: hour12, locale: locale)
    }

    /// "9:05 AM" or "09:05" (app.js `k.ampm ? hm + ' ' + ampm : hm`).
    static func timeText(_ clock: ClockText) -> String {
        clock.ampm.isEmpty ? clock.hm : "\(clock.hm) \(clock.ampm)"
    }

    static func timeText(_ zone: String, at date: Date, hour12: Bool) -> String {
        timeText(clock(zone, at: date, hour12: hour12))
    }

    /// Human-facing wall time (hint, copy, planner): app.js formatTime via Intl.
    static func formatTime(hour: Int, minute: Int, hour12: Bool) -> String {
        var parts = DateComponents()
        parts.year = 2026; parts.month = 1; parts.day = 1; parts.hour = hour; parts.minute = minute
        let date = Calendar.gregorianUTC.date(from: parts) ?? Date(timeIntervalSince1970: 0)
        return FormatterCache.shared.string(from: date, template: hour12 ? "hmma" : "HHmm", zone: .gmt, locale: locale)
    }

    static func formatTime(_ time: HourMinute, hour12: Bool) -> String {
        formatTime(hour: time.hour, minute: time.minute, hour12: hour12)
    }

    // MARK: Dates

    /// "Tue, Sep 22, 2026" (card date, en-US).
    static func dateText(_ zone: String, at date: Date) -> String {
        format(date, template: "EEEMMMdyyyy", zone: zone)
    }

    /// "Tue, Sep 22" (copy lines).
    static func shortDateText(_ zone: String, at date: Date) -> String {
        format(date, template: "EEEMMMd", zone: zone)
    }

    /// "Tue" / "Ter": trailing dot stripped, first letter upper-cased (planner midnight cells, chips).
    static func weekdayShort(_ zone: String, at date: Date) -> String {
        capitalized(stripDot(format(date, template: "EEE", zone: zone)))
    }

    /// A calendar date with no zone shift: "Thu, Sep 24" (`long`: "Thursday, September 24").
    static func calendarDateText(year: Int, month: Int, day: Int, long: Bool = false) -> String {
        FormatterCache.shared.string(from: noonUTC(year: year, month: month, day: day),
                                     template: long ? "EEEEMMMMd" : "EEEMMMd", zone: .gmt, locale: locale)
    }

    /// Short weekday of a calendar date ("Thu"), capitalized, dot stripped.
    static func calendarWeekdayShort(year: Int, month: Int, day: Int) -> String {
        let text = FormatterCache.shared.string(from: noonUTC(year: year, month: month, day: day),
                                                template: "EEE", zone: .gmt, locale: locale)
        return capitalized(stripDot(text))
    }

    // MARK: Card labels

    /// app.js dayMarker: "" / "+1 day" / "−1 day" / "+2 days" / "−2 days".
    static func dayMarker(_ diff: Int) -> String {
        switch diff {
        case 0: return ""
        case 1: return L10n.tr("day.plus1")
        case -1: return L10n.tr("day.minus1")
        default: return L10n.tr(diff > 0 ? "day.plusN" : "day.minusN", ["n": String(abs(diff))])
        }
    }

    /// app.js durationText: "1 h", "30 min", "1 h 30 min" (absolute value).
    static func durationText(_ minutes: Int) -> String {
        let parts = DurationParts.split(minutes)
        var pieces: [String] = []
        if parts.hours > 0 { pieces.append(L10n.tr("unit.h", ["n": String(parts.hours)])) }
        if parts.minutes > 0 { pieces.append(L10n.tr("unit.min", ["n": String(parts.minutes)])) }
        return pieces.joined(separator: " ")
    }

    /// Signed duration for the widget shift: "+1 h", "+2 h", "+1 h 30 min"; U+2212 for negative like the desktop app.
    static func shiftText(_ minutes: Int) -> String {
        (minutes < 0 ? "\u{2212}" : "+") + durationText(minutes)
    }

    /// "Sunrise 6:58 AM · Sunset 7:05 PM", or "Sun doesn't set/rise today" in polar day/night (app.js sunTitleOf);
    /// nil for zones without coordinates. Times are on the wall clock of `zone`, for the solar day nearest `date`.
    static func sunText(_ zone: String, at date: Date, hour12: Bool) -> String? {
        guard let c = ZoneCatalog.shared.coordinate(of: zone) else { return nil }
        let times = Sun.times(at: date, lat: c.lat, lng: c.lng)
        switch times.polar {
        case .day?: return L10n.tr("sun.noSet")
        case .night?: return L10n.tr("sun.noRise")
        case nil:
            guard let rise = times.sunrise, let set = times.sunset else { return nil }
            return L10n.tr("sun.times", ["rise": timeText(zone, at: rise, hour12: hour12),
                                         "set": timeText(zone, at: set, hour12: hour12)])
        }
    }

    /// "Clocks +1h in 5 days" / "Clocks −1h tomorrow" / "Clocks +30m today" (app.js dstNote; key and short delta from the core).
    static func clockChangeText(_ note: ClockChangeNote) -> String {
        L10n.tr(note.textKey, note.textVars)
    }

    /// "Clocks go forward 1 h on Sun, Mar 29, 2026 at 01:00" (dst.forward / dst.back).
    static func clockChangeDetail(_ note: ClockChangeNote, zone: String, hour12: Bool) -> String {
        let key = note.change.deltaMinutes > 0 ? "dst.forward" : "dst.back"
        return L10n.tr(key, [
            "d": durationText(note.change.deltaMinutes),
            "date": dateText(zone, at: note.dayOfChange),
            "time": formatTime(note.change.wallClockBefore, hour12: hour12),
        ])
    }

    /// "+5h", "−3h30m", "±0", or the localized "Local" for the device zone.
    static func relativeLabel(_ zone: String, at date: Date, localZone: String) -> String {
        TimeMath.relativeOffsetLabel(zone, at: date, localZone: localZone) ?? L10n.tr("rel.local")
    }

    /// Spoken form of `relativeLabel` for VoiceOver: "3 hours, 30 minutes ahead", "5 hours behind", "Same time",
    /// or "Local" for the device zone (the compact "+3h30m" is read letter by letter).
    static func spokenRelative(_ zone: String, at date: Date, localZone: String) -> String {
        if zone == localZone { return L10n.tr("rel.local") }
        let delta = TimeMath.offsetMinutes(zone, at: date) - TimeMath.offsetMinutes(localZone, at: date)
        if delta == 0 { return L10n.tr("rel.same") }
        return L10n.tr(delta > 0 ? "rel.ahead" : "rel.behind", ["d": spokenDuration(delta)])
    }

    /// Fully spelled, pluralized duration in the app language ("3 hours, 30 minutes", "3 horas e 30 minutos").
    static func spokenDuration(_ minutes: Int) -> String {
        let parts = DurationParts.split(minutes)
        let seconds = TimeInterval(parts.hours * 3600 + parts.minutes * 60)
        return SpokenDurationCache.shared.string(seconds, locale: locale) ?? durationText(minutes)
    }

    /// Localized sun phase ("Night", "Golden", ...).
    static func phaseLabel(_ zone: String, at date: Date) -> String {
        L10n.tr(Sun.phase(zone: zone, at: date).localizationKey)
    }

    /// Letters-only abbreviation ("EST", "CEST"); "" for "GMT+5:30"-style or GMT/UTC (app.js tzInfo).
    static func abbreviation(_ zone: String, at date: Date) -> String {
        guard let tz = TimeMath.timeZone(zone), let abbr = tz.abbreviation(for: date) else { return "" }
        let lettersOnly = !abbr.isEmpty && abbr.unicodeScalars.allSatisfy { CharacterSet.letters.contains($0) }
        return lettersOnly && abbr != "GMT" && abbr != "UTC" ? abbr : ""
    }

    /// Localized long zone name ("Central European Summer Time").
    static func longName(_ zone: String, at date: Date) -> String {
        guard let tz = TimeMath.timeZone(zone) else { return "" }
        let style: NSTimeZone.NameStyle = tz.isDaylightSavingTime(for: date) ? .daylightSaving : .standard
        return tz.localizedName(for: style, locale: locale) ?? ""
    }

    /// One VoiceOver label per card (app.js aria-label order, plus the Home marker, the spoken relative offset,
    /// the working-hours state and the date). Day markers are relative to `refZone` (converter source or home);
    /// the offset is relative to `homeZone`.
    static func accessibilitySummary(zone: String, name: String, at date: Date, hour12: Bool,
                                     refZone: String, homeZone: String, hours: WorkingHours, asleep: Bool) -> String {
        let marker = dayMarker(TimeMath.dayDiff(zone, at: date, relativeTo: refZone))
        let dst = ClockChangeCache.note(zone, at: date).map(clockChangeText) ?? ""
        let working = Planner.isWorking(zone, hours: hours, at: date)
        return [
            name,
            zone == homeZone ? L10n.tr("card.home") : "",
            timeText(zone, at: date, hour12: hour12),
            spokenRelative(zone, at: date, localZone: homeZone),
            phaseLabel(zone, at: date),
            asleep ? L10n.tr("card.asleep") : "",
            working ? L10n.tr("plan.state.work") : L10n.tr("plan.state.off"),
            TimeMath.utcLabel(zone, at: date),
            longName(zone, at: date),
            dateText(zone, at: date),
            marker,
            dst,
        ].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    // MARK: Private

    private static func noonUTC(year: Int, month: Int, day: Int) -> Date {
        var parts = DateComponents()
        parts.year = year; parts.month = month; parts.day = day; parts.hour = 12
        return Calendar.gregorianUTC.date(from: parts) ?? Date(timeIntervalSince1970: 0)
    }

    private static func format(_ date: Date, template: String, zone: String) -> String {
        let tz = TimeMath.timeZone(zone) ?? .gmt
        return FormatterCache.shared.string(from: date, template: template, zone: tz, locale: locale)
    }

    private static func stripDot(_ text: String) -> String {
        text.hasSuffix(".") ? String(text.dropLast()) : text
    }

    private static func capitalized(_ text: String) -> String {
        guard let first = text.first else { return text }
        return String(first).uppercased(with: locale) + text.dropFirst()
    }
}

/// DateComponentsFormatter cache for spoken durations (full unit names, plural rules of the locale).
/// Darwin only (swift-corelibs-foundation has no DateComponentsFormatter); elsewhere callers fall back to durationText.
private final class SpokenDurationCache: @unchecked Sendable {
    static let shared = SpokenDurationCache()
    #if canImport(Darwin)
    private let lock = NSLock()
    private var formatters: [String: DateComponentsFormatter] = [:]
    #endif

    func string(_ seconds: TimeInterval, locale: Locale) -> String? {
        #if canImport(Darwin)
        lock.lock()
        defer { lock.unlock() }
        let formatter: DateComponentsFormatter
        if let cached = formatters[locale.identifier] {
            formatter = cached
        } else {
            formatter = DateComponentsFormatter()
            var calendar = Calendar(identifier: .gregorian)
            calendar.locale = locale
            formatter.calendar = calendar
            formatter.unitsStyle = .full
            formatter.allowedUnits = [.hour, .minute]
            formatter.zeroFormattingBehavior = .dropAll
            formatters[locale.identifier] = formatter
        }
        return formatter.string(from: seconds)
        #else
        return nil
        #endif
    }
}

/// DateFormatter cache (formatters are expensive; `string(from:)` is thread-safe but the cache is not).
private final class FormatterCache: @unchecked Sendable {
    static let shared = FormatterCache()
    private let lock = NSLock()
    private var formatters: [String: DateFormatter] = [:]

    func string(from date: Date, template: String, zone: TimeZone, locale: Locale) -> String {
        let key = "\(template)|\(zone.identifier)|\(locale.identifier)"
        lock.lock()
        defer { lock.unlock() }
        if let cached = formatters[key] { return cached.string(from: date) }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = zone
        formatter.setLocalizedDateFormatFromTemplate(template)
        if formatters.count > 256 { formatters.removeAll() }
        formatters[key] = formatter
        return formatter.string(from: date)
    }
}
