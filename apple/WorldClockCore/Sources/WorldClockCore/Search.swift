import Foundation

public struct SearchResult: Hashable, Sendable {
    public enum Kind: Hashable, Sendable { case text, abbreviation, offset(minutes: Int) }
    public var zones: [String]
    public var kind: Kind
    public init(zones: [String], kind: Kind) {
        self.zones = zones
        self.kind = kind
    }
}

/// Port of app.js searchZones + parseOffsetQuery.
public enum Search {
    /// Exact JS semantics (CASE-SENSITIVE): "+3", "-5", "utc+5:30", "gmt-3", "utc", "−3" (U+2212).
    /// A lone "z" is NOT an offset (it starts Zurich, Zagreb...). `search()` folds case first, so "UTC+5:30" works there.
    public static func parseOffsetQuery(_ query: String) -> Int? {
        var scalars: [Unicode.Scalar] = []
        for u in query.unicodeScalars where !ParseTime.isJSWhitespace(u) {
            scalars.append(u == "\u{2212}" ? "-" : u)
        }
        let s = String(String.UnicodeScalarView(scalars))
        if s == "utc" || s == "gmt" { return 0 }
        var body = Substring(s)
        if body.hasPrefix("utc") || body.hasPrefix("gmt") { body = body.dropFirst(3) }
        guard let signChar = body.first, signChar == "+" || signChar == "-" else { return nil }
        let r = Array(body.dropFirst().unicodeScalars)
        func isDigit(_ i: Int) -> Bool { i < r.count && r[i].value >= 48 && r[i].value <= 57 }
        func num(_ a: Int, _ b: Int) -> Int { r[a..<b].reduce(0) { $0 * 10 + Int($1.value) - 48 } }
        var lead = 0
        while lead < 2 && isDigit(lead) { lead += 1 }
        if lead == 0 { return nil }
        for hourLen in stride(from: lead, through: 1, by: -1) {
            let rem = r.count - hourLen
            var minutes: Int?? = nil // .some(nil) = matched without minutes
            if rem == 0 {
                minutes = .some(nil)
            } else if rem == 3, r[hourLen] == ":", isDigit(hourLen + 1), isDigit(hourLen + 2) {
                minutes = .some(num(hourLen + 1, hourLen + 3))
            } else if rem == 2, isDigit(hourLen), isDigit(hourLen + 1) {
                minutes = .some(num(hourLen, hourLen + 2))
            }
            guard let matched = minutes else { continue }
            let h = num(0, hourLen)
            if h > 14 { return nil }
            if let m = matched, m >= 60 { return nil }
            return (signChar == "-" ? -1 : 1) * (h * 60 + (matched ?? 0))
        }
        return nil
    }

    private static func localeCompare(_ a: String, _ b: String) -> ComparisonResult {
        let r = a.compare(b, options: [.caseInsensitive, .diacriticInsensitive])
        return r == .orderedSame ? a.compare(b) : r
    }

    /// app.js fold: case- and accent-insensitive form for matching (NFD, combining marks U+0300...U+036F removed,
    /// lower-cased): "São" -> "sao", "Zúrich" -> "zurich".
    public static func fold(_ text: String) -> String {
        var out = String.UnicodeScalarView()
        for u in text.decomposedStringWithCanonicalMapping.unicodeScalars where !(0x300...0x36F).contains(u.value) {
            out.append(u)
        }
        return String(out).lowercased()
    }

    /// Port of app.js searchZones. `language` selects the localized city (ZONE_I18N) and country names that are
    /// matched next to the English ones and used for tie ordering (.auto is resolved like the UI language).
    public static func search(_ query: String, excluding: Set<String> = [], labels: [String: String] = [:],
                              now: Date = Date(), limit: Int = 10, language: AppLanguage = .en,
                              catalog: ZoneCatalog = .shared) -> SearchResult {
        let q = fold(query.trimmingCharacters(in: .whitespacesAndNewlines))
        if q.isEmpty || limit <= 0 { return SearchResult(zones: [], kind: .text) }
        let lang = AppLanguage.resolve(language)
        let pool = catalog.searchPool
        let cityOf = { (z: String) in catalog.cityName(of: z, language: lang) }

        if let off = parseOffsetQuery(q) {
            let hits = pool.enumerated()
                .filter { !excluding.contains($0.element) && TimeMath.offsetMinutes($0.element, at: now) == off }
                .sorted { a, b in
                    let ca = catalog.meta[a.element] == nil ? 1 : 0, cb = catalog.meta[b.element] == nil ? 1 : 0
                    if ca != cb { return ca < cb }
                    let c = localeCompare(cityOf(a.element), cityOf(b.element))
                    if c != .orderedSame { return c == .orderedAscending }
                    return a.offset < b.offset
                }
                .prefix(limit).map { $0.element }
            return SearchResult(zones: Array(hits), kind: .offset(minutes: off))
        }

        let abbr = (catalog.abbreviations[q] ?? []).filter { catalog.isValid($0) && !excluding.contains($0) }
        let abbrSet = Set(abbr)
        struct Scored { var zone: String; var score: Int; var index: Int }
        var scored: [Scored] = abbr.enumerated().map { Scored(zone: $0.element, score: -1, index: $0.offset) }
        for (i, z) in pool.enumerated() {
            if excluding.contains(z) { continue }
            let m = catalog.meta[z]
            let city = fold(cityOf(z)), en = fold(catalog.cityName(of: z))
            let label = fold(labels[z]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "")
            let extra = m.map { $0.country + " " + ($0.alias ?? "") } ?? ""
            let hay = fold("\(z) \(city) \(en) \(label) \(catalog.country(of: z, language: lang)) \(extra)")
                .replacingOccurrences(of: "_", with: " ")
            var score = -1
            if city.hasPrefix(q) || en.hasPrefix(q) || (!label.isEmpty && label.hasPrefix(q)) { score = 0 }
            else if city.contains(q) || en.contains(q) || (!label.isEmpty && label.contains(q)) { score = 1 }
            else if hay.contains(q) { score = m != nil ? 2 : 3 }
            if score >= 0 && !abbrSet.contains(z) { scored.append(Scored(zone: z, score: score, index: abbr.count + i)) }
        }
        scored.sort { a, b in
            if a.score != b.score { return a.score < b.score }
            if a.score >= 0 {
                let c = localeCompare(cityOf(a.zone), cityOf(b.zone))
                if c != .orderedSame { return c == .orderedAscending }
            }
            return a.index < b.index
        }
        let zones = scored.prefix(limit).map { $0.zone }
        return SearchResult(zones: Array(zones), kind: abbr.isEmpty ? .text : .abbreviation)
    }
}
