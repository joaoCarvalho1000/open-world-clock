import SwiftUI
import WidgetKit

/// Widget extension entry point.
/// - `CityClockWidget`: one city (Home Screen small, StandBy, Lock Screen circular and inline).
/// - `WorldClocksWidget`: several cities (Home Screen medium and large, Lock Screen rectangular).
@main
struct WorldClockWidgetsBundle: WidgetBundle {
    var body: some Widget {
        CityClockWidget()
        WorldClocksWidget()
    }
}

enum WidgetKinds {
    static let cityClock = "io.joao.worldclock.city"
    static let worldClocks = "io.joao.worldclock.cities"
}

struct CityClockWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: WidgetKinds.cityClock, intent: SelectCityIntent.self, provider: CityClockProvider()) { entry in
            CityClockEntryView(entry: entry)
        }
        .configurationDisplayName(Text("City Clock", tableName: "Widgets"))
        .description(Text("The time in one city, under its own sky.", tableName: "Widgets"))
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryInline])
    }
}

struct WorldClocksWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: WidgetKinds.worldClocks, intent: SelectCitiesIntent.self, provider: WorldClocksProvider()) { entry in
            WorldClocksEntryView(entry: entry)
        }
        .configurationDisplayName(Text("World Clocks", tableName: "Widgets"))
        .description(Text("Your cities side by side, with a one-hour look ahead.", tableName: "Widgets"))
        .supportedFamilies([.systemMedium, .systemLarge, .accessoryRectangular])
        // Rows draw their own day/night surfaces, so the widget pads itself with `widgetContentMargins`.
        .contentMarginsDisabled()
    }
}
