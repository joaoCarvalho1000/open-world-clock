import Foundation

/// Port of the pure helpers in src/renderer/views/map.js `_internals` (same formulas as sun.js, derived from SunCalc;
/// see the BSD-2 notice in Sun.swift).
public enum WorldMap {
    private static let rad = Double.pi / 180
    private static let dayMs = 86_400_000.0
    private static let J1970 = 2440588.0
    private static let J2000 = 2451545.0
    private static let obliquity = rad * 23.4397
    /// map.js SUNSET_ALT (degrees); Sun.isDay uses the same threshold.
    public static let sunsetAltitude: Double = -0.833
    private static let twilightHigh = 0.5   // shading starts just before sunset...
    private static let twilightCivil = -6.0 // ...reaches ~half strength at the end of civil twilight...
    private static let twilightLow = -12.0  // ...and is full night at nautical dusk.

    /// ((((lng + 180) % 360) + 360) % 360) - 180, with JS `%` (truncated remainder).
    public static func wrapLng(_ lng: Double) -> Double {
        let a = (lng + 180).truncatingRemainder(dividingBy: 360)
        return (a + 360).truncatingRemainder(dividingBy: 360) - 180
    }

    /// Subsolar point: lat = declination, lng = subsolar longitude (-180...180).
    public static func subsolar(at date: Date) -> Coordinate {
        let d = epochMs(date) / dayMs - 0.5 + J1970 - J2000
        let M = rad * (357.5291 + 0.98560028 * d)
        let C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M))
        let L = M + C + rad * 102.9372 + Double.pi
        let dec = asin(sin(obliquity) * sin(L))
        let ra = atan2(sin(L) * cos(obliquity), cos(L))
        let theta = rad * (280.16 + 360.9856235 * d) // Greenwich sidereal angle
        return Coordinate(lat: dec / rad, lng: wrapLng((ra - theta) / rad))
    }

    /// Sun altitude (degrees) at lat/lng given a subsolar point.
    public static func altitude(lat: Double, lng: Double, subsolar ss: Coordinate) -> Double {
        let p = lat * rad, dec = ss.lat * rad
        let s = sin(p) * sin(dec) + cos(p) * cos(dec) * cos((lng - ss.lng) * rad)
        return asin(max(-1, min(1, s))) / rad
    }

    public static func isNight(at date: Date, lat: Double, lng: Double) -> Bool {
        altitude(lat: lat, lng: lng, subsolar: subsolar(at: date)) <= sunsetAltitude
    }

    private static func smooth(_ t: Double) -> Double { t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t) }

    /// 0 = full day, 1 = full night, with a soft civil-twilight band in between.
    public static func nightAlpha(altitude alt: Double) -> Double {
        if alt >= twilightHigh { return 0 }
        if alt <= twilightLow { return 1 }
        if alt >= twilightCivil { return 0.5 * smooth((twilightHigh - alt) / (twilightHigh - twilightCivil)) }
        return 0.5 + 0.5 * smooth((twilightCivil - alt) / (twilightCivil - twilightLow))
    }

    /// Latitude of the terminator for a longitude.
    public static func terminatorLat(lng: Double, subsolar ss: Coordinate) -> Double {
        let dec = (abs(ss.lat) < 1e-6 ? 1e-6 : ss.lat) * rad
        return atan(-cos((lng - ss.lng) * rad) / tan(dec)) / rad
    }

    /// map.js pickCenter: longitude to put at the middle of the view, opposite the widest empty gap between
    /// cities, so the map seam never cuts through a group of cities. Non-finite values are ignored;
    /// no longitudes -> 10, one longitude -> that longitude (wrapped).
    public static func pickCenter(longitudes: [Double]) -> Double {
        let xs = longitudes.filter { $0.isFinite }.map(wrapLng).sorted()
        if xs.isEmpty { return 10 }
        if xs.count == 1 { return xs[0] }
        var best = -1.0, seam = 180.0
        for i in 0..<xs.count {
            let a = xs[i], b = i + 1 < xs.count ? xs[i + 1] : xs[0] + 360
            if b - a > best { best = b - a; seam = (a + b) / 2 }
        }
        return wrapLng(seam + 180)
    }
}

public enum PathCommand: Hashable, Sendable {
    case move(x: Double, y: Double)
    case line(x: Double, y: Double)
    case close
}

/// Minimal SVG path parser: M/m L/l H/h V/v Z/z with implicit repeats (what world-land uses).
/// Output coordinates are absolute. Unsupported commands stop parsing.
public enum SVGPathParser {
    public static func parse(_ d: String) -> [PathCommand] {
        var s = Array(d.utf8)
        s.append(0) // sentinel
        var i = 0
        var out: [PathCommand] = []
        out.reserveCapacity(s.count / 4)
        var cx = 0.0, cy = 0.0, sx = 0.0, sy = 0.0
        var cmd: UInt8 = 0

        func skipSeparators() {
            while i < s.count - 1, s[i] == 0x20 || s[i] == 0x2C || s[i] == 0x0A || s[i] == 0x0D || s[i] == 0x09 { i += 1 }
        }
        func isNumberStart(_ c: UInt8) -> Bool { (c >= 0x30 && c <= 0x39) || c == 0x2D || c == 0x2B || c == 0x2E }
        func number() -> Double? {
            skipSeparators()
            let start = i
            if s[i] == 0x2D || s[i] == 0x2B { i += 1 }
            var digits = 0
            while s[i] >= 0x30 && s[i] <= 0x39 { i += 1; digits += 1 }
            if s[i] == 0x2E {
                i += 1
                while s[i] >= 0x30 && s[i] <= 0x39 { i += 1; digits += 1 }
            }
            if digits == 0 { i = start; return nil }
            if s[i] == 0x65 || s[i] == 0x45 { // exponent
                let save = i
                i += 1
                if s[i] == 0x2D || s[i] == 0x2B { i += 1 }
                var ed = 0
                while s[i] >= 0x30 && s[i] <= 0x39 { i += 1; ed += 1 }
                if ed == 0 { i = save }
            }
            let text = String(decoding: s[start..<i], as: UTF8.self)
            return Double(text)
        }

        while true {
            skipSeparators()
            let c = s[i]
            if c == 0 { break }
            if isNumberStart(c) {
                // Implicit repeat of the previous command (after M/m it is L/l).
                if cmd == 0 || cmd == 0x5A || cmd == 0x7A { break }
                if cmd == 0x4D { cmd = 0x4C } else if cmd == 0x6D { cmd = 0x6C }
            } else {
                cmd = c
                i += 1
                if cmd == 0x5A || cmd == 0x7A { // Z z
                    out.append(.close)
                    cx = sx; cy = sy
                    continue
                }
            }
            switch cmd {
            case 0x4D, 0x6D: // M m
                guard let x = number(), let y = number() else { return out }
                if cmd == 0x6D { cx += x; cy += y } else { cx = x; cy = y }
                sx = cx; sy = cy
                out.append(.move(x: cx, y: cy))
            case 0x4C, 0x6C: // L l
                guard let x = number(), let y = number() else { return out }
                if cmd == 0x6C { cx += x; cy += y } else { cx = x; cy = y }
                out.append(.line(x: cx, y: cy))
            case 0x48, 0x68: // H h
                guard let x = number() else { return out }
                cx = cmd == 0x68 ? cx + x : x
                out.append(.line(x: cx, y: cy))
            case 0x56, 0x76: // V v
                guard let y = number() else { return out }
                cy = cmd == 0x76 ? cy + y : y
                out.append(.line(x: cx, y: cy))
            default:
                return out
            }
        }
        return out
    }
}

/// Natural Earth 110m land outline (shared/world-land.json), equirectangular.
public struct WorldLand: Sendable {
    /// Bundle.module "world-land.json".
    public static let shared: WorldLand = {
        guard let url = Bundle.module.url(forResource: "world-land", withExtension: "json"),
              let data = try? Data(contentsOf: url) else {
            fatalError("WorldClockCore: world-land.json resource is missing (run node apple/WorldClockCore/sync-resources.mjs)")
        }
        do { return try WorldLand(jsonData: data) } catch {
            fatalError("WorldClockCore: world-land.json is invalid: \(error)")
        }
    }()

    /// 3600 x 1330, lat 75N..58S; x = (lng+180)*10, y = (75-lat)*10.
    public let width: Double, height: Double, north: Double, south: Double
    /// Raw SVG "d".
    public let pathData: String
    private let box: CommandBox

    private final class CommandBox: @unchecked Sendable {
        let lock = NSLock()
        var commands: [PathCommand]?
    }

    public init(jsonData: Data) throws {
        let v = try JSONDecoder().decode(JSONValue.self, from: jsonData)
        guard let d = v["d"]?.string ?? v["pathData"]?.string else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "world-land.json: missing \"d\""))
        }
        width = v["width"]?.double ?? 3600
        height = v["height"]?.double ?? 1330
        north = v["north"]?.double ?? 75
        south = v["south"]?.double ?? -58
        pathData = d
        box = CommandBox()
    }

    /// Parsed once, absolute coordinates in width x height space.
    public var commands: [PathCommand] {
        box.lock.lock()
        defer { box.lock.unlock() }
        if let c = box.commands { return c }
        let c = SVGPathParser.parse(pathData)
        box.commands = c
        return c
    }

    public func point(lat: Double, lng: Double) -> (x: Double, y: Double) {
        ((lng + 180) / 360 * width, (north - lat) / (north - south) * height)
    }
}
