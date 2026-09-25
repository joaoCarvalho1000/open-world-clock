import SwiftUI
import TipKit
import WorldClockCore

/// First-run tip above the cards: tapping a card is how the converter opens. `AppModel.startConverting`
/// invalidates it, so it stays gone once the user has converted a time (TipKit remembers it across launches).
struct ConvertTip: Tip {
    var title: Text { Text(verbatim: L10n.tr("convertTip.title")) }
    var message: Text? { Text(verbatim: L10n.tr("convertTip.message")) }
}

/// Home screen: the city cards, the converter panel when converting, add/edit/settings in the toolbar.
struct ClockListScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var editMode: EditMode = .inactive
    /// Mirrors ConvertTip's TipKit status, so a closed or used tip leaves no empty row behind.
    @State private var showsConvertTip = false
    /// Settings > Display > Compact cards: the converter's compact row all the time. Per device, not synced to widgets.
    @AppStorage("compactCards") private var compactCards = false

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                TimelineView(.everyMinute) { timeline in
                    cardList(now: timeline.date)
                }
                // Converting shrinks every row to its compact form: keep the source row on screen (minimal scroll, no
                // anchor). Back to Now (nil) scrolls nothing, so the full cards return where they are.
                .onChange(of: model.conversion?.zone) { _, zone in
                    guard let zone else { return }
                    withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) { proxy.scrollTo(zone) }
                }
                // A widget tap (AppModel.focusZone): scroll to that city. onAppear covers a cold launch from a widget
                // and a first visit to this tab; there the List rows may not be laid out yet, so it scrolls again
                // after a short delay (a no-op when the first scroll already landed).
                .onChange(of: model.focusZone) { _, zone in scrollToFocus(zone, proxy: proxy) }
                .onAppear {
                    let zone = model.focusZone
                    scrollToFocus(zone, proxy: proxy)
                    guard zone != nil else { return }
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(120))
                        guard model.focusZone == zone else { return }
                        scrollToFocus(zone, proxy: proxy)
                    }
                }
                .task(id: model.focusZone) { await clearFocusLater() }
            }
            .background(CanvasBackground())
            .navigationTitle(L10n.tr("app.title"))
            .toolbar { toolbarContent }
            .environment(\.editMode, $editMode)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if model.conversion != nil {
                    ConverterPanel()
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(Motion.animation(.snappy, reduce: reduceMotion), value: model.conversion == nil)
            // A light tap when a city is added, removed or reordered.
            .sensoryFeedback(.impact(weight: .light), trigger: model.settings.zones)
            .task {
                for await shouldDisplay in ConvertTip().shouldDisplayUpdates { showsConvertTip = shouldDisplay }
            }
        }
    }

    // MARK: Widget focus

    private func scrollToFocus(_ zone: String?, proxy: ScrollViewProxy) {
        guard let zone else { return }
        withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) { proxy.scrollTo(zone, anchor: .center) }
    }

    /// The focused card keeps the accent outline for 1.2 s, then AppModel.focusZone goes back to nil.
    private func clearFocusLater() async {
        guard let zone = model.focusZone else { return }
        try? await Task.sleep(for: .seconds(1.2))
        // Also runs when the task is cancelled because the tab went away, so coming back later does not outline the
        // city again. When another city arrived instead, focusZone already holds it and stays.
        guard model.focusZone == zone else { return }
        withAnimation(Motion.animation(.smooth, reduce: reduceMotion)) { model.focusZone = nil }
    }

    // MARK: List

    private func cardList(now: Date) -> some View {
        let context = CardContext(
            instant: model.conversion?.instant ?? now,
            converting: model.conversion != nil,
            refZone: model.conversion?.zone ?? model.homeZone,
            homeZone: model.homeZone,
            hour12: model.hour12,
            showSeconds: model.settings.showSeconds,
            compactCards: compactCards)
        return List {
            if showsConvertTip && !model.settings.zones.isEmpty && model.conversion == nil && !editMode.isEditing {
                TipView(ConvertTip())
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .moveDisabled(true)
                    .deleteDisabled(true)
            }
            if model.showsImplicitHome {
                row(model.homeZone, context: context, saved: false)
                    .id(model.homeZone)   // scroll target, like the ForEach rows below (id = zone)
                    .moveDisabled(true)
                    .deleteDisabled(true)
            }
            ForEach(model.settings.zones, id: \.self) { zone in
                row(zone, context: context, saved: true)
            }
            .onMove { source, destination in
                withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) {
                    model.moveZones(fromOffsets: source, toOffset: destination)
                }
            }
            if model.settings.zones.isEmpty {
                emptyState
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .animation(Motion.animation(.smooth, reduce: reduceMotion), value: model.displayZones)
    }

    private func row(_ zone: String, context: CardContext, saved: Bool) -> some View {
        let label = model.label(zone)
        let hours = model.hours(for: zone)
        let summary = WCFormat.accessibilitySummary(zone: zone, name: label, at: context.instant, hour12: context.hour12,
                                                    refZone: context.refZone, homeZone: context.homeZone, hours: hours,
                                                    asleep: context.converting && TimeMath.isLikelyAsleep(zone, at: context.instant))
        let sun = WCFormat.sunText(zone, at: context.instant, hour12: context.hour12)
        let clockChange = ClockChangeCache.note(zone, at: context.instant)
            .map { WCFormat.clockChangeDetail($0, zone: zone, hour12: context.hour12) }
        let hint = [clockChange, sun, L10n.tr("card.convertHint")].compactMap { $0 }.joined(separator: ". ")
        let isSource = context.converting && zone == context.refZone
        // Compact rows (ClockCardView.compact: converting, or the Compact cards setting): tighter insets and the
        // card's smaller corner radius.
        let compact = context.converting || context.compactCards
        let rowInset: CGFloat = compact ? 3 : 6
        let cornerRadius: CGFloat = compact ? 16 : 24
        return Button {
            withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) {
                model.startConverting(from: zone)
            }
        } label: {
            ClockCardView(zone: zone, label: label, hours: hours, context: context, highlighted: model.focusZone == zone)
        }
        .buttonStyle(PressableCardStyle())
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .contextMenu { CardMenu(zone: zone, saved: saved, sunText: sun) }
        .accessibilityLabel(summary)
        .accessibilityHint(hint)
        .accessibilityInputLabels([Text(label)])   // Voice Control: "Tap Lisbon", not the whole summary
        .accessibilityAddTraits(isSource ? .isSelected : [])
        .accessibilityActions { CardAccessibilityActions(zone: zone, saved: saved) }
        .swipeActions(edge: .trailing, allowsFullSwipe: saved) {
            if saved {
                Button(role: .destructive) {
                    withAnimation(Motion.animation(.smooth, reduce: reduceMotion)) { model.removeZone(zone) }
                } label: {
                    Label(L10n.tr("menu.remove"), systemImage: "trash")
                }
            }
        }
        .swipeActions(edge: .leading) {
            Button {
                model.startConverting(from: zone)
            } label: {
                Label(L10n.tr("menu.source"), systemImage: "arrow.left.arrow.right")
            }
            .tint(.blue)
        }
        .listRowInsets(EdgeInsets(top: rowInset, leading: 16, bottom: rowInset, trailing: 16))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label(L10n.tr("empty.title"), systemImage: "globe")
        } description: {
            Text(L10n.tr("empty.sub"))
        } actions: {
            Button(L10n.tr("empty.add")) { model.sheet = .addCity }
                .buttonStyle(.borderedProminent)
                .prominentAccent(scheme)
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            if !model.settings.zones.isEmpty {
                Button(editMode.isEditing ? L10n.tr("common.done") : L10n.tr("common.edit")) {
                    withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) {
                        editMode = editMode.isEditing ? .inactive : .active
                    }
                }
            }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) {
                    if model.conversion == nil { model.startConverting() } else { model.stopConverting() }
                }
            } label: {
                Label(model.conversion == nil ? L10n.tr("conv.start") : L10n.tr("conv.clear"),
                      systemImage: model.conversion == nil ? "clock.arrow.2.circlepath" : "clock.badge.checkmark")
            }
            Button {
                model.sheet = .addCity
            } label: {
                Label(L10n.tr("search.aria"), systemImage: "plus")
            }
            SettingsToolbarButton()
        }
    }
}

/// Context menu for a card (app.js card menu: source, rename, hours, copy, move, remove), plus the
/// sunrise/sunset line the desktop card shows as its tooltip (app.js sunTitleOf).
struct CardMenu: View {
    let zone: String
    let saved: Bool
    /// "Sunrise 6:58 AM · Sunset 7:05 PM" for the card's displayed instant; nil without coordinates.
    let sunText: String?
    @Environment(AppModel.self) private var model

    var body: some View {
        // Long zone name as the menu title ("Central European Summer Time"): the card only has room for the abbreviation.
        Section(WCFormat.longName(zone, at: .now)) {
            if let sunText {
                // A bare label in a context menu renders as a non-interactive information row.
                Label(sunText, systemImage: "sunrise")
            }
            Button { model.startConverting(from: zone) } label: {
                Label(L10n.tr("menu.source"), systemImage: "arrow.left.arrow.right")
            }
            Button { model.copyTimes(onlyZone: zone) } label: {
                Label(L10n.tr("menu.copy"), systemImage: "doc.on.doc")
            }
            // Same text as Copy, handed to the share sheet.
            ShareLink(item: model.copyText(onlyZone: zone, now: .now)) {
                Label(L10n.tr("menu.share"), systemImage: "square.and.arrow.up")
            }
            Button { model.sheet = .rename(zone) } label: {
                Label(L10n.tr("menu.rename"), systemImage: "pencil")
            }
            Button { model.sheet = .hours(zone) } label: {
                Label(L10n.tr("menu.hours"), systemImage: "briefcase")
            }
        }
        if saved {
            Divider()
            if model.canMove(zone, by: -1) {
                Button { model.move(zone, by: -1) } label: {
                    Label(L10n.tr("menu.up"), systemImage: "arrow.up")
                }
            }
            if model.canMove(zone, by: 1) {
                Button { model.move(zone, by: 1) } label: {
                    Label(L10n.tr("menu.down"), systemImage: "arrow.down")
                }
            }
            Divider()
            Button(role: .destructive) { model.removeZone(zone) } label: {
                Label(L10n.tr("menu.remove"), systemImage: "trash")
            }
        }
    }
}

/// VoiceOver custom actions mirroring the context menu. "Convert from here" and "Remove" are omitted: the row's
/// swipe actions already expose them as custom actions, and listing them twice clutters the actions rotor.
struct CardAccessibilityActions: View {
    let zone: String
    let saved: Bool
    @Environment(AppModel.self) private var model

    var body: some View {
        Button(L10n.tr("menu.copy")) { model.copyTimes(onlyZone: zone) }
        Button(L10n.tr("menu.rename")) { model.sheet = .rename(zone) }
        Button(L10n.tr("menu.hours")) { model.sheet = .hours(zone) }
        if saved {
            if model.canMove(zone, by: -1) { Button(L10n.tr("menu.up")) { model.move(zone, by: -1) } }
            if model.canMove(zone, by: 1) { Button(L10n.tr("menu.down")) { model.move(zone, by: 1) } }
        }
    }
}
