import SwiftUI
import UIKit
import WorldClockCore

/// World map tab: land, live day/night shading and sun, one dot per city; city list below.
struct WorldMapScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        NavigationStack {
            TimelineView(.everyMinute) { timeline in
                let instant = model.conversion?.instant ?? timeline.date
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        WorldMapView(instant: instant) { zone in select(zone) }
                            .frame(maxHeight: verticalSizeClass == .compact ? 260 : nil)
                            .frame(maxWidth: .infinity)
                        cityList(instant: instant)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
            .background(CanvasBackground())
            .navigationTitle(L10n.tr("btn.map"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { SettingsToolbarButton() }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if model.conversion != nil {
                    ConverterPanel()
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(Motion.animation(.snappy, reduce: reduceMotion), value: model.conversion == nil)
        }
    }

    private func select(_ zone: String) {
        withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) {
            model.startConverting(from: zone)
        }
    }

    private func cityList(instant: Date) -> some View {
        VStack(spacing: 8) {
            ForEach(model.displayZones, id: \.self) { zone in
                let day = Sun.isDay(zone: zone, at: instant)
                Button {
                    select(zone)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: day ? "sun.max.fill" : "moon.stars.fill")
                            .foregroundStyle(day ? Color.orange : Color.indigo)
                            .frame(width: 28)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.label(zone)).font(.body.weight(.medium))
                            Text(WCFormat.phaseLabel(zone, at: instant)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(WCFormat.timeText(zone, at: instant, hour12: model.hour12))
                                .font(.body.weight(.semibold))
                                .monospacedDigit()
                                .foregroundStyle(model.conversion != nil ? Color(Palette.accentText(dark: scheme == .dark, night: false)) : Color.primary)
                                .contentTransition(.numericText())
                            Text(WCFormat.relativeLabel(zone, at: instant, localZone: model.homeZone))
                                .font(.caption)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(minHeight: 56)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(PressableCardStyle())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(verbatim: [
                    model.label(zone),
                    WCFormat.timeText(zone, at: instant, hour12: model.hour12),
                    WCFormat.phaseLabel(zone, at: instant),
                    WCFormat.spokenRelative(zone, at: instant, localZone: model.homeZone),
                ].joined(separator: ", ")))
                .accessibilityAddTraits(.isButton)
                .accessibilityHint(L10n.tr("card.convertHint"))
                .accessibilityInputLabels([Text(verbatim: model.label(zone))])
            }
        }
    }
}

/// The map itself: a `Canvas` for land / night / sun, SwiftUI buttons for the city dots.
struct WorldMapView: View {
    let instant: Date
    let onSelect: (String) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.legibilityWeight) private var legibilityWeight

    var body: some View {
        let land = WorldLand.shared
        let zones = model.displayZones
        let cities = zones.compactMap { zone in ZoneCatalog.shared.coordinate(of: zone).map { MapCity(zone: zone, coordinate: $0) } }
        let projection = MapProjection(land: land, center: WorldMap.pickCenter(longitudes: cities.map(\.coordinate.lng)))
        // Shading and sun follow the displayed minute; the night layer is cached per minute (NightLayerCache).
        let minute = Int((instant.timeIntervalSince1970 / 60).rounded(.down))
        let subsolar = WorldMap.subsolar(at: Date(timeIntervalSince1970: Double(minute) * 60))
        let style = MapStyle(dark: scheme == .dark, highContrast: contrast == .increased)
        let landPath = LandShape.path
        // Pill sizes use the widest time in the current 12/24 h setting, so pills do not move while scrubbing.
        let metrics = MapPillMetrics(hour12: model.hour12, typeSize: dynamicTypeSize, bold: legibilityWeight == .bold)
        let pillSizes = Dictionary(cities.map { ($0.zone, metrics.size(label: model.label($0.zone))) },
                                   uniquingKeysWith: { first, _ in first })

        GeometryReader { proxy in
            let frame = projection.fitted(to: proxy.size)
            let night = NightLayerCache.image(minute: minute, size: proxy.size, frame: frame, subsolar: subsolar, style: style)
            let placements = labelPlacements(cities: cities, frame: frame, bounds: proxy.size, sizes: pillSizes)
            ZStack(alignment: .topLeading) {
                Canvas { context, size in
                    MapPainter.paint(&context, size: size, frame: frame, landPath: landPath,
                                     subsolar: subsolar, night: night, style: style)
                }
                // Night shading is meaningful color: keep it under Smart Invert.
                .accessibilityIgnoresInvertColors()
                .accessibilityHidden(true)
                ForEach(cities) { city in
                    MapCityDot(zone: city.zone,
                               point: frame.point(lat: city.coordinate.lat, lng: city.coordinate.lng),
                               instant: instant,
                               isHome: city.zone == model.homeZone,
                               isSource: city.zone == model.conversion?.zone,
                               pillSize: pillSizes[city.zone] ?? .zero,
                               placement: placements[city.zone],
                               style: style) { onSelect(city.zone) }
                }
            }
        }
        .aspectRatio(land.width / land.height, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.5))
        // One image element: the city list below is the accessible equivalent of the dots.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr("map.aria"))
        .accessibilityAddTraits(.isImage)
    }

    /// Collision-free pill positions (MapLabels, the Windows map.js placement) in the Windows priority order:
    /// the home city, then the conversion source, then the display order. A city whose pill fits nowhere gets
    /// no entry and shows only its dot; the city list under the map still has every name and time.
    private func labelPlacements(cities: [MapCity], frame: MapFrame, bounds: CGSize,
                                 sizes: [String: CGSize]) -> [String: MapLabelPlacement] {
        let home = model.homeZone
        let source = model.conversion?.zone
        func rank(_ zone: String) -> Int { zone == home ? 0 : (zone == source ? 1 : 2) }
        let ordered = cities.enumerated()
            .sorted { a, b in
                let ra = rank(a.element.zone), rb = rank(b.element.zone)
                return ra != rb ? ra < rb : a.offset < b.offset
            }
            .map(\.element)
        let items = ordered.map { city -> MapLabelItem in
            let point = frame.point(lat: city.coordinate.lat, lng: city.coordinate.lng)
            let size = sizes[city.zone] ?? .zero
            return MapLabelItem(x: Double(point.x), y: Double(point.y), width: Double(size.width), height: Double(size.height))
        }
        let rect = MapLabelRect(x: 0, y: 0, width: Double(bounds.width), height: Double(bounds.height))
        // The map is clipped to a 20 pt rounded rectangle: keep pills out of its corners.
        let placed = MapLabels.place(items: items, bounds: rect, blocked: MapLabels.corners(of: rect))
        var placements: [String: MapLabelPlacement] = [:]
        for (city, result) in zip(ordered, placed) {
            if let result { placements[city.zone] = result }
        }
        return placements
    }
}

private struct MapCity: Identifiable {
    let zone: String
    let coordinate: Coordinate
    var id: String { zone }
}

/// Measures a map pill ("Lisbon 10:00 PM") with the font the pill draws: caption2, semibold (bold with
/// Bold Text on), monospaced digits, at the current Dynamic Type size, plus the pill's padding.
private struct MapPillMetrics {
    static let horizontalPadding: CGFloat = 12
    static let verticalPadding: CGFloat = 4

    let font: UIFont
    /// The widest time forms of the setting: a two-digit hour, and both day periods in 12 h ("10:00 AM", "10:00 PM").
    let timeSamples: [String]

    init(hour12: Bool, typeSize: DynamicTypeSize, bold: Bool) {
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(typeSize))
        let pointSize = UIFont.preferredFont(forTextStyle: .caption2, compatibleWith: traits).pointSize
        font = UIFont.monospacedDigitSystemFont(ofSize: pointSize, weight: bold ? .bold : .semibold)
        let tenAM = Date(timeIntervalSince1970: 10 * 3600)   // 1970-01-01 10:00 UTC
        timeSamples = [tenAM, tenAM.addingTimeInterval(12 * 3600)].map { WCFormat.timeText("UTC", at: $0, hour12: hour12) }
    }

    func size(label: String) -> CGSize {
        let attributes: [NSAttributedString.Key: Any] = [.font: font]
        var width: CGFloat = 0
        var height: CGFloat = 0
        for time in timeSamples {
            let measured = ("\(label) \(time)" as NSString).size(withAttributes: attributes)
            width = max(width, measured.width)
            height = max(height, measured.height)
        }
        return CGSize(width: ceil(width) + Self.horizontalPadding, height: ceil(height) + Self.verticalPadding)
    }
}

/// One tappable city on the map (44 pt target) with a small label pill where `MapLabels` found room for it.
/// Hidden from VoiceOver: the city list under the map carries the same information and actions.
private struct MapCityDot: View {
    let zone: String
    let point: CGPoint
    let instant: Date
    let isHome: Bool
    let isSource: Bool
    /// Measured pill size (MapPillMetrics), the same size the placement used.
    let pillSize: CGSize
    /// Pill top-left offset from the dot center; nil when no side has room (dot only).
    let placement: MapLabelPlacement?
    let style: MapStyle
    let action: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor

    var body: some View {
        // Same day/night source as the city list and the cards (Sun.isDay), so a dot never disagrees with its row.
        let night = !Sun.isDay(zone: zone, at: instant)
        let label = model.label(zone)
        let time = WCFormat.timeText(zone, at: instant, hour12: model.hour12)
        let dotColor = isHome || isSource ? style.accent : (night ? style.nightDot : style.dayDot)
        let emphasized = isHome || isSource

        Button(action: action) {
            ZStack {
                if night && differentiateWithoutColor {
                    // Day vs night must not rely on dot color alone.
                    Image(systemName: "moon.fill")
                        .font(.system(size: emphasized ? 12 : 10, weight: .bold))
                        .foregroundStyle(dotColor)
                        .shadow(color: style.dotRing, radius: 0.5)
                        .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                } else {
                    Circle()
                        .fill(dotColor)
                        .frame(width: emphasized ? 11 : 8, height: emphasized ? 11 : 8)
                        .overlay(Circle().strokeBorder(style.dotRing, lineWidth: 1.5))
                        .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityHidden(true)
        .overlay {
            // Centered on the dot, then moved so the pill's top-left corner lands at dot + (dx, dy).
            if let placement {
                Text(verbatim: "\(label) \(time)")
                    .font(.caption2.weight(.semibold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .fixedSize()
                    .frame(width: pillSize.width, height: pillSize.height)
                    .background(.thinMaterial, in: Capsule())
                    .foregroundStyle(isHome || isSource ? style.accentText : Color.primary)
                    .offset(x: CGFloat(placement.dx) + pillSize.width / 2, y: CGFloat(placement.dy) + pillSize.height / 2)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .position(point)
    }
}
