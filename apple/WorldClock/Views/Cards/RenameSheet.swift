import SwiftUI
import WorldClockCore

/// Custom label for a city (1...40 characters; empty resets to the city name).
struct RenameSheet: View {
    let zone: String

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool
    @State private var text: String

    private static let maxLength = 40

    init(zone: String, current: String) {
        self.zone = zone
        _text = State(initialValue: current)
    }

    var body: some View {
        let city = model.cityName(zone)
        NavigationStack {
            Form {
                Section {
                    TextField(city, text: $text)
                        .focused($focused)
                        .submitLabel(.done)
                        .autocorrectionDisabled()
                        .onSubmit(save)
                        .onChange(of: text) { _, value in
                            if value.count > Self.maxLength { text = String(value.prefix(Self.maxLength)) }
                        }
                        .accessibilityLabel(L10n.tr("card.renameAria", ["city": city]))
                } footer: {
                    Text(L10n.tr("rename.hint"))
                }
            }
            .navigationTitle(Self.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.tr("hours.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.tr("hours.save"), action: save)
                }
            }
            .task { focused = true }
        }
    }

    private func save() {
        model.rename(zone, to: text)
        dismiss()
    }

    /// "Rename…" without the trailing ellipsis.
    private static var title: String {
        let text = L10n.tr("menu.rename")
        return text.hasSuffix("…") ? String(text.dropLast()) : text
    }
}
