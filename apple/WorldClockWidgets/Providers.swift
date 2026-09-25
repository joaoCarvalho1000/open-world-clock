import AppIntents
import WidgetKit
import WorldClockCore

/// Single-city widget: systemSmall (also StandBy), accessoryCircular, accessoryInline.
struct CityClockProvider: AppIntentTimelineProvider {
    typealias Entry = ClockEntry
    typealias Intent = SelectCityIntent

    func placeholder(in context: Context) -> ClockEntry {
        WidgetData.sample(zones: ["Asia/Tokyo"], limit: 1)
    }

    func snapshot(for configuration: SelectCityIntent, in context: Context) async -> ClockEntry {
        WidgetData.single(configured: configuration.zones, limit: 1)
    }

    func timeline(for configuration: SelectCityIntent, in context: Context) async -> Timeline<ClockEntry> {
        WidgetData.timeline(configured: configuration.zones, limit: 1)
    }
}

/// Multi-city widget: systemMedium (4), systemLarge (6), accessoryRectangular (3).
struct WorldClocksProvider: AppIntentTimelineProvider {
    typealias Entry = ClockEntry
    typealias Intent = SelectCitiesIntent

    static func limit(for family: WidgetFamily) -> Int {
        switch family {
        case .systemLarge, .systemExtraLarge: return 6
        case .accessoryRectangular: return 3
        default: return 4
        }
    }

    func placeholder(in context: Context) -> ClockEntry {
        WidgetData.sample(limit: Self.limit(for: context.family))
    }

    func snapshot(for configuration: SelectCitiesIntent, in context: Context) async -> ClockEntry {
        WidgetData.single(configured: configuration.zones, limit: Self.limit(for: context.family))
    }

    func timeline(for configuration: SelectCitiesIntent, in context: Context) async -> Timeline<ClockEntry> {
        WidgetData.timeline(configured: configuration.zones, limit: Self.limit(for: context.family))
    }
}
