import Foundation
import WorldClockCore

/// UI strings for the app and the widget extension (compiled into both targets).
///
/// Lookup order (CORE_API.md "Localization helper"):
/// 1. the `.lproj` bundle of `AppLanguage.resolve(language)` inside `Bundle.main`,
/// 2. `Bundle.main` itself (system language resolution),
/// 3. the key.
/// The result is filled with `Template.fill` (i18n.js `{name}` placeholders).
enum L10n {
    /// The language picked in settings. `.auto` follows the system languages.
    static var language: AppLanguage {
        get { L10nStorage.shared.language }
        set { L10nStorage.shared.language = newValue }
    }

    /// `language` resolved to a concrete language (never `.auto`).
    static var resolvedLanguage: AppLanguage { AppLanguage.resolve(language) }

    /// Locale used for every date/time format. When the device language is the app language, the device region
    /// is kept ("en_GB": "Tue 22 Sep", day-first pickers; "pt_PT", "es_MX"); otherwise the app language's default
    /// ("en-US", "pt-BR", "es-419"). Built from an identifier, never `Locale.current` itself, so the user's 24 h
    /// override and calendar keywords do not leak into the fixed "hmma" / "HHmm" templates and the app's own 12/24 h
    /// setting keeps working. `AppLanguage.localeIdentifier` (core) is unchanged: golden tests and
    /// `accessibilityLanguage` use it.
    static var locale: Locale { locale(for: resolvedLanguage) }

    /// `locale` with an injected device locale (tests).
    static func locale(current: Locale) -> Locale { locale(for: resolvedLanguage, current: current) }

    static func locale(for language: AppLanguage, current: Locale = .current) -> Locale {
        let lang = AppLanguage.resolve(language)
        // Resolved cases are never .auto, so the raw value is the language code ("en", "pt", "es").
        if let code = current.language.languageCode?.identifier.lowercased(), code == lang.rawValue,
           let region = current.region?.identifier, !region.isEmpty {
            return Locale(identifier: "\(code)_\(region)")
        }
        return Locale(identifier: lang.localeIdentifier)
    }

    static func tr(_ key: String, _ vars: [String: String] = [:]) -> String {
        let template = L10nStorage.shared.lookup(key, lprojName: resolvedLanguage.lprojName)
        return vars.isEmpty ? template : Template.fill(template, vars)
    }
}

/// Thread-safe storage behind `L10n` (widgets render off the main thread).
private final class L10nStorage: @unchecked Sendable {
    static let shared = L10nStorage()

    /// Returned by `localizedString` when the key is missing (never a real translation).
    private static let missing = "\u{1F}wc.missing\u{1F}"
    private static let table = "Localizable"

    private let lock = NSLock()
    private var storedLanguage: AppLanguage = .auto
    private var bundles: [String: Bundle] = [:]
    private var absent: Set<String> = []

    var language: AppLanguage {
        get { lock.withLock { storedLanguage } }
        set { lock.withLock { storedLanguage = newValue } }
    }

    func lookup(_ key: String, lprojName: String?) -> String {
        if let name = lprojName, let bundle = bundle(named: name) {
            let value = bundle.localizedString(forKey: key, value: Self.missing, table: Self.table)
            if value != Self.missing { return value }
        }
        let value = Bundle.main.localizedString(forKey: key, value: Self.missing, table: Self.table)
        return value == Self.missing ? key : value
    }

    private func bundle(named name: String) -> Bundle? {
        lock.lock()
        defer { lock.unlock() }
        if let cached = bundles[name] { return cached }
        if absent.contains(name) { return nil }
        guard let path = Bundle.main.path(forResource: name, ofType: "lproj"), let found = Bundle(path: path) else {
            absent.insert(name)
            return nil
        }
        bundles[name] = found
        return found
    }
}
