import Foundation

/// Geographic coordinate in degrees.
public struct Coordinate: Codable, Hashable, Sendable {
    public var lat: Double
    public var lng: Double
    public init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }
}

/// A wall-clock time of day (24h).
public struct HourMinute: Codable, Hashable, Sendable, Comparable {
    public var hour: Int
    public var minute: Int
    public init(hour: Int, minute: Int) {
        self.hour = hour
        self.minute = minute
    }
    public var totalMinutes: Int { hour * 60 + minute }
    public static func < (lhs: HourMinute, rhs: HourMinute) -> Bool { lhs.totalMinutes < rhs.totalMinutes }
}

/// Wall-clock fields of an instant in a zone.
public struct WallClock: Hashable, Sendable {
    public var year: Int
    public var month: Int
    public var day: Int
    public var hour: Int
    public var minute: Int
    public var second: Int
    /// 0 = Sunday ... 6 = Saturday (JS style).
    public var weekday: Int

    public init(year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int, weekday: Int) {
        self.year = year
        self.month = month
        self.day = day
        self.hour = hour
        self.minute = minute
        self.second = second
        self.weekday = weekday
    }

    /// "2026-09-23"
    public var ymd: String {
        let y = year < 0 ? "-" + pad(-year, 4) : pad(year, 4)
        return "\(y)-\(pad(month, 2))-\(pad(day, 2))"
    }
}

/// Time-of-day phase shown on each card (app.js sunPhase / time.js phaseOf).
public enum Phase: String, CaseIterable, Codable, Sendable {
    case night, dawn, morning, midday, afternoon, golden, dusk
    /// "phase.night" etc. (keys of shared/strings.json).
    public var localizationKey: String { "phase." + rawValue }
}

// MARK: - Internal helpers

@inline(__always)
func pad(_ n: Int, _ width: Int) -> String {
    let s = String(n)
    return s.count >= width ? s : String(repeating: "0", count: width - s.count) + s
}

/// JS `Math.round`: rounds half up (towards +infinity).
@inline(__always)
func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

/// JS-style integer milliseconds of a Date (JS Dates are whole milliseconds).
@inline(__always)
func epochMs(_ date: Date) -> Double { (date.timeIntervalSince1970 * 1000).rounded() }

@inline(__always)
func dateFromMs(_ ms: Double) -> Date { Date(timeIntervalSince1970: ms / 1000) }

/// Days since 1970-01-01 for a proleptic Gregorian date (month may be out of range, like Date.UTC).
func daysFromCivil(_ year: Int, _ month: Int, _ day: Int) -> Int {
    // Normalize month like Date.UTC does.
    var y = year
    var m = month - 1
    y += Int((Double(m) / 12).rounded(.down))
    m = ((m % 12) + 12) % 12
    let mm = m + 1
    // Howard Hinnant's days_from_civil.
    let yy = mm <= 2 ? y - 1 : y
    let era = (yy >= 0 ? yy : yy - 399) / 400
    let yoe = yy - era * 400
    let mp = (mm + 9) % 12
    let doy = (153 * mp + 2) / 5
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146097 + doe - 719468 + (day - 1)
}

/// Civil (year, month, day) for days since 1970-01-01.
func civilFromDays(_ z0: Int) -> (year: Int, month: Int, day: Int) {
    let z = z0 + 719468
    let era = (z >= 0 ? z : z - 146096) / 146097
    let doe = z - era * 146097
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
    let y = yoe + era * 400
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153
    let d = doy - (153 * mp + 2) / 5 + 1
    let m = mp < 10 ? mp + 3 : mp - 9
    return (m <= 2 ? y + 1 : y, m, d)
}

/// JS `Date.UTC(y, m - 1, d, h, mi)` in milliseconds (month/day/hour overflow normalized).
func utcMs(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ mi: Int = 0, _ s: Int = 0) -> Double {
    let days = Double(daysFromCivil(y, m, d))
    return days * 86_400_000 + Double(h) * 3_600_000 + Double(mi) * 60_000 + Double(s) * 1000
}

/// Minimal JSON value used to read the shared data files tolerantly on every platform.
enum JSONValue: Decodable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let n = try? c.decode(Double.self) { self = .number(n); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
    }

    subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }
    var object: [String: JSONValue]? { if case .object(let o) = self { return o }; return nil }
    var array: [JSONValue]? { if case .array(let a) = self { return a }; return nil }
    var string: String? { if case .string(let s) = self { return s }; return nil }
    var double: Double? { if case .number(let n) = self { return n }; return nil }
    var bool: Bool? { if case .bool(let b) = self { return b }; return nil }
    var isNull: Bool { if case .null = self { return true }; return false }
}

/// Dynamic coding key for tolerant per-entry dictionary decoding.
struct AnyCodingKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init(_ s: String) { stringValue = s; intValue = nil }
    init?(stringValue: String) { self.stringValue = stringValue; intValue = nil }
    init?(intValue: Int) { stringValue = String(intValue); self.intValue = intValue }
}

/// Small thread-safe dictionary cache (NSLock-guarded) used for process-wide memoization.
final class LockedCache<Key: Hashable, Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [Key: Value] = [:]
    private let limit: Int

    init(limit: Int = 4096) { self.limit = limit }

    func value(_ key: Key) -> Value? {
        lock.lock()
        defer { lock.unlock() }
        return storage[key]
    }

    func set(_ key: Key, _ value: Value) {
        lock.lock()
        defer { lock.unlock() }
        if storage.count >= limit { storage.removeAll(keepingCapacity: true) }
        storage[key] = value
    }

    func value(_ key: Key, orInsert make: () -> Value) -> Value {
        if let hit = value(key) { return hit }
        let v = make()
        set(key, v)
        return v
    }
}
