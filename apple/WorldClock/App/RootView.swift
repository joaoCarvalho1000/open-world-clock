import SwiftUI
import WorldClockCore

/// Tabs (Clocks / Planner / Map) plus the app-wide sheets.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        @Bindable var model = model
        tabs
            // Rebuild localized text when the language changes (L10n is not observable).
            .id(model.settings.language)
            .tint(Color(Palette.accent(dark: scheme == .dark)))
            .overlay(alignment: .top) {
                // Persistent container so the toast's insertion/removal transition animates.
                VStack { toast }
                    .animation(Motion.animation(.snappy, reduce: reduceMotion), value: toastText)
            }
            // A success tap on every copy (the toast, or the converter's hint line), also a second copy while "Copied"
            // is still showing; never when the flash clears.
            .sensoryFeedback(.success, trigger: model.flashCount)
            .sheet(item: $model.sheet) { sheet in
                switch sheet {
                case .settings:
                    SettingsView()
                case .addCity:
                    AddCitySheet()
                case .rename(let zone):
                    RenameSheet(zone: zone, current: model.settings.labels[zone] ?? "")
                        .presentationDetents([.medium, .large])
                case .hours(let zone):
                    WorkingHoursEditor(zone: zone, hours: model.hours(for: zone))
                        .presentationDetents([.large])
                }
            }
    }

    /// "Copied" outside convert mode (the converter shows it in its own hint line).
    private var toastText: String? { model.conversion == nil ? model.flash : nil }

    @ViewBuilder
    private var toast: some View {
        if let text = toastText {
            Label(text, systemImage: "checkmark.circle.fill")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .panelBackground(Capsule(), shadowOpacity: 0.15, shadowRadius: 12, shadowY: 4)
                .padding(.top, 8)
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                .allowsHitTesting(false)
                .accessibilityHidden(true)   // announced by AppModel.copyTimes (say.copied)
        }
    }

    @ViewBuilder
    private var tabs: some View {
        @Bindable var model = model
        if #available(iOS 18.0, *) {
            TabView(selection: $model.tab) {
                Tab(L10n.tr("tab.clocks"), systemImage: "clock", value: AppTab.clocks) {
                    ClockListScreen()
                }
                Tab(L10n.tr("tab.planner"), systemImage: "calendar.day.timeline.left", value: AppTab.planner) {
                    PlannerScreen()
                }
                Tab(L10n.tr("tab.map"), systemImage: "globe.europe.africa", value: AppTab.map) {
                    WorldMapScreen()
                }
            }
        } else {
            TabView(selection: $model.tab) {
                ClockListScreen()
                    .tabItem { Label(L10n.tr("tab.clocks"), systemImage: "clock") }
                    .tag(AppTab.clocks)
                PlannerScreen()
                    .tabItem { Label(L10n.tr("tab.planner"), systemImage: "calendar.day.timeline.left") }
                    .tag(AppTab.planner)
                WorldMapScreen()
                    .tabItem { Label(L10n.tr("tab.map"), systemImage: "globe.europe.africa") }
                    .tag(AppTab.map)
            }
        }
    }
}
