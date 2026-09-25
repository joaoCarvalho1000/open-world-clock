import Accessibility
import SwiftUI
import TipKit
import UIKit
import WidgetKit
import WorldClockCore

enum AppTab: String, Hashable, Sendable {
    case clocks, planner, map
}

/// The one sheet RootView presents (a single `.sheet(item:)`, so deep links never collide with an open sheet).
enum ActiveSheet: Identifiable, Hashable, Sendable {
    case settings
    case addCity
    case rename(String)
    case hours(String)

    var id: String {
        switch self {
        case .settings: return "settings"
        case .addCity: return "addCity"
        case .rename(let zone): return "rename:" + zone
        case .hours(let zone): return "hours:" + zone
        }
    }
}

/// App state. Settings live in the App Group store; every write goes through `SettingsStore.update`
/// and reloads the widget timelines.
@Observable
@MainActor
final class AppModel {
    @ObservationIgnored private let store: SettingsStore
    @ObservationIgnored private var flashTask: Task<Void, Never>? = nil

    private(set) var settings: AppSettings
    /// The device zone ("home"): always shown, marked with the accent.
    private(set) var homeZone: String

    var tab: AppTab = .clocks
    var sheet: ActiveSheet? = nil
    /// Planner day (0 = today in the planner source) while not converting.
    var plannerDayOffset = 0

    /// nil = live clocks.
    private(set) var conversion: Conversion? = nil
    private(set) var scrubAnchor: ScrubAnchor? = nil
    /// Short-lived status ("Copied"): converter hint while converting, toast overlay otherwise.
    private(set) var flash: String? = nil
    /// Bumped by every `showFlash`: the success haptic's trigger. `flash` alone stays "Copied" when the user copies
    /// again within 1.5 s, so a second copy would get no tap.
    private(set) var flashCount = 0
    /// A city the Clocks tab scrolls to and outlines briefly (a widget tap). ClockListScreen clears it.
    var focusZone: String? = nil

    /// `defaults` is where the first-run check looks (the App Group behind `SettingsStore.shared`; tests pass the
    /// suite of their own store).
    init(store: SettingsStore = .shared, defaults: UserDefaults = FirstRun.defaults) {
        self.store = store
        let home = DeviceZone.current()
        self.homeZone = home
        var loaded = store.load()
        if FirstRun.isFirstRun(in: defaults) {
            // The same first-run settings an unconfigured widget shows before the app is opened (`FirstRun`).
            let first = FirstRun.settings(home: home)
            loaded = store.update { $0 = first }
        }
        self.settings = loaded
        L10n.language = loaded.language
        AppModel.applyAccessibilityLanguage()
    }

    // MARK: Derived

    /// The device zone is shown first when it is not one of the saved cities.
    var showsImplicitHome: Bool { !settings.zones.contains(homeZone) }

    /// Cards in display order (unconfigured widgets show the same list, see `DisplayZones`).
    var displayZones: [String] { DisplayZones.list(saved: settings.zones, home: homeZone) }

    var hour12: Bool { settings.hour12 }

    /// The app's UI language, never `.auto` (drives localized city and country names).
    var language: AppLanguage { AppLanguage.resolve(settings.language) }

    /// Custom label if set, else the city name in the app language (app.js labelOf).
    func label(_ zone: String) -> String {
        if let custom = settings.labels[zone], !custom.isEmpty { return custom }
        return cityName(zone)
    }

    /// City name in the app language (app.js cityOf), ignoring custom labels.
    func cityName(_ zone: String) -> String {
        ZoneCatalog.shared.cityName(of: zone, language: language)
    }

    /// Country name in the app language (app.js regionOf).
    func country(_ zone: String) -> String {
        ZoneCatalog.shared.country(of: zone, language: language)
    }

    func hours(for zone: String) -> WorkingHours {
        Planner.hours(for: zone, in: settings.hours)
    }

    var preferredColorScheme: ColorScheme? {
        switch settings.theme {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    /// Environment locale (DatePickers, SwiftUI formatting): the same locale as `WCFormat` (`L10n.locale`). Built
    /// from `settings.language` so SwiftUI observes a language change.
    var locale: Locale { L10n.locale(for: language) }

    // MARK: Store sync

    /// Re-read settings written elsewhere (widget buttons) and pick up a new device zone.
    func reloadFromStore() {
        adopt(store.load())
        refreshHomeZone()
    }

    /// Picks up a new device zone. Widgets mark "home", compute relative offsets and (unconfigured) list the
    /// device zone first, so their timelines are rebuilt too.
    func refreshHomeZone() {
        let zone = DeviceZone.current()
        guard zone != homeZone else { return }
        homeZone = zone
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func mutate(_ change: (inout AppSettings) -> Void) {
        adopt(store.update(change))
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func adopt(_ next: AppSettings) {
        if next != settings { settings = next }
        L10n.language = next.language
        AppModel.applyAccessibilityLanguage()
    }

    /// VoiceOver speaks the UI in the app's language even when it differs from the system language.
    private static func applyAccessibilityLanguage() {
        UIApplication.shared.accessibilityLanguage = AppLanguage.resolve(L10n.language).localeIdentifier
    }

    // MARK: Cities

    func addZone(_ zone: String) {
        guard !settings.zones.contains(zone) else { return }
        mutate { $0.zones.append(zone) }
        announce(L10n.tr("say.added", ["city": label(zone)]))
    }

    func removeZone(_ zone: String) {
        let name = label(zone)
        mutate { settings in
            settings.zones.removeAll { $0 == zone }
            settings.labels[zone] = nil
            settings.hours[zone] = nil
        }
        announce(L10n.tr("say.removed", ["city": name]))
    }

    func moveZones(fromOffsets source: IndexSet, toOffset destination: Int) {
        mutate { $0.zones.move(fromOffsets: source, toOffset: destination) }
    }

    func canMove(_ zone: String, by delta: Int) -> Bool {
        guard let index = settings.zones.firstIndex(of: zone) else { return false }
        return settings.zones.indices.contains(index + delta)
    }

    func move(_ zone: String, by delta: Int) {
        guard canMove(zone, by: delta), let index = settings.zones.firstIndex(of: zone) else { return }
        mutate { $0.zones.swapAt(index, index + delta) }
        announce(L10n.tr("say.moved", ["city": label(zone), "n": String(index + delta + 1)]))
    }

    /// Custom label, 1...40 characters; empty (or the city name) resets to the city name.
    func rename(_ zone: String, to text: String) {
        let before = label(zone)
        let trimmed = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        let reset = trimmed.isEmpty || trimmed == cityName(zone) || trimmed == ZoneCatalog.shared.cityName(of: zone)
        guard (settings.labels[zone] ?? "") != (reset ? "" : trimmed) else { return }
        mutate { $0.labels[zone] = reset ? nil : trimmed }
        announce(L10n.tr("say.renamed", ["old": before, "name": label(zone)]))
    }

    /// nil (or the default 09:00-18:00 Mon-Fri) removes the entry.
    func setHours(_ hours: WorkingHours?, for zone: String) {
        let clear = hours == nil || hours == WorkingHours.default
        mutate { $0.hours[zone] = clear ? nil : hours }
        announce(L10n.tr(clear ? "say.hoursReset" : "say.hoursSaved", ["city": label(zone)]))
    }

    // MARK: Preferences

    func setHour12(_ on: Bool) { mutate { $0.hour12 = on } }
    func setShowSeconds(_ on: Bool) { mutate { $0.showSeconds = on } }
    func setTheme(_ theme: ThemeSetting) { mutate { $0.theme = theme } }
    func setLanguage(_ language: AppLanguage) { mutate { $0.language = language } }

    // MARK: Converter

    /// Opens the converter. With an instant, (re)starts there; without one, keeps a running
    /// conversion (switching its source like app.js convertFrom) or starts at now rounded to 15 min.
    func startConverting(from zone: String? = nil, at instant: Date? = nil) {
        // The user found the converter: the "Tap a city to convert a time" tip is done for good.
        ConvertTip().invalidate(reason: .actionPerformed)
        let source = zone ?? conversion?.zone ?? homeZone
        if let conversion, instant == nil {
            if conversion.zone != source { setConversionSource(source) }
            return
        }
        let wasLive = conversion == nil
        apply(Conversion(zone: source, instant: instant ?? Conversion.rounded(.now)))
        if wasLive, let conversion {
            announce(L10n.tr("say.converted", ["time": WCFormat.formatTime(conversion.time, hour12: hour12),
                                               "city": label(source)]))
        }
    }

    func stopConverting() {
        guard conversion != nil else { return }
        conversion = nil
        scrubAnchor = nil
        announce(L10n.tr("say.now"))
    }

    func setConversionInstant(_ instant: Date) {
        guard let conversion else { return startConverting(at: instant) }
        apply(Conversion(zone: conversion.zone, instant: instant))
    }

    func setConversionTime(_ time: HourMinute) {
        let base = conversion ?? Conversion(zone: homeZone, instant: Conversion.rounded(.now))
        apply(Conversion(zone: base.zone, date: base.date, time: time))
    }

    func setConversionDate(_ date: CivilDate) {
        let base = conversion ?? Conversion(zone: homeZone, instant: Conversion.rounded(.now))
        apply(Conversion(zone: base.zone, date: date, time: base.time))
    }

    /// Keeps the typed wall time and date, reinterpreted in the new source zone (app.js convZone change).
    func setConversionSource(_ zone: String) {
        guard let conversion else { return startConverting(from: zone) }
        apply(Conversion(zone: zone, date: conversion.date, time: conversion.time))
    }

    func scrub(byMinutes minutes: Int) {
        let base = conversion?.instant ?? Conversion.rounded(.now)
        setConversionInstant(base.addingTimeInterval(Double(minutes) * 60))
    }

    private func apply(_ next: Conversion) {
        conversion = next
        if let anchor = scrubAnchor, anchor.zone == next.zone, anchor.contains(next.instant) { return }
        scrubAnchor = ScrubAnchor(zone: next.zone, day: next.date)
    }

    // MARK: Deep links

    func handle(_ link: DeepLink) {
        // A widget may have just written settings (e.g. the "+1 h" shift): read them before acting.
        reloadFromStore()
        switch link {
        case .convert(let zone):
            sheet = nil
            tab = .clocks
            let now = Date.now
            let shift = settings.effectiveShift(at: now)
            if shift > 0 {
                // The widget showed shifted times (+1 h): open the converter at the time the widget showed.
                startConverting(from: zone ?? homeZone, at: now.addingTimeInterval(Double(shift) * 60))
            } else {
                // The widget showed live times: open live Clocks at that city, not a conversion rounded to 15 min.
                // A city the app does not list (or no city) just opens Clocks.
                stopConverting()
                focusZone = zone.flatMap { displayZones.contains($0) ? $0 : nil }
            }
            // The shift ends once the app opens (an expired leftover is cleared too).
            if settings.widgetShiftMinutes != 0 || settings.widgetShiftExpires != nil {
                mutate { settings in
                    settings.widgetShiftMinutes = 0
                    settings.widgetShiftExpires = nil
                }
            }
        case .planner:
            sheet = nil
            tab = .planner
        case .map:
            sheet = nil
            tab = .map
        case .settings:
            sheet = .settings
        }
    }

    // MARK: Copy, flash, announcements

    func copyTimes(onlyZone: String? = nil) {
        UIPasteboard.general.string = copyText(onlyZone: onlyZone, now: .now)
        showFlash(L10n.tr("hint.copied"))
        announce(L10n.tr("say.copied"))
    }

    func showFlash(_ text: String) {
        flash = text
        flashCount &+= 1
        flashTask?.cancel()
        flashTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1.5))
            guard !Task.isCancelled else { return }
            self?.flash = nil
        }
    }

    func announce(_ text: String) {
        AccessibilityNotification.Announcement(text).post()
    }
}
