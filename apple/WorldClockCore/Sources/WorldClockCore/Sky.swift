import Foundation

/// sRGB color, components 0...1.
public struct RGBA: Hashable, Sendable, Codable {
    public var r: Double
    public var g: Double
    public var b: Double
    public var a: Double
    public init(r: Double, g: Double, b: Double, a: Double = 1) {
        self.r = r
        self.g = g
        self.b = b
        self.a = a
    }
}

/// Exactly the 6 phases of src/renderer/motion/sky.js.
public enum SkyPhase: String, CaseIterable, Sendable { case night, twilight, dawn, day, golden, dusk }

/// Card gradient by sun altitude (port of motion/sky.js phaseOf; colours from motion/sky.css).
/// oklch values were converted to sRGB (gamut-clipped, 4 decimals) with the standard OKLab -> linear sRGB
/// matrices and the sRGB transfer function; each constant lists its CSS source.
public enum Sky {
    /// motion/sky.js phaseOf with a known instant and coordinates. `night` = !Sun.isDay (app.js is-night).
    public static func phase(at date: Date, coordinate: Coordinate) -> SkyPhase {
        let ms = epochMs(date)
        let alt = Sun.altitude(ms: ms, lat: coordinate.lat, lng: coordinate.lng)
        let rising = Sun.altitude(ms: ms + 600_000, lat: coordinate.lat, lng: coordinate.lng) > alt
        let night = !(alt > -0.833)
        if night {
            if alt < -12 { return .night }
            if alt < -4 || rising { return .twilight }
            return .dusk
        }
        if rising { return alt <= 6 ? .dawn : .day }
        return alt <= 10 ? .golden : .day
    }

    /// Coordinates from ZoneCatalog.shared; without coordinates, sky.js phaseFromKey on the clock-hour phase
    /// with app.js's fallback night test (hour < 6 || hour >= 20).
    public static func phase(zone: String, at date: Date) -> SkyPhase {
        if let c = ZoneCatalog.shared.coordinate(of: zone) { return phase(at: date, coordinate: c) }
        let hour = TimeMath.wallClock(zone, at: date).hour
        return phaseFromKey(TimeMath.phaseOf(hour: hour), night: hour < 6 || hour >= 20)
    }

    /// sky.js phaseFromKey.
    static func phaseFromKey(_ key: Phase, night: Bool) -> SkyPhase {
        switch key {
        case .night: return .night
        case .dawn: return night ? .twilight : .dawn
        case .dusk: return night ? .dusk : .golden
        case .golden: return night ? .dusk : .golden
        default: return night ? .night : .day
        }
    }

    /// "a" = top of card (sky), "b" = bottom (horizon).
    public static func gradient(_ phase: SkyPhase, dark: Bool) -> (top: RGBA, bottom: RGBA) {
        switch (phase, dark) {
        // light theme (:root)
        case (.day, false): return (RGBA(r: 0.9165, g: 0.9737, b: 1.0000, a: 0.9),   // oklch(0.972 0.02 236 / 0.9)
                                    RGBA(r: 0.9749, g: 0.9953, b: 1.0000, a: 0.9))   // oklch(0.993 0.006 220 / 0.9)
        case (.dawn, false): return (RGBA(r: 0.8984, g: 0.9605, b: 1.0000, a: 0.9),  // oklch(0.962 0.024 242 / 0.9)
                                     RGBA(r: 1.0000, g: 0.9261, b: 0.8602, a: 0.9))  // oklch(0.958 0.034 58 / 0.9)
        case (.golden, false): return (RGBA(r: 1.0000, g: 0.9308, b: 0.8404, a: 0.9), // oklch(0.958 0.038 70 / 0.9)
                                       RGBA(r: 1.0000, g: 0.8933, b: 0.8930, a: 0.9)) // oklch(0.945 0.036 18 / 0.9)
        case (.twilight, false): return (RGBA(r: 0.1062, g: 0.1415, b: 0.2651, a: 0.96), // oklch(0.27 0.06 270 / 0.96)
                                         RGBA(r: 0.2228, g: 0.1763, b: 0.3333, a: 0.96)) // oklch(0.33 0.07 296 / 0.96)
        case (.dusk, false): return (RGBA(r: 0.1516, g: 0.1502, b: 0.2921, a: 0.96),  // oklch(0.29 0.065 282 / 0.96)
                                     RGBA(r: 0.2890, g: 0.1628, b: 0.3088, a: 0.96))  // oklch(0.34 0.075 322 / 0.96)
        case (.night, false): return (RGBA(r: 0.0566, g: 0.1003, b: 0.1947, a: 0.96), // oklch(0.22 0.05 264 / 0.96)
                                      RGBA(r: 0.0901, g: 0.1608, b: 0.2653, a: 0.96)) // oklch(0.28 0.055 258 / 0.96)
        // dark theme (:root[data-theme="dark"])
        case (.day, true): return (RGBA(r: 0.1681, g: 0.2931, b: 0.4007, a: 0.94),    // oklch(0.40 0.06 246 / 0.94)
                                   RGBA(r: 0.1470, g: 0.2305, b: 0.3238, a: 0.94))    // oklch(0.345 0.05 252 / 0.94)
        case (.dawn, true): return (RGBA(r: 0.1719, g: 0.2565, b: 0.3513, a: 0.94),   // oklch(0.37 0.05 252 / 0.94)
                                    RGBA(r: 0.3722, g: 0.2472, b: 0.1830, a: 0.94))   // oklch(0.40 0.052 48 / 0.94)
        case (.golden, true): return (RGBA(r: 0.3693, g: 0.2523, b: 0.1468, a: 0.94), // oklch(0.40 0.058 62 / 0.94)
                                      RGBA(r: 0.3523, g: 0.1907, b: 0.2020, a: 0.94)) // oklch(0.365 0.06 16 / 0.94)
        case (.twilight, true): return (RGBA(r: 0.0519, g: 0.0809, b: 0.1660, a: 0.95), // oklch(0.20 0.045 268 / 0.95)
                                        RGBA(r: 0.1488, g: 0.1150, b: 0.2428, a: 0.95)) // oklch(0.26 0.06 294 / 0.95)
        case (.dusk, true): return (RGBA(r: 0.0877, g: 0.0911, b: 0.1927, a: 0.95),   // oklch(0.22 0.05 280 / 0.95)
                                    RGBA(r: 0.2168, g: 0.1112, b: 0.2408, a: 0.95))   // oklch(0.28 0.068 320 / 0.95)
        case (.night, true): return (RGBA(r: 0.0199, g: 0.0403, b: 0.1012, a: 0.95),  // oklch(0.15 0.035 266 / 0.95)
                                     RGBA(r: 0.0427, g: 0.0858, b: 0.1569, a: 0.95))  // oklch(0.20 0.04 260 / 0.95)
        }
    }

    /// Dark-family stops (light text in the light theme): night, twilight, dusk.
    public static func isNightSurface(_ phase: SkyPhase) -> Bool {
        switch phase {
        case .night, .twilight, .dusk: return true
        case .dawn, .day, .golden: return false
        }
    }
}

/// style.css colour tokens (light :root and dark :root[data-theme="dark"]), converted from oklch to sRGB.
public enum Palette {
    /// --bg-solid: pale blue / deep navy page background.
    public static func canvas(dark: Bool) -> RGBA {
        dark ? RGBA(r: 0.0721, g: 0.1125, b: 0.1870, a: 1)   // oklch(0.23 0.04 262)
             : RGBA(r: 0.9468, g: 0.9712, b: 0.9931, a: 1)   // oklch(0.975 0.01 245)
    }
    /// --accent: single system-blue accent (home + converted).
    public static func accent(dark: Bool) -> RGBA {
        dark ? RGBA(r: 0.3503, g: 0.6649, b: 0.9741, a: 1)   // oklch(0.72 0.14 250)
             : RGBA(r: 0.0000, g: 0.4653, b: 0.9262, a: 1)   // oklch(0.58 0.2 255)
    }
    /// --day card background.
    public static func dayCard(dark: Bool) -> RGBA {
        dark ? RGBA(r: 0.1681, g: 0.2441, b: 0.3415, a: 0.94)  // oklch(0.36 0.05 255 / 0.94)
             : RGBA(r: 0.9846, g: 0.9954, b: 1.0000, a: 0.88)  // oklch(0.995 0.004 240 / 0.88)
    }
    /// --night card background.
    public static func nightCard(dark: Bool) -> RGBA {
        dark ? RGBA(r: 0.0274, g: 0.0568, b: 0.1282, a: 0.95)  // oklch(0.17 0.04 265 / 0.95)
             : RGBA(r: 0.1062, g: 0.1664, b: 0.2865, a: 0.95)  // oklch(0.29 0.06 263 / 0.95)
    }
    /// --day-fg.
    public static func dayText(dark: Bool) -> RGBA {
        dark ? RGBA(r: 0.9691, g: 0.9822, b: 0.9964, a: 1)   // oklch(0.985 0.006 250)
             : RGBA(r: 0.0609, g: 0.0965, b: 0.1491, a: 1)   // oklch(0.21 0.03 258)
    }
    /// --night-fg.
    public static func nightText(dark: Bool) -> RGBA {
        dark ? RGBA(r: 0.9160, g: 0.9377, b: 0.9611, a: 1)   // oklch(0.95 0.01 250)
             : RGBA(r: 0.9691, g: 0.9822, b: 0.9964, a: 1)   // oklch(0.985 0.006 250)
    }
    /// --night-fg-2 on night surfaces, --day-fg-2 otherwise.
    public static func secondaryText(night: Bool, dark: Bool) -> RGBA {
        switch (night, dark) {
        case (false, false): return RGBA(r: 0.3091, g: 0.3489, b: 0.4005, a: 1)  // oklch(0.46 0.025 255)
        case (false, true): return RGBA(r: 0.7677, g: 0.8120, b: 0.8633, a: 1)   // oklch(0.85 0.022 252)
        case (true, false): return RGBA(r: 0.7373, g: 0.7874, b: 0.8453, a: 1)   // oklch(0.83 0.025 252)
        case (true, true): return RGBA(r: 0.6336, g: 0.6884, b: 0.7516, a: 1)    // oklch(0.75 0.028 252)
        }
    }
}
