import SwiftUI
import WorldClockCore

/// Settings: 12/24 h, seconds, theme, language, how to add the widgets, privacy, about. Every change is saved to the
/// App Group store through the model (widgets reload).
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// Read by ClockListScreen. App-only (standard defaults, not the App Group store): widgets do not use it.
    @AppStorage("compactCards") private var compactCards = false

    var body: some View {
        NavigationStack {
            Form {
                Section(L10n.tr("panel.display")) {
                    Toggle(L10n.tr("opt.hour24"), isOn: Binding(
                        get: { !model.settings.hour12 },
                        set: { model.setHour12(!$0) }))
                    Toggle(L10n.tr("opt.seconds"), isOn: Binding(
                        get: { model.settings.showSeconds },
                        set: { model.setShowSeconds($0) }))
                    Toggle(L10n.tr("settings.compactCards"), isOn: $compactCards)
                    Picker(L10n.tr("opt.theme"), selection: Binding(
                        get: { model.settings.theme },
                        set: { model.setTheme($0) })) {
                        ForEach(ThemeSetting.allCases, id: \.self) { theme in
                            Text(L10n.tr("opt.theme." + theme.rawValue)).tag(theme)
                        }
                    }
                    Picker(L10n.tr("opt.language"), selection: Binding(
                        get: { model.settings.language },
                        set: { model.setLanguage($0) })) {
                        ForEach(AppLanguage.allCases, id: \.self) { language in
                            Text(Self.languageName(language)).tag(language)
                        }
                    }
                }

                Section(L10n.tr("settings.widgetsTitle")) {
                    Text(L10n.tr("settings.widgets"))
                }

                Section(L10n.tr("settings.privacyTitle")) {
                    Label {
                        Text(L10n.tr("settings.privacy"))
                    } icon: {
                        Image(systemName: "lock.shield")
                    }
                    // App Review 5.1.1(i): the privacy policy is reachable from inside the app. Opens Safari; nothing is sent.
                    Link(destination: Self.privacyURL) {
                        Label(L10n.tr("settings.privacyPolicy"), systemImage: "hand.raised")
                    }
                }

                Section(L10n.tr("settings.about")) {
                    LabeledContent(L10n.tr("app.title"), value: L10n.tr("settings.version", ["v": Self.version]))
                    Text(L10n.tr("about.text"))
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(L10n.tr("panel.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.tr("common.done")) { dismiss() }
                }
            }
        }
    }

    /// Same page as the App Store Connect Privacy Policy URL.
    private static let privacyURL = URL(string: "https://openworldclock.com/privacy")!

    /// Language names are shown in their own language (like most iOS pickers).
    private static func languageName(_ language: AppLanguage) -> String {
        switch language {
        case .auto: return L10n.tr("opt.language.auto")
        case .en: return "English"
        case .pt: return "Português"
        case .es: return "Español"
        }
    }

    private static var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String
        return build.map { "\(short) (\($0))" } ?? short
    }
}
