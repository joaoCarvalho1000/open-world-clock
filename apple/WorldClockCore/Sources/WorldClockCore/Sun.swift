// Sunrise, sunset and sun altitude: a port of src/renderer/sun.js, which is derived from SunCalc,
// https://github.com/mourner/suncalc, used under the BSD 2-Clause License:
//
// Copyright (c) 2026, Volodymyr Agafonkin
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are
// permitted provided that the following conditions are met:
//
//    1. Redistributions of source code must retain the above copyright notice, this list of
//       conditions and the following disclaimer.
//
//    2. Redistributions in binary form must reproduce the above copyright notice, this list
//       of conditions and the following disclaimer in the documentation and/or other materials
//       provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
// COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
// EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
// HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
// TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import Foundation

/// Midnight sun (`day`) or polar night (`night`).
public enum Polar: String, Codable, Sendable { case day, night }

public struct SunTimes: Hashable, Sendable {
    public var sunrise: Date?
    public var sunset: Date?
    public var polar: Polar?
    public init(sunrise: Date?, sunset: Date?, polar: Polar?) {
        self.sunrise = sunrise
        self.sunset = sunset
        self.polar = polar
    }
}

public struct SunEvent: Hashable, Sendable {
    public enum Kind: String, Sendable { case sunrise, sunset }
    public var kind: Kind
    public var date: Date
    public init(kind: Kind, date: Date) {
        self.kind = kind
        self.date = date
    }
}

/// Port of src/renderer/sun.js (SunCalc-style NOAA formulas, same constants and Newton refinement)
/// plus app.js sunPhase.
public enum Sun {
    private static let rad = Double.pi / 180
    private static let dayMs = 86_400_000.0
    private static let J1970 = 2440588.0
    private static let J2000 = 2451545.0
    private static let J0 = 0.0009
    private static let e = rad * 23.4397 // obliquity of the Earth
    private static let H0 = -0.833 * rad // sunrise/sunset altitude (refraction + solar disc)

    private static func toJulian(_ ms: Double) -> Double { ms / dayMs - 0.5 + J1970 }
    /// JS `new Date(x)` truncates to whole milliseconds.
    private static func fromJulianMs(_ j: Double) -> Double { ((j + 0.5 - J1970) * dayMs).rounded(.towardZero) }
    private static func toDays(_ ms: Double) -> Double { toJulian(ms) - J2000 }

    private static func solarMeanAnomaly(_ d: Double) -> Double { rad * (357.5291 + 0.98560028 * d) }
    private static func eclipticLongitude(_ M: Double) -> Double {
        let C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M))
        let P = rad * 102.9372 // perihelion of the Earth
        return M + C + P + Double.pi
    }
    private static func declination(_ L: Double) -> Double { asin(sin(e) * sin(L)) }
    private static func rightAscension(_ L: Double) -> Double { atan2(sin(L) * cos(e), cos(L)) }
    private static func siderealTime(_ d: Double, _ lw: Double) -> Double { rad * (280.16 + 360.9856235 * d) - lw }

    static func altitude(ms: Double, lat: Double, lng: Double) -> Double {
        let lw = rad * -lng
        let phi = rad * lat
        let d = toDays(ms)
        let L = eclipticLongitude(solarMeanAnomaly(d))
        let dec = declination(L)
        let H = siderealTime(d, lw) - rightAscension(L)
        let h = asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H))
        return h / rad
    }

    /// Sun altitude in degrees.
    public static func altitude(at date: Date, lat: Double, lng: Double) -> Double {
        altitude(ms: epochMs(date), lat: lat, lng: lng)
    }

    private static func julianCycle(_ d: Double, _ lw: Double) -> Double { jsRound(d - J0 - lw / (2 * Double.pi)) }
    private static func approxTransit(_ Ht: Double, _ lw: Double, _ n: Double) -> Double { J0 + (Ht + lw) / (2 * Double.pi) + n }
    private static func solarTransitJ(_ ds: Double, _ M: Double, _ L: Double) -> Double {
        J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L)
    }

    private static func cycle(ms: Double, lng: Double) -> Double {
        julianCycle(toDays(ms), rad * -lng)
    }

    /// sun.js times() for a given Julian cycle `n`.
    private static func times(cycle n: Double, lat: Double, lng: Double) -> (rise: Double?, set: Double?, polar: Polar?) {
        let lw = rad * -lng
        let phi = rad * lat
        let ds = approxTransit(0, lw, n)
        let M = solarMeanAnomaly(ds)
        let L = eclipticLongitude(M)
        let dec = declination(L)
        let Jnoon = solarTransitJ(ds, M, L)
        let cosW = (sin(H0) - sin(phi) * sin(dec)) / (cos(phi) * cos(dec))
        if cosW < -1 { return (nil, nil, .day) }
        if cosW > 1 { return (nil, nil, .night) }
        let w = acos(cosW)
        let Jset = solarTransitJ(approxTransit(w, lw, n), M, L)
        let Jrise = Jnoon - (Jset - Jnoon)
        return (refine(fromJulianMs(Jrise), lat, lng), refine(fromJulianMs(Jset), lat, lng), nil)
    }

    /// Newton steps so the event lands exactly where altitude() crosses -0.833 deg (keeps isDay consistent).
    private static func refine(_ start: Double, _ lat: Double, _ lng: Double) -> Double {
        var t = start
        for _ in 0..<3 {
            let a = altitude(ms: t.rounded(.towardZero), lat: lat, lng: lng) + 0.833
            let rate = (altitude(ms: (t + 60000).rounded(.towardZero), lat: lat, lng: lng)
                - altitude(ms: (t - 60000).rounded(.towardZero), lat: lat, lng: lng)) / 120_000
            if rate == 0 || rate.isNaN || abs(a) < 1e-4 { break }
            let step = a / rate
            if abs(step) > 1_800_000 { break } // grazing sun: keep the analytic estimate
            t -= step
        }
        return t.rounded(.towardZero)
    }

    /// Sunrise/sunset for the solar day nearest `date`.
    public static func times(at date: Date, lat: Double, lng: Double) -> SunTimes {
        let r = times(cycle: cycle(ms: epochMs(date), lng: lng), lat: lat, lng: lng)
        return SunTimes(sunrise: r.rise.map(dateFromMs), sunset: r.set.map(dateFromMs), polar: r.polar)
    }

    /// altitude > -0.833 deg.
    public static func isDay(at date: Date, lat: Double, lng: Double) -> Bool {
        altitude(at: date, lat: lat, lng: lng) > -0.833
    }

    /// altitude(t + 10 min) > altitude(t).
    public static func isRising(at date: Date, lat: Double, lng: Double) -> Bool {
        let ms = epochMs(date)
        return altitude(ms: ms + 600_000, lat: lat, lng: lng) > altitude(ms: ms, lat: lat, lng: lng)
    }

    /// app.js sunPhase: real-sun phase; localHour only separates morning/midday/afternoon.
    public static func phase(at date: Date, coordinate: Coordinate, localHour hour: Int) -> Phase {
        let ms = epochMs(date)
        let alt = altitude(ms: ms, lat: coordinate.lat, lng: coordinate.lng)
        let rising = altitude(ms: ms + 600_000, lat: coordinate.lat, lng: coordinate.lng) > alt
        if alt < -6 { return .night }
        if rising && alt <= 6 { return .dawn }
        if !rising && alt < 0 { return .dusk }
        if hour >= 11 && hour < 14 && alt > 0 { return .midday }
        if !rising && alt <= 10 { return .golden }
        return rising && hour < 11 ? .morning : .afternoon
    }

    /// Coordinates from ZoneCatalog.shared; falls back to TimeMath.phaseOf(hour:) when unknown.
    public static func phase(zone: String, at date: Date) -> Phase {
        let hour = TimeMath.wallClock(zone, at: date).hour
        guard let c = ZoneCatalog.shared.coordinate(of: zone) else { return TimeMath.phaseOf(hour: hour) }
        return phase(at: date, coordinate: c, localHour: hour)
    }

    /// Real sun when the zone has coordinates; otherwise 7 <= local hour < 19.
    public static func isDay(zone: String, at date: Date) -> Bool {
        if let c = ZoneCatalog.shared.coordinate(of: zone) { return isDay(at: date, lat: c.lat, lng: c.lng) }
        let h = TimeMath.wallClock(zone, at: date).hour
        return h >= 7 && h < 19
    }

    /// Sunrise/sunset instants in (from, until], sorted. Used for widget timeline entries.
    public static func events(for coordinate: Coordinate, from: Date, until: Date) -> [SunEvent] {
        let a = epochMs(from), b = epochMs(until)
        guard b > a else { return [] }
        let n0 = cycle(ms: a, lng: coordinate.lng) - 1
        let n1 = cycle(ms: b, lng: coordinate.lng) + 1
        var out: [SunEvent] = []
        var n = n0
        while n <= n1 {
            let r = times(cycle: n, lat: coordinate.lat, lng: coordinate.lng)
            if let rise = r.rise, rise > a, rise <= b { out.append(SunEvent(kind: .sunrise, date: dateFromMs(rise))) }
            if let set = r.set, set > a, set <= b { out.append(SunEvent(kind: .sunset, date: dateFromMs(set))) }
            n += 1
        }
        out.sort { $0.date < $1.date }
        var deduped: [SunEvent] = []
        for ev in out where deduped.last.map({ $0.kind != ev.kind || abs($0.date.timeIntervalSince(ev.date)) >= 1 }) ?? true {
            deduped.append(ev)
        }
        return deduped
    }
}
