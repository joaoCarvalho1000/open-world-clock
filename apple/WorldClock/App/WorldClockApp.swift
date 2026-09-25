import Combine
import SwiftUI
import TipKit
import WorldClockCore

@main
struct WorldClockApp: App {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // TipKit keeps its state in a local datastore inside the app container: no network, no telemetry.
        try? Tips.configure([.displayFrequency(.immediate)])
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(\.locale, model.locale)
                .preferredColorScheme(model.preferredColorScheme)
                .onOpenURL { url in
                    if let link = DeepLink(url: url) { model.handle(link) }
                }
                .onChange(of: scenePhase) { _, phase in
                    // Widgets can change settings (the "+1 h" shift); pick them up on return.
                    if phase == .active { model.reloadFromStore() }
                }
                .onReceive(NotificationCenter.default.publisher(for: .NSSystemTimeZoneDidChange)
                    .debounce(for: .milliseconds(300), scheduler: RunLoop.main)) { _ in
                    model.refreshHomeZone()
                }
        }
    }
}
