import Foundation

public enum ThemeSetting: String, Codable, CaseIterable, Sendable { case system, light, dark }

/// Settings shared by the app and widgets through the App Group (validation mirrors src/main.js VALIDATE).
public struct AppSettings: Codable, Hashable, Sendable {
    /// Ordered; zones[0] is NOT special; "home" = device zone.
    public var zones: [String]
    /// Custom labels (trimmed, 1...40 chars).
    public var labels: [String: String]
    public var hours: [String: WorkingHours]
    public var hour12: Bool
    public var showSeconds: Bool
    public var theme: ThemeSetting
    public var language: AppLanguage
    /// 0 normally; +60 per "+1 h" widget button press.
    public var widgetShiftMinutes: Int
    /// The shift auto-resets after this instant.
    public var widgetShiftExpires: Date?

    public init(zones: [String] = ZoneCatalog.defaultZones, labels: [String: String] = [:], hours: [String: WorkingHours] = [:],
                hour12: Bool = false, showSeconds: Bool = false, theme: ThemeSetting = .system, language: AppLanguage = .auto,
                widgetShiftMinutes: Int = 0, widgetShiftExpires: Date? = nil) {
        self.zones = zones
        self.labels = labels
        self.hours = hours
        self.hour12 = hour12
        self.showSeconds = showSeconds
        self.theme = theme
        self.language = language
        self.widgetShiftMinutes = widgetShiftMinutes
        self.widgetShiftExpires = widgetShiftExpires
    }

    public static let `default` = AppSettings()

    private enum CodingKeys: String, CodingKey {
        case zones, labels, hours, hour12, showSeconds, theme, language, widgetShiftMinutes, widgetShiftExpires
    }

    /// Tolerant: missing or malformed keys -> defaults; invalid zones, labels and hours dropped individually.
    public init(from decoder: Decoder) throws {
        let d = AppSettings.default
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else {
            self = d
            return
        }
        zones = (try? c.decodeIfPresent([String].self, forKey: .zones)) ?? d.zones
        var labels: [String: String] = [:]
        if let lc = try? c.nestedContainer(keyedBy: AnyCodingKey.self, forKey: .labels) {
            for k in lc.allKeys { if let s = try? lc.decode(String.self, forKey: k) { labels[k.stringValue] = s } }
        }
        self.labels = labels
        var hours: [String: WorkingHours] = [:]
        if let hc = try? c.nestedContainer(keyedBy: AnyCodingKey.self, forKey: .hours) {
            for k in hc.allKeys { if let h = try? hc.decode(WorkingHours.self, forKey: k) { hours[k.stringValue] = h } }
        }
        self.hours = hours
        hour12 = (try? c.decodeIfPresent(Bool.self, forKey: .hour12)) ?? d.hour12
        showSeconds = (try? c.decodeIfPresent(Bool.self, forKey: .showSeconds)) ?? d.showSeconds
        theme = (try? c.decodeIfPresent(ThemeSetting.self, forKey: .theme)) ?? d.theme
        language = (try? c.decodeIfPresent(AppLanguage.self, forKey: .language)) ?? d.language
        widgetShiftMinutes = (try? c.decodeIfPresent(Int.self, forKey: .widgetShiftMinutes)) ?? d.widgetShiftMinutes
        widgetShiftExpires = (try? c.decodeIfPresent(Date.self, forKey: .widgetShiftExpires)) ?? nil
        self = sanitized()
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(zones, forKey: .zones)
        try c.encode(labels, forKey: .labels)
        try c.encode(hours, forKey: .hours)
        try c.encode(hour12, forKey: .hour12)
        try c.encode(showSeconds, forKey: .showSeconds)
        try c.encode(theme, forKey: .theme)
        try c.encode(language, forKey: .language)
        try c.encode(widgetShiftMinutes, forKey: .widgetShiftMinutes)
        try c.encodeIfPresent(widgetShiftExpires, forKey: .widgetShiftExpires)
    }

    /// Drops invalid/duplicate zones, invalid labels (trimmed, 1...40 chars, valid zone keys) and invalid hours.
    /// Legacy ids (e.g. "Asia/Tel_Aviv") are migrated to their canonical zone ("Asia/Jerusalem") like app.js does on
    /// boot; labels and hours saved under a legacy id move with it unless the canonical id already has its own.
    public func sanitized(catalog: ZoneCatalog = .shared) -> AppSettings {
        var out = self
        var seen = Set<String>()
        out.zones = zones.map { catalog.canonical($0) }.filter { catalog.isValid($0) && seen.insert($0).inserted }
        let legacyLast = { (k: String) in catalog.canonical(k) == k ? 0 : 1 } // canonical keys win over legacy ones
        var labels: [String: String] = [:]
        for (k, v) in self.labels.sorted(by: { legacyLast($0.key) < legacyLast($1.key) }) {
            let key = catalog.canonical(k)
            guard catalog.isValid(key), labels[key] == nil else { continue }
            let t = v.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty && t.count <= 40 { labels[key] = t }
        }
        out.labels = labels
        var hours: [String: WorkingHours] = [:]
        for (k, h) in self.hours.sorted(by: { legacyLast($0.key) < legacyLast($1.key) }) {
            let key = catalog.canonical(k)
            guard catalog.isValid(key), hours[key] == nil else { continue }
            let clean = WorkingHours(start: h.start, end: h.end, days: h.days)
            if clean.isValid { hours[key] = clean }
        }
        out.hours = hours
        return out
    }

    /// widgetShiftMinutes if not expired (no expiry = never expires), else 0.
    public func effectiveShift(at now: Date) -> Int {
        if let exp = widgetShiftExpires, now >= exp { return 0 }
        return widgetShiftMinutes
    }
}

/// JSON-encoded AppSettings in UserDefaults (the App Group suite in the app and widgets).
public final class SettingsStore: @unchecked Sendable {
    public static let appGroupID = "group.io.joao.worldclock.shared"
    public static let storageKey = "settings.v1"
    public static let shared = SettingsStore(defaults: UserDefaults(suiteName: appGroupID) ?? .standard)

    private let defaults: UserDefaults
    private let lock = NSLock()

    public init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    private static func decoder() -> JSONDecoder { JSONDecoder() }
    private static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }

    /// Default when missing or corrupt.
    public func load() -> AppSettings {
        lock.lock()
        defer { lock.unlock() }
        return loadUnlocked()
    }

    private func loadUnlocked() -> AppSettings {
        let data: Data?
        if let d = defaults.data(forKey: Self.storageKey) {
            data = d
        } else if let s = defaults.string(forKey: Self.storageKey) {
            data = s.data(using: .utf8)
        } else {
            data = nil
        }
        guard let data, let s = try? Self.decoder().decode(AppSettings.self, from: data) else { return .default }
        return s
    }

    public func save(_ settings: AppSettings) {
        lock.lock()
        defer { lock.unlock() }
        saveUnlocked(settings)
    }

    private func saveUnlocked(_ settings: AppSettings) {
        guard let data = try? Self.encoder().encode(settings) else { return }
        defaults.set(data, forKey: Self.storageKey)
    }

    /// Load, mutate, sanitize, save, return.
    @discardableResult
    public func update(_ change: (inout AppSettings) -> Void) -> AppSettings {
        lock.lock()
        defer { lock.unlock() }
        var s = loadUnlocked()
        change(&s)
        s = s.sanitized()
        saveUnlocked(s)
        return s
    }
}
