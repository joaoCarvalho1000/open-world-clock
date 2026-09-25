import Foundation

/// Curated city metadata for a zone (src/renderer/zones.js ZONE_META).
public struct ZoneMeta: Codable, Hashable, Sendable {
    public var city: String
    public var country: String
    public var alias: String?
    public var lat: Double?
    public var lng: Double?
    public init(city: String, country: String, alias: String? = nil, lat: Double? = nil, lng: Double? = nil) {
        self.city = city
        self.country = country
        self.alias = alias
        self.lat = lat
        self.lng = lng
    }
}

/// Zone metadata loaded from shared/zones.json (bundled resource `zones.json`).
public final class ZoneCatalog: @unchecked Sendable {
    /// Bundle.module "zones.json"; fatalError only if the resource is missing.
    public static let shared: ZoneCatalog = {
        guard let url = Bundle.module.url(forResource: "zones", withExtension: "json"),
              let data = try? Data(contentsOf: url) else {
            fatalError("WorldClockCore: zones.json resource is missing (run node apple/WorldClockCore/sync-resources.mjs)")
        }
        do { return try ZoneCatalog(jsonData: data) } catch {
            fatalError("WorldClockCore: zones.json is invalid: \(error)")
        }
    }()

    /// ['Europe/Lisbon','America/New_York','America/Los_Angeles','Europe/London','Asia/Singapore'] (src/main.js DEFAULTS).
    public static let defaultZones: [String] = ["Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Singapore"]

    /// First-run city list (CONTRACT.md first run, Windows app.js): `defaultZones` minus every default that shows the
    /// same time all year as the home zone or an earlier default (`TimeMath.uniqueClocks` with home first, so home wins
    /// its group). Keeps the `defaultZones` order and does not add home: the app shows the device zone implicitly.
    /// São Paulo -> Lisbon, New York, Los Angeles, Singapore; London -> New York, Los Angeles, London, Singapore.
    public static func firstRunZones(home: String, at date: Date) -> [String] {
        let keep = Set(TimeMath.uniqueClocks([home] + defaultZones.filter { $0 != home }, at: date))
        return defaultZones.filter(keep.contains)
    }

    /// Curated ZONE_META.
    public let meta: [String: ZoneMeta]
    /// Lower-case abbreviation -> zones (app.js ABBR), first = most common meaning.
    public let abbreviations: [String: [String]]
    /// Legacy IANA id -> canonical id used in ZONE_META (app.js LEGACY, e.g. "Asia/Tel_Aviv" -> "Asia/Jerusalem").
    public let legacy: [String: String]
    /// ZONE_COORDS: approximate principal-city coordinates for every zone.
    let coords: [String: Coordinate]
    /// ZONE_CC: zone -> ISO 3166 country code.
    let countryCodes: [String: String]
    /// ZONE_I18N: language ("pt", "es") -> zone -> localized city name (en uses the ZONE_META city).
    let cityNames: [String: [String: String]]
    /// Language -> ISO code -> short country name (Intl.DisplayNames output captured by scripts/export-shared.mjs).
    let countryNames: [String: [String: String]]

    private let lock = NSLock()
    private var allIDsCache: [String]?
    private var searchPoolCache: [String]?

    /// Used only when an older zones.json has no "legacy" table.
    static let fallbackLegacy: [String: String] = [
        "Europe/Kiev": "Europe/Kyiv", "Asia/Calcutta": "Asia/Kolkata", "Asia/Saigon": "Asia/Ho_Chi_Minh",
        "America/Buenos_Aires": "America/Argentina/Buenos_Aires", "Asia/Rangoon": "Asia/Yangon", "Asia/Katmandu": "Asia/Kathmandu",
        "Asia/Tel_Aviv": "Asia/Jerusalem",
    ]

    public init(jsonData: Data) throws {
        let root = try JSONDecoder().decode(JSONValue.self, from: jsonData)
        guard let obj = root.object else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "zones.json: top level is not an object"))
        }
        var meta: [String: ZoneMeta] = [:]
        for (zone, v) in (obj["meta"] ?? obj["ZONE_META"])?.object ?? [:] {
            guard let city = v["city"]?.string else { continue }
            meta[zone] = ZoneMeta(city: city, country: v["country"]?.string ?? "", alias: v["alias"]?.string,
                                  lat: v["lat"]?.double, lng: v["lng"]?.double)
        }
        var coords: [String: Coordinate] = [:]
        for (zone, v) in (obj["coords"] ?? obj["ZONE_COORDS"])?.object ?? [:] {
            if let a = v.array, a.count == 2, let lat = a[0].double, let lng = a[1].double {
                coords[zone] = Coordinate(lat: lat, lng: lng)
            } else if let lat = v["lat"]?.double, let lng = v["lng"]?.double {
                coords[zone] = Coordinate(lat: lat, lng: lng)
            }
        }
        var abbr: [String: [String]] = [:]
        for (k, v) in (obj["abbreviations"] ?? obj["abbr"] ?? obj["ABBR"])?.object ?? [:] {
            abbr[k.lowercased()] = (v.array ?? []).compactMap { $0.string }
        }
        func stringMap(_ v: JSONValue?) -> [String: String] {
            var out: [String: String] = [:]
            for (k, s) in v?.object ?? [:] { if let s = s.string { out[k] = s } }
            return out
        }
        func nestedMap(_ v: JSONValue?) -> [String: [String: String]] {
            var out: [String: [String: String]] = [:]
            for (k, inner) in v?.object ?? [:] { out[k] = stringMap(inner) }
            return out
        }
        let legacy = stringMap(obj["legacy"])
        self.meta = meta
        self.coords = coords
        self.abbreviations = abbr
        self.legacy = legacy.isEmpty ? Self.fallbackLegacy : legacy
        self.countryCodes = stringMap(obj["countryCodes"])
        self.cityNames = nestedMap(obj["cityNames"])
        self.countryNames = nestedMap(obj["countryNames"])
    }

    /// Every id valid for Foundation TimeZone on this OS (meta ∪ coords ∪ knownTimeZoneIdentifiers), sorted.
    public var allZoneIDs: [String] {
        lock.lock()
        defer { lock.unlock() }
        if let c = allIDsCache { return c }
        var set = Set(meta.keys)
        set.formUnion(coords.keys)
        set.formUnion(TimeZone.knownTimeZoneIdentifiers)
        let ids = set.filter { TimeMath.timeZone($0) != nil }.sorted()
        allIDsCache = ids
        return ids
    }

    /// app.js canonical: a legacy id maps to its canonical zone; everything else is returned unchanged.
    public func canonical(_ zone: String) -> String { legacy[zone] ?? zone }

    private static let regionPrefixes = ["Africa/", "America/", "Antarctica/", "Arctic/", "Asia/", "Atlantic/",
                                         "Australia/", "Europe/", "Indian/", "Pacific/"]

    /// Zones offered by search (app.js ALL_ZONES): IANA region ids plus curated/coordinate ids, legacy ids replaced
    /// by their canonical names (a legacy id is never offered itself), no Etc/ ids, sorted.
    var searchPool: [String] {
        lock.lock()
        if let c = searchPoolCache { lock.unlock(); return c }
        lock.unlock()
        var out = Set<String>()
        for id in allZoneIDs {
            let z = canonical(id)
            if z.hasPrefix("Etc/") || !isValid(z) { continue }
            let curated = meta[z] != nil || coords[z] != nil
            if curated || Self.regionPrefixes.contains(where: { z.hasPrefix($0) }) { out.insert(z) }
        }
        let pool = out.sorted()
        lock.lock()
        searchPoolCache = pool
        lock.unlock()
        return pool
    }

    public func isValid(_ zone: String) -> Bool {
        !zone.isEmpty && zone.count < 64 && TimeMath.timeZone(zone) != nil
    }

    /// Meta lat/lng, else ZONE_COORDS.
    public func coordinate(of zone: String) -> Coordinate? {
        if let m = meta[zone], let lat = m.lat, let lng = m.lng, lat.isFinite, lng.isFinite {
            return Coordinate(lat: lat, lng: lng)
        }
        return coords[zone]
    }

    /// English name (app.js englishCity): meta city, else last path component with "_" -> " " ("UTC" -> "UTC").
    public func cityName(of zone: String) -> String {
        if let m = meta[zone] { return m.city }
        let last = zone.split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? zone
        return last.replacingOccurrences(of: "_", with: " ")
    }

    /// app.js cityOf: the ZONE_I18N name in `language` (.auto is resolved), else the English `cityName(of:)`.
    public func cityName(of zone: String, language: AppLanguage) -> String {
        cityNames[AppLanguage.resolve(language).rawValue]?[zone] ?? cityName(of: zone)
    }

    /// ISO 3166 code of the zone's country (ZONE_CC), if known.
    public func countryCode(of zone: String) -> String? { countryCodes[zone] }

    /// Meta country; otherwise the region (first path component, "_" -> " ") for "Region/City" ids, else nil.
    /// English ZONE_META wording; for what the Windows app shows use `country(of:language:)`.
    public func country(of zone: String) -> String? {
        if let m = meta[zone] { return m.country }
        guard zone.contains("/"), let first = zone.split(separator: "/").first else { return nil }
        return String(first).replacingOccurrences(of: "_", with: " ")
    }

    /// app.js regionOf: the short localized country name of the zone's ZONE_CC code (Intl.DisplayNames, captured in
    /// zones.json), else the ZONE_META country, else the IANA area ("Europe/Simferopol" -> "Europe").
    public func country(of zone: String, language: AppLanguage) -> String {
        if let cc = countryCodes[zone], let name = countryNames[AppLanguage.resolve(language).rawValue]?[cc], !name.isEmpty {
            return name
        }
        if let m = meta[zone] { return m.country }
        let first = zone.split(separator: "/", omittingEmptySubsequences: false).first.map(String.init) ?? zone
        return first.replacingOccurrences(of: "_", with: " ")
    }

    /// Custom label (trimmed) if non-empty, else cityName.
    public func displayName(of zone: String, labels: [String: String]) -> String {
        if let l = labels[zone]?.trimmingCharacters(in: .whitespacesAndNewlines), !l.isEmpty { return l }
        return cityName(of: zone)
    }
}
