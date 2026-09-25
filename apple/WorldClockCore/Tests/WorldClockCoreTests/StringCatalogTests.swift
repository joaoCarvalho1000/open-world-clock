import Foundation
import XCTest

// Guards the iPhone String Catalogs against keys the app uses but the catalog lacks. L10n.tr returns the key itself
// when it is missing, so a missing key shows up on screen as raw text ("convertTip.title") instead of failing a build.
// Reads the repo files directly (not package resources), so it skips when the package is built outside the repo.
final class StringCatalogTests: XCTestCase {
    private static let fixHint = "Add the strings to shared/strings-native.json (native-only) or src/renderer/i18n.js, then run "
        + "node scripts/export-shared.mjs, then node scripts/export-xcstrings.mjs"

    /// This file lives in apple/WorldClockCore/Tests/WorldClockCoreTests.
    private static var repoRoot: URL {
        let file: String = #filePath
        return URL(fileURLWithPath: file.replacingOccurrences(of: "\\", with: "/"))
            .deletingLastPathComponent()   // Tests/WorldClockCoreTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // WorldClockCore
            .deletingLastPathComponent()   // apple
            .deletingLastPathComponent()   // repo root
    }

    private var root: URL { Self.repoRoot }
    private var catalogURL: URL { root.appendingPathComponent("apple/Shared/Localizable.xcstrings") }
    private var widgetCatalogURL: URL { root.appendingPathComponent("apple/WorldClockWidgets/Widgets.xcstrings") }
    private var nativeURL: URL { root.appendingPathComponent("shared/strings-native.json") }

    private func requireRepo() throws {
        guard FileManager.default.fileExists(atPath: catalogURL.path) else {
            throw XCTSkip("apple/Shared/Localizable.xcstrings not found next to the package (package built outside the repo)")
        }
    }

    private func loadObject(_ url: URL) throws -> [String: Any] {
        let data = try Data(contentsOf: url)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any], url.lastPathComponent)
    }

    /// Catalog key -> catalog language ("en", "pt-BR", "es") -> value.
    private func catalogValues(_ url: URL) throws -> [String: [String: String]] {
        let strings = try XCTUnwrap(try loadObject(url)["strings"] as? [String: Any], "\(url.lastPathComponent): no strings")
        var out: [String: [String: String]] = [:]
        for (key, entry) in strings {
            var values: [String: String] = [:]
            let localizations = (entry as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            for (lang, loc) in localizations {
                let unit = (loc as? [String: Any])?["stringUnit"] as? [String: Any]
                if let value = unit?["value"] as? String { values[lang] = value }
            }
            out[key] = values
        }
        return out
    }

    /// Swift files under `dir`, skipping Tests, .build, hidden folders and generated Xcode projects. A plain recursive
    /// walk: DirectoryEnumerator.skipDescendants() skips too much on Windows Foundation.
    private func swiftFiles(under dir: URL) -> [URL] {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: dir.path) else { return [] }
        var out: [URL] = []
        for name in names.sorted() {
            let url = dir.appendingPathComponent(name)
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: url.path, isDirectory: &isDir) else { continue }
            if isDir.boolValue {
                if name == "Tests" || name.hasPrefix(".") || name.hasSuffix(".xcodeproj") { continue }
                out += swiftFiles(under: url)
            } else if name.hasSuffix(".swift") {
                out.append(url)
            }
        }
        return out
    }

    /// {name} placeholder names, the same syntax Template.fill replaces ([A-Za-z0-9_]+).
    private func placeholders(_ text: String) -> Set<String> {
        guard let re = try? NSRegularExpression(pattern: "\\{([A-Za-z0-9_]+)\\}") else { return [] }
        let ns = text as NSString
        return Set(re.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range(at: 1)) })
    }

    /// Every key of every language in shared/strings-native.json is in Localizable.xcstrings with en, pt-BR and es
    /// values whose {placeholders} match the English value.
    func testNativeStringsAreInCatalog() throws {
        try requireRepo()
        let catalog = try catalogValues(catalogURL)
        let native = try XCTUnwrap(try loadObject(nativeURL)["strings"] as? [String: [String: Any]], "strings-native.json: no strings")
        let nativeKeys = Set(native.values.flatMap { $0.keys })
        XCTAssertGreaterThan(nativeKeys.count, 30, "strings-native.json looks empty")

        var missing: [String] = []
        var incomplete: [String] = []
        var mismatched: [String] = []
        for key in nativeKeys.sorted() {
            guard let values = catalog[key] else { missing.append(key); continue }
            guard let en = values["en"] else { incomplete.append("\(key) (en)"); continue }
            let want = placeholders(en)
            for lang in ["pt-BR", "es"] {
                guard let value = values[lang] else { incomplete.append("\(key) (\(lang))"); continue }
                if placeholders(value) != want { mismatched.append("\(key) (\(lang))") }
            }
        }
        XCTAssertTrue(missing.isEmpty, "Localizable.xcstrings is missing \(missing.count) native key(s): "
            + missing.joined(separator: ", ") + ". " + Self.fixHint)
        XCTAssertTrue(incomplete.isEmpty, "Localizable.xcstrings has native keys without a translation: "
            + incomplete.joined(separator: ", ") + ". " + Self.fixHint)
        XCTAssertTrue(mismatched.isEmpty, "Placeholders differ from the English value: " + mismatched.joined(separator: ", "))
    }

    /// Every literal key passed to L10n.tr("...") or LocalizedStringResource("...") in apple/**/*.swift exists in
    /// Localizable.xcstrings or Widgets.xcstrings. Keys built at runtime are skipped: a literal followed by `+`
    /// ("plan.state." + state.rawValue, "opt.theme." + theme.rawValue) or containing a \( interpolation. The known
    /// dynamic families are checked explicitly below.
    func testLiteralKeysInSwiftExistInCatalogs() throws {
        try requireRepo()
        var known = Set(try catalogValues(catalogURL).keys)
        if FileManager.default.fileExists(atPath: widgetCatalogURL.path) {
            known.formUnion(try catalogValues(widgetCatalogURL).keys)
        }

        let apple = root.appendingPathComponent("apple")
        let re = try NSRegularExpression(pattern: #"(?:L10n\.tr|LocalizedStringResource)\(\s*"((?:[^"\\\n]|\\.)*)"\s*[,)]"#)
        var used: [String: String] = [:]   // key -> first file that uses it
        let files = swiftFiles(under: apple)
        for url in files {
            guard let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let name = url.lastPathComponent
            let ns = text as NSString
            for match in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
                let key = ns.substring(with: match.range(at: 1))
                if key.contains("\\(") { continue }
                if used[key] == nil { used[key] = name }
            }
        }
        XCTAssertGreaterThan(files.count, 20, "found only \(files.count) Swift files under \(apple.path)")
        XCTAssertGreaterThan(used.count, 100, "found only \(used.count) literal keys; the pattern no longer matches the code")

        let dynamic = ["plan.state.work", "plan.state.night", "plan.state.off",
                       "opt.theme.system", "opt.theme.light", "opt.theme.dark"]
        for key in dynamic where used[key] == nil { used[key] = "(dynamic key)" }

        let missing = used.keys.filter { !known.contains($0) }.sorted()
        XCTAssertTrue(missing.isEmpty, "\(missing.count) key(s) used in Swift are not in Localizable.xcstrings or Widgets.xcstrings: "
            + missing.map { "\($0) [\(used[$0] ?? "")]" }.joined(separator: ", ") + ". " + Self.fixHint)
    }
}
