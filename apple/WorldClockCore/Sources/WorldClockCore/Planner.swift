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

    /// The parts of [a, b) (epoch ms) that `zone` spends inside `h`, as merged [start, end) spans. Exact, like time.js
    /// workSpans: the interval is cut at every offset change (found by bisection over seconds, at most one per 6 hours)
    /// and at every local midnight, schedule start and end, and each piece is tested once. Empty for b <= a.
    static func workSpans(_ zone: String, hours h: WorkingHours, from a: Double, to b: Double) -> [(Double, Double)] {
        var spans: [(Double, Double)] = []
        guard b > a else { return spans }
        let day = 86_400_000.0, chunk = 6 * 3_600_000.0
        func off(_ t: Double) -> Double { Double(TimeMath.offsetSeconds(zone, ms: t)) * 1000 }
        var pieces: [(Double, Double, Double)] = []
        var s = a
        while s < b {
            let e = min(b, s + chunk)
            let oa = off(s), ob = off(e - 1)
            if oa == ob {
                pieces.append((s, e, oa))
            } else {
                var lo = (s / 1000).rounded(.down), hi = ((e - 1) / 1000).rounded(.up)
                while hi - lo > 1 {
                    let mid = ((lo + hi) / 2).rounded(.down)
                    if off(mid * 1000) == oa { lo = mid } else { hi = mid }
                }
                let cut = max(s, min(e, hi * 1000))
                if cut > s { pieces.append((s, cut, oa)) }
                if e > cut { pieces.append((cut, e, ob)) }
            }
            s = e
        }
        let marks = [0.0, Double(h.startMinutes), Double(h.endMinutes)]
        for (ps, pe, o) in pieces {
            var cuts = [ps, pe]
            var d = ((ps + o) / day).rounded(.down)
            let last = ((pe - 1 + o) / day).rounded(.down)
            while d <= last {
                for mins in marks {
                    let t = d * day + mins * 60_000 - o
                    if t > ps && t < pe { cuts.append(t) }
                }
                d += 1
            }
            cuts.sort()
            for i in 0..<(cuts.count - 1) {
                let x = cuts[i], y = cuts[i + 1]
                guard y > x, isWorking(h, wallMs: x + o) else { continue }
                if let l = spans.last, l.1 == x { spans[spans.count - 1].1 = y } else { spans.append((x, y)) }
            }
        }
        return spans
    }

    /// Whether wall-clock ms `w` (the local date and time written as a UTC epoch) is inside `h`.
    static func isWorking(_ h: WorkingHours, wallMs w: Double) -> Bool {
        let day = (w / 86_400_000).rounded(.down)
        let min = (w - day * 86_400_000) / 60_000
        let wd = ((Int(day) + 4) % 7 + 7) % 7 // 1970-01-01 was a Thursday
        let s = Double(h.startMinutes), e = Double(h.endMinutes)
        if s < e { return min >= s && min < e && h.days.contains(wd) }
        if min >= s { return h.days.contains(wd) }
        if min < e { return h.days.contains((wd + 6) % 7) }
        return false
    }

    /// Whether `zone` is inside `h` for the whole of [a, b) (time.js worksThroughout). False for b <= a.
    static func worksThroughout(_ zone: String, hours h: WorkingHours, from a: Double, to b: Double) -> Bool {
        let s = workSpans(zone, hours: h, from: a, to: b)
        return b > a && s.count == 1 && s[0].0 == a && s[0].1 == b
    }

    /// .work only when the city is inside its hours for the whole hour from `ms` (exact, not two samples).
    static func cellState(_ zone: String, hours: WorkingHours, ms: Double) -> CellState {
        if worksThroughout(zone, hours: hours, from: ms, to: ms + 3_600_000) { return .work }
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

    /// Best partial slot for a day without a full overlap: each column scores [cities working, `prefer` cities working,
    /// minus cities at night], compared in that order, so a tie goes to the hours where the home city and the planner
    /// source work, then to the hours with fewer cities at night. nil when the plan has an overlap, fewer than 3 rows,
    /// or no hour with at least 2 cities working. Otherwise `working` is the highest count of .work cells in one column,
    /// `runs` the maximal groups of adjacent columns with the top score AND the same working cities (so a run never
    /// claims `working` cities throughout when different cities work its hours) and `best` the longest of them
    /// (earliest on ties). The Windows app replaced this with Find a time (time.js findTimes, whole-meeting coverage).
    /// `prefer` holds zones (duplicates and zones without a row are ignored); empty = no preference.
    public static func partial(_ plan: PlannerResult, prefer: [String] = []) -> PlannerPartial? {
        guard plan.totalHours == 0, plan.rows.count >= 3 else { return nil }
        let columns = plan.rows.map(\.cells.count).min() ?? 0
        guard columns > 0 else { return nil }
        let preferred = Set(prefer)
        let members: [[Int]] = (0..<columns).map { i in plan.rows.indices.filter { plan.rows[$0].cells[i] == .work } }
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
            // a change of working cities ends the run, even at the same score
            if on && start >= 0 && members[i] != members[start] { runs.append(PlannerRun(start: start, end: i)); start = -1 }
            if on && start < 0 { start = i }
            if !on && start >= 0 { runs.append(PlannerRun(start: start, end: i)); start = -1 }
        }
        guard var best = runs.first else { return nil }
        for r in runs.dropFirst() where r.hours > best.hours { best = r }
        return PlannerPartial(working: top.working, total: plan.rows.count, runs: runs, best: best)
    }

    /// Column score: more cities working, then more preferred cities working, then fewer at night.
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
