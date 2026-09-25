import SwiftUI
import WorldClockCore

/// Per-city working hours: start/end (24 h), working weekdays. CONTRACT.md rules:
/// start != end, end < start allowed (overnight), 1...7 days.
struct WorkingHoursEditor: View {
    let zone: String

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var start: Date
    @State private var end: Date
    @State private var days: Set<Int>

    /// Monday first (app.js DAY_ORDER).
    private static let dayOrder = [1, 2, 3, 4, 5, 6, 0]

    init(zone: String, hours: WorkingHours) {
        self.zone = zone
        _start = State(initialValue: Self.date(minutes: hours.startMinutes))
        _end = State(initialValue: Self.date(minutes: hours.endMinutes))
        _days = State(initialValue: Set(hours.days))
    }

    var body: some View {
        let startMinutes = Self.minutes(of: start)
        let endMinutes = Self.minutes(of: end)
        let sameTimes = startMinutes == endMinutes
        let noDays = days.isEmpty

        NavigationStack {
            Form {
                Section {
                    DatePicker(L10n.tr("hours.start"), selection: $start, displayedComponents: .hourAndMinute)
                    DatePicker(L10n.tr("hours.end"), selection: $end, displayedComponents: .hourAndMinute)
                } footer: {
                    if sameTimes {
                        Text(L10n.tr("hours.invalid")).foregroundStyle(.red)
                    } else if endMinutes < startMinutes {
                        Text(L10n.tr("hours.overnight"))
                    }
                }
                .environment(\.timeZone, .gmt)
                .environment(\.locale, Self.locale24h)

                Section {
                    ForEach(Self.dayOrder, id: \.self) { weekday in
                        Toggle(Self.weekdayName(weekday), isOn: binding(for: weekday))
                    }
                } header: {
                    Text(L10n.tr("hours.days"))
                } footer: {
                    if noDays { Text(L10n.tr("hours.noDays")).foregroundStyle(.red) }
                }

                Section {
                    Button(L10n.tr("hours.reset"), role: .destructive) {
                        model.setHours(nil, for: zone)
                        dismiss()
                    }
                }
            }
            .navigationTitle(L10n.tr("hours.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text(L10n.tr("hours.title")).font(.headline)
                        Text(model.label(zone)).font(.caption).foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(L10n.tr("hours.aria", ["city": model.label(zone)]))
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.tr("hours.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.tr("hours.save")) { save(startMinutes: startMinutes, endMinutes: endMinutes) }
                        .disabled(sameTimes || noDays)
                }
            }
            // The red footers appear silently and Save just dims: announce why.
            .onChange(of: sameTimes) { _, invalid in
                if invalid { model.announce(L10n.tr("hours.invalid")) }
            }
            .onChange(of: noDays) { _, empty in
                if empty { model.announce(L10n.tr("hours.noDays")) }
            }
        }
    }

    private func binding(for weekday: Int) -> Binding<Bool> {
        Binding(
            get: { days.contains(weekday) },
            set: { on in if on { days.insert(weekday) } else { days.remove(weekday) } })
    }

    private func save(startMinutes: Int, endMinutes: Int) {
        let hours = WorkingHours(start: Self.hhmm(startMinutes), end: Self.hhmm(endMinutes), days: days.sorted())
        guard hours.isValid else { return }
        model.setHours(hours, for: zone)
        dismiss()
    }

    // MARK: Helpers

    /// Time-of-day as a Date on 2001-01-01 UTC (pickers run in a UTC environment).
    private static func date(minutes: Int) -> Date {
        Date(timeIntervalSinceReferenceDate: TimeInterval(minutes * 60))
    }

    private static func minutes(of date: Date) -> Int {
        let parts = Calendar.gregorianUTC.dateComponents([.hour, .minute], from: date)
        return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
    }

    private static func hhmm(_ minutes: Int) -> String {
        let h = (minutes / 60) % 24, m = minutes % 60
        return (h < 10 ? "0" : "") + String(h) + ":" + (m < 10 ? "0" : "") + String(m)
    }

    /// A locale of the app language whose default clock is 24 h (working hours are always edited in 24 h).
    private static var locale24h: Locale {
        switch L10n.resolvedLanguage {
        case .pt: return Locale(identifier: "pt_BR")
        case .es: return Locale(identifier: "es_ES")
        default: return Locale(identifier: "en_GB")
        }
    }

    private static func weekdayName(_ weekday: Int) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = L10n.locale
        let names = calendar.standaloneWeekdaySymbols
        guard names.indices.contains(weekday) else { return String(weekday) }
        let name = names[weekday]
        return name.prefix(1).uppercased(with: L10n.locale) + name.dropFirst()
    }
}
