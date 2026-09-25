import SwiftUI
import WorldClockCore

/// Add-city sheet: `.searchable` over `Search.search` (city, country, abbreviation, "+3" / "UTC-5"),
/// curated suggestions while the query is empty.
struct AddCitySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var query = ""
    @State private var searching = false

    var body: some View {
        NavigationStack {
            TimelineView(.everyMinute) { timeline in
                list(now: timeline.date)
            }
            .navigationTitle(L10n.tr("search.aria"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, isPresented: $searching,
                        placement: .navigationBarDrawer(displayMode: .always),
                        prompt: Text(L10n.tr("search.prompt")))
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .onSubmit(of: .search) {
                if let first = results(now: .now).zones.first { add(first) }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.tr("hours.cancel")) { dismiss() }
                }
            }
            .task { searching = true }
        }
    }

    // MARK: Content

    @ViewBuilder
    private func list(now: Date) -> some View {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            List {
                Section(L10n.tr("search.suggested")) {
                    ForEach(suggestions, id: \.self) { zone in row(zone, now: now) }
                }
            }
        } else {
            let result = results(now: now)
            if result.zones.isEmpty {
                ContentUnavailableView {
                    Label(L10n.tr("search.noResults"), systemImage: "magnifyingglass")
                } description: {
                    Text(L10n.tr("search.noResultsSub"))
                }
            } else {
                List {
                    Section {
                        ForEach(result.zones, id: \.self) { zone in row(zone, now: now) }
                    } header: {
                        if let note = note(for: result.kind, query: trimmed) { Text(note) }
                    }
                }
            }
        }
    }

    private func row(_ zone: String, now: Date) -> some View {
        let name = model.label(zone)
        let country = model.country(zone)
        let time = WCFormat.timeText(zone, at: now, hour12: model.hour12)
        let offset = WCFormat.relativeLabel(zone, at: now, localZone: model.homeZone)
        return Button {
            add(zone)
        } label: {
            // Accessibility sizes: stack time/offset under the name instead of two cramped columns.
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                : AnyLayout(HStackLayout(spacing: 12))
            layout {
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(.body).foregroundStyle(.primary)
                    Text(country).font(.subheadline).foregroundStyle(.secondary)
                }
                if !typeSize.isAccessibilitySize { Spacer(minLength: 8) }
                VStack(alignment: typeSize.isAccessibilitySize ? .leading : .trailing, spacing: 2) {
                    Text(time).font(.body).monospacedDigit().foregroundStyle(.primary)
                    Text(offset).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                        .accessibilityLabel(WCFormat.spokenRelative(zone, at: now, localZone: model.homeZone))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .combine)
        .accessibilityInputLabels([Text(verbatim: name)])
    }

    // MARK: Data

    private func results(now: Date) -> SearchResult {
        Search.search(query, excluding: Set(model.settings.zones), labels: model.settings.labels, now: now, limit: 30,
                      language: model.settings.language)
    }

    /// Curated cities not in the list yet, by localized city name (device zone first when it is not saved).
    private var suggestions: [String] {
        let saved = Set(model.settings.zones)
        let catalog = ZoneCatalog.shared
        var zones = catalog.meta.keys
            .filter { !saved.contains($0) && catalog.isValid($0) }
            .sorted { model.cityName($0).localizedStandardCompare(model.cityName($1)) == .orderedAscending }
        if !saved.contains(model.homeZone), let index = zones.firstIndex(of: model.homeZone) {
            zones.remove(at: index)
            zones.insert(model.homeZone, at: 0)
        }
        return zones
    }

    private func note(for kind: SearchResult.Kind, query: String) -> String? {
        switch kind {
        case .offset(let minutes):
            return L10n.tr("search.offsetNote", ["offset": TimeMath.formatOffset(minutes)])
        case .abbreviation:
            return L10n.tr("search.abbrNote", ["abbr": query.uppercased()])
        case .text:
            return nil
        }
    }

    private func add(_ zone: String) {
        withAnimation(Motion.animation(.smooth, reduce: reduceMotion)) { model.addZone(zone) }
        dismiss()
    }
}
