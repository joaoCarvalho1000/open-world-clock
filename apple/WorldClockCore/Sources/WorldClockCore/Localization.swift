import Foundation

/// Port of the placeholder fill in i18n.js t(key, vars).
public enum Template {
    /// Replaces {name} placeholders (name = [A-Za-z0-9_]+); unknown placeholders are left as-is.
    public static func fill(_ template: String, _ vars: [String: String]) -> String {
        if vars.isEmpty || !template.contains("{") { return template }
        let s = Array(template.unicodeScalars)
        var out = String.UnicodeScalarView()
        var i = 0
        func isWord(_ c: Unicode.Scalar) -> Bool {
            switch c.value {
            case 48...57, 65...90, 97...122, 95: return true
            default: return false
            }
        }
        while i < s.count {
            if s[i] == "{" {
                var j = i + 1
                while j < s.count && isWord(s[j]) { j += 1 }
                if j > i + 1 && j < s.count && s[j] == "}" {
                    let name = String(String.UnicodeScalarView(s[(i + 1)..<j]))
                    if let v = vars[name] {
                        out.append(contentsOf: v.unicodeScalars)
                    } else {
                        out.append(contentsOf: s[i...j])
                    }
                    i = j + 1
                    continue
                }
            }
            out.append(s[i])
            i += 1
        }
        return String(out)
    }
}

/// UI language setting (i18n.js resolve / LOCALES).
public enum AppLanguage: String, Codable, CaseIterable, Sendable {
    case auto, en, pt, es

    /// nil for auto, "en", "pt-BR", "es".
    public var lprojName: String? {
        switch self {
        case .auto: return nil
        case .en: return "en"
        case .pt: return "pt-BR"
        case .es: return "es"
        }
    }

    /// Never .auto: explicit languages pass through; auto follows the FIRST preferred language the app speaks
    /// (pt* -> pt, es* -> es, en* -> en, others skipped; none -> en), like src/main.js systemLanguage over the
    /// system's preferred-languages list (so ["fr-FR", "pt-BR"] resolves to pt, not en).
    public static func resolve(_ lang: AppLanguage, preferred: [String] = Locale.preferredLanguages) -> AppLanguage {
        if lang != .auto { return lang }
        for p in preferred {
            let s = p.lowercased()
            if s.hasPrefix("pt") { return .pt }
            if s.hasPrefix("es") { return .es }
            if s.hasPrefix("en") { return .en }
        }
        return .en
    }

    /// "en-US", "pt-BR", "es-419" (resolved; Spanish is neutral Latin American).
    public var localeIdentifier: String {
        switch AppLanguage.resolve(self) {
        case .pt: return "pt-BR"
        case .es: return "es-419"
        default: return "en-US"
        }
    }
}
