import Foundation

/// A zone's working hours (CONTRACT.md v1.3 `hours` entry).
public struct WorkingHours: Codable, Hashable, Sendable {
    /// "HH:MM" 24h
    public var start: String
    /// "HH:MM" 24h; end < start = overnight shift ending the next day.
    public var end: String
    /// Working weekdays, 0 = Sunday, sorted unique.
    public var days: [Int]

    public init(start: String, end: String, days: [Int]) {
        self.start = start
        self.end = end
        self.days = days.sorted()
    }

    private enum CodingKeys: String, CodingKey { case start, end, days }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        start = try c.decode(String.self, forKey: .start)
        end = try c.decode(String.self, forKey: .end)
        days = try c.decode([Int].self, forKey: .days).sorted()
    }

    /// 09:00-18:00, Mon-Fri.
    public static let `default` = WorkingHours(start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5])

    /// `/^([01]\d|2[0-3]):[0-5]\d$/`
    static func isHHMM(_ s: String) -> Bool {
        let u = Array(s.unicodeScalars)
        guard u.count == 5, u[2] == ":" else { return false }
        func d(_ i: Int) -> Int? { (48...57).contains(u[i].value) ? Int(u[i].value) - 48 : nil }
        guard let h1 = d(0), let h2 = d(1), let m1 = d(3), d(4) != nil else { return false }
        let hourOK = (h1 <= 1) || (h1 == 2 && h2 <= 3)
        return hourOK && m1 <= 5
    }

    /// CONTRACT.md rules: HH:MM times, start != end, 1...7 unique days in 0...6.
    public var isValid: Bool {
        guard Self.isHHMM(start), Self.isHHMM(end), start != end else { return false }
        guard (1...7).contains(days.count), days.allSatisfy({ (0...6).contains($0) }), Set(days).count == days.count else { return false }
        return true
    }

    private static func toMin(_ s: String) -> Int {
        let u = Array(s.unicodeScalars)
        guard u.count >= 5 else { return 0 }
        func d(_ i: Int) -> Int { max(0, min(9, Int(u[i].value) - 48)) }
        return (d(0) * 10 + d(1)) * 60 + d(3) * 10 + d(4)
    }
    public var startMinutes: Int { Self.toMin(start) }
    public var endMinutes: Int { Self.toMin(end) }
}

public enum CellState: String, Codable, Sendable { case work, night, off }

public struct PlannerRow: Hashable, Sendable {
    public var zone: String
    /// 24 entries.
    public var cells: [CellState]
    /// 24 entries: local wall time of each column.
    public var localTimes: [HourMinute]
    public init(zone: String, cells: [CellState], localTimes: [HourMinute]) {
        self.zone = zone
        self.cells = cells
        self.localTimes = localTimes
    }
}

/// [start, end) column indexes.
public struct PlannerRun: Hashable, Sendable {
    public var start: Int
    public var end: Int
    public var hours: Int { end - start }
    public init(start: Int, end: Int) {
        self.start = start
        self.end = end
    }
}

public struct PlannerResult: Hashable, Sendable {
    /// 24 instants: hour h:00 of the day in the source zone (zonedToEpoch).
    public var columns: [Date]
    public var rows: [PlannerRow]
    /// Contiguous columns where EVERY zone is .work (none if zones empty).
    public var runs: [PlannerRun]
    public var totalHours: Int
    /// Longest run (first wins on ties).
    public var best: PlannerRun?
}

/// The best hours of a day with no full overlap: the columns where the most cities (`working` of `total`) work.
public struct PlannerPartial: Hashable, Sendable {
    /// Cities working in each column of `runs` (the highest count of the day, 2 or more).
    public var working: Int
    /// Cities in the plan (rows).
    public var total: Int
    /// Maximal groups of adjacent columns with the top score (`working` cities working, then the most preferred
    /// cities working, then the fewest at night; `Planner.partial`), in column order.
    public var runs: [PlannerRun]
    /// Longest run (earliest on ties).
    public var best: PlannerRun
    public init(working: Int, total: Int, runs: [PlannerRun], best: PlannerRun) {
        self.working = working
        self.total = total
        self.runs = runs
        self.best = best
    }
}

/// Port of app.js hoursOf / isWorking / cellState / buildPlanner (data only).
public enum Planner {
    /// Invalid or missing -> .default.
    public static func hours(for zone: String, in hours: [String: WorkingHours]) -> WorkingHours {
        if let h = hours[zone], h.isValid { return h }
        return .default
    }

    static func isWorking(_ zone: String, hours h: WorkingHours, ms: Double) -> Bool {
        let s = h.startMinutes, e = h.endMinutes
        let w = TimeMath.wallClock(zone, ms: ms)
        let wd = w.weekday, min = (w.hour % 24) * 60 + w.minute
        if s < e { return min >= s && min < e && h.days.contains(wd) }
        if min >= s { return h.days.contains(wd) } // overnight shift, evening part
        if min < e { return h.days.contains((wd + 6) % 7) } // overnight shift started the day before
        return false
    }

    public static func isWorking(_ zone: String, hours: WorkingHours, at date: Date) -> Bool {
        isWorking(zone, hours: hours, ms: epochMs(date))
    }

    static func cellState(_ zone: String, hours: WorkingHours, ms: Double) -> CellState {
        if isWorking(zone, hours: hours, ms: ms) && isWorking(zone, hours: hours, ms: ms + 59 * 60_000) { return .work }
        let w = TimeMath.wallClock(zone, ms: ms + 30 * 60_000)
        let h = Double((w.hour % 24) * 60 + w.minute) / 60
        return h >= 22 || h < 7 ? .night : .off
    }

    public static func cellState(_ zone: String, hours: WorkingHours, hourStart: Date) -> CellState {
        cellState(zone, hours: hours, ms: epochMs(hourStart))
    }

    public static func plan(source: String, year: Int, month: Int, day: Int, zones: [String], hours: [String: WorkingHours]) -> PlannerResult {
        let cols = (0..<24).map { TimeMath.zonedToEpochMs(source, year, month, day, $0, 0) }
        var allWork = cols.map { _ in !zones.isEmpty }
        let rows: [PlannerRow] = zones.map { zone in
            let wh = Self.hours(for: zone, in: hours)
            var cells: [CellState] = []
            var times: [HourMinute] = []
            for (i, ms) in cols.enumerated() {
                let st = cellState(zone, hours: wh, ms: ms)
                if st != .work { allWork[i] = false }
                cells.append(st)
                let w = TimeMath.wallClock(zone, ms: ms)
                times.append(HourMinute(hour: w.hour % 24, minute: w.minute))
            }
            return PlannerRow(zone: zone, cells: cells, localTimes: times)
        }
        var runs: [PlannerRun] = []
        var start = -1
        for i in 0...24 {
            let on = i < 24 && allWork[i]
            if on && start < 0 { start = i }
            if !on && start >= 0 { runs.append(PlannerRun(start: start, end: i)); start = -1 }
        }
        let total = runs.reduce(0) { $0 + $1.hours }
        var best: PlannerRun?
        for r in runs where best == nil || r.hours > best!.hours { best = r }
        return PlannerResult(columns: cols.map(dateFromMs), rows: rows, runs: runs, totalHours: total, best: best)
    }

    /// Best partial slot for a day without a full overlap, scored like the Windows fallback (time.js bestHours): each
    /// column scores [cities working, `prefer` cities working, minus cities at night], compared in that order, so a
    /// tie goes to the hours where the home city and the planner source work, then to the hours with fewer cities at
    /// night. nil when the plan has an overlap, fewer than 3 rows, or no hour with at least 2 cities working.
    /// Otherwise `working` is the highest count of .work cells in one column, `runs` the maximal groups of adjacent
    /// columns with the top score and `best` the longest of them (earliest on ties), which is the run bestHours returns.
    /// `prefer` holds zones (duplicates and zones without a row are ignored); empty = no preference.
    public static func partial(_ plan: PlannerResult, prefer: [String] = []) -> PlannerPartial? {
        guard plan.totalHours == 0, plan.rows.count >= 3 else { return nil }
        let columns = plan.rows.map(\.cells.count).min() ?? 0
        guard columns > 0 else { return nil }
        let preferred = Set(prefer)
        let scores: [PartialScore] = (0..<columns).map { i in
            var score = PartialScore()
            for row in plan.rows {
                switch row.cells[i] {
                case .work:
                    score.working += 1
                    if preferred.contains(row.zone) { score.preferred += 1 }
                case .night:
                    score.night += 1
                case .off:
                    break
                }
            }
            return score
        }
        guard let top = scores.max(), top.working >= 2, top.working < plan.rows.count else { return nil }
        var runs: [PlannerRun] = []
        var start = -1
        for i in 0...columns {
            let on = i < columns && scores[i] == top
            if on && start < 0 { start = i }
            if !on && start >= 0 { runs.append(PlannerRun(start: start, end: i)); start = -1 }
        }
        guard var best = runs.first else { return nil }
        for r in runs.dropFirst() where r.hours > best.hours { best = r }
        return PlannerPartial(working: top.working, total: plan.rows.count, runs: runs, best: best)
    }

    /// time.js bestHours column score: more cities working, then more preferred cities working, then fewer at night.
    private struct PartialScore: Comparable {
        var working = 0
        var preferred = 0
        var night = 0

        static func < (a: PartialScore, b: PartialScore) -> Bool {
            if a.working != b.working { return a.working < b.working }
            if a.preferred != b.preferred { return a.preferred < b.preferred }
            return a.night > b.night
        }
    }
}
