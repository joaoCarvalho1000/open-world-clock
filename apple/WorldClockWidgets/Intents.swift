import AppIntents
import Foundation
import WidgetKit
import WorldClockCore

// Intent titles, descriptions and parameter names live in the DEFAULT string table (apple/Shared/Localizable.xcstrings,
// generated from shared/strings-native.json "widget.*" keys): the App Intents metadata step always resolves the default
// table, while custom tables are not reliably picked up for the configuration UI and Shortcuts.

// MARK: - City entity

/// A city the widget can show. `id` is the IANA zone ("Asia/Tokyo").
struct CityEntity: AppEntity, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let detail: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: LocalizedStringResource("widget.intent.city", defaultValue: "City"))
    }

    static var defaultQuery: CityQuery { CityQuery() }

    var displayRepresentation: DisplayRepresentation {
        // stringLiteral: city names and labels are data, never localization keys.
        DisplayRepresentation(title: LocalizedStringResource(stringLiteral: name),
                              subtitle: LocalizedStringResource(stringLiteral: detail))
    }

    /// Builds an entity with the user's custom label (if any, else the localized city name) and
    /// "Country · UTC+9" as subtitle, names in the app language (`language` is resolved here).
    static func make(zone: String, labels: [String: String], language: AppLanguage, now: Date = Date()) -> CityEntity {
        let catalog = ZoneCatalog.shared
        let lang = AppLanguage.resolve(language)
        let custom = labels[zone] ?? ""
        let name = custom.isEmpty ? catalog.cityName(of: zone, language: lang) : custom
        let utc = TimeMath.utcLabel(zone, at: now)
        let country = catalog.country(of: zone, language: lang)
        let detail = country.isEmpty ? utc : "\(country) · \(utc)"
        return CityEntity(id: zone, name: name, detail: detail)
    }
}

struct CityQuery: EntityStringQuery {
    init() {}

    func entities(for identifiers: [CityEntity.ID]) async throws -> [CityEntity] {
        let settings = SettingsStore.shared.load()
        let catalog = ZoneCatalog.shared
        return identifiers.filter { catalog.isValid($0) }
            .map { CityEntity.make(zone: $0, labels: settings.labels, language: settings.language) }
    }

    func entities(matching string: String) async throws -> [CityEntity] {
        let settings = SettingsStore.shared.load()
        let query = string.trimmingCharacters(in: .whitespacesAndNewlines)
        if query.isEmpty { return Self.userCities(settings) }
        let result = Search.search(query, labels: settings.labels, limit: 25, language: settings.language)
        return result.zones.map { CityEntity.make(zone: $0, labels: settings.labels, language: settings.language) }
    }

    func suggestedEntities() async throws -> [CityEntity] {
        Self.userCities(SettingsStore.shared.load())
    }

    static func userCities(_ settings: AppSettings) -> [CityEntity] {
        WidgetData.userZones(settings, home: DeviceZone.current())
            .map { CityEntity.make(zone: $0, labels: settings.labels, language: settings.language) }
    }
}

// MARK: - Configuration intents

/// Configuration for the multi-city widget. Empty selection = the list the app shows (device zone first, then saved cities).
struct SelectCitiesIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource {
        LocalizedStringResource("widget.intent.selectCities", defaultValue: "Select Cities")
    }
    static var description: IntentDescription {
        IntentDescription(LocalizedStringResource("widget.intent.selectCitiesDesc",
                                                  defaultValue: "Choose up to six cities. Leave empty to use your list."))
    }

    /// Per-family limits match what each layout draws (WorldClocksProvider.limit(for:)).
    @Parameter(title: LocalizedStringResource("widget.intent.cities", defaultValue: "Cities"),
               size: [.systemMedium: 4, .systemLarge: 6, .accessoryRectangular: 3])
    var cities: [CityEntity]?

    init() {}

    init(cities: [CityEntity]) {
        self.cities = cities
    }

    var zones: [String] { (cities ?? []).map(\.id) }
}

/// Configuration for the single-city widget. Empty selection = the first city of the app's list (the device zone
/// unless it is saved, then the first saved city).
struct SelectCityIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource {
        LocalizedStringResource("widget.intent.selectCity", defaultValue: "Select City")
    }
    static var description: IntentDescription {
        IntentDescription(LocalizedStringResource("widget.intent.selectCityDesc", defaultValue: "Choose the city to show."))
    }

    @Parameter(title: LocalizedStringResource("widget.intent.city", defaultValue: "City"))
    var city: CityEntity?

    init() {}

    init(city: CityEntity) {
        self.city = city
    }

    var zones: [String] { city.map { [$0.id] } ?? [] }
}

// MARK: - Interactive shift

/// "+1 h" / "Now" buttons on the medium and large widgets.
/// Runs inside the widget extension (`openAppWhenRun == false`); WidgetKit reloads the timeline afterwards.
/// If this intent ever needs to open the app, it must also be compiled into the app target.
struct ShiftTimeIntent: AppIntent {
    static var title: LocalizedStringResource {
        LocalizedStringResource("widget.intent.shift", defaultValue: "Shift Time")
    }
    static var description: IntentDescription {
        IntentDescription(LocalizedStringResource("widget.intent.shiftDesc",
                                                  defaultValue: "Shows your cities an hour ahead, or back to now."))
    }
    static var openAppWhenRun: Bool { false }
    static var isDiscoverable: Bool { false }

    /// Minutes to add to the current shift; 0 resets to now.
    @Parameter(title: LocalizedStringResource("widget.intent.minutes", defaultValue: "Minutes"), default: 60)
    var minutes: Int

    init() {}

    init(minutes: Int) {
        self.minutes = minutes
    }

    func perform() async throws -> some IntentResult {
        let step = minutes
        let now = Date()
        _ = SettingsStore.shared.update { settings in
            if step == 0 {
                settings.widgetShiftMinutes = 0
                settings.widgetShiftExpires = nil
            } else {
                var next = settings.effectiveShift(at: now) + step
                // One day ahead wraps back to now, so repeated taps cycle instead of piling up.
                if next >= 24 * 60 || next <= -24 * 60 { next = 0 }
                settings.widgetShiftMinutes = next
                settings.widgetShiftExpires = next == 0 ? nil : now.addingTimeInterval(60 * 60)
            }
        }
        // The pressed widget reloads by itself; this also refreshes the other Open World Clock widgets.
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
