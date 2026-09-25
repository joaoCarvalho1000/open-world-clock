import SwiftUI
import WidgetKit
import WorldClockCore

// MARK: - Entry views (family dispatch)

struct CityClockEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ClockEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            CircularCityView(entry: entry)
        case .accessoryInline:
            InlineCityView(entry: entry)
        default:
            SmallClockView(entry: entry)
        }
    }
}

struct WorldClocksEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ClockEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            RectangularCitiesView(entry: entry)
        case .systemLarge, .systemExtraLarge:
            LargeCitiesView(entry: entry)
        default:
            MediumCitiesView(entry: entry)
        }
    }
}

// MARK: - Small (Home Screen, StandBy)

struct SmallClockView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.showsWidgetContainerBackground) private var showsBackground
    let entry: ClockEntry

    var body: some View {
        let look = WidgetLook(renderingMode: renderingMode, showsBackground: showsBackground, colorScheme: colorScheme)
        if let city = entry.cities.first {
            let surface = Surface(city: city, dark: look.dark)
            content(city, surface: surface, look: look)
                .containerBackground(for: .widget) { surface.gradient }
                .widgetURL(city.url)
        } else {
            EmptyWidgetView(text: entry.strings.empty)
                .containerBackground(for: .widget) { Surface.canvas(dark: look.dark) }
        }
    }

    @ViewBuilder
    private func content(_ city: CitySnapshot, surface: Surface, look: WidgetLook) -> some View {
        // StandBy (background removed, full color by day / vibrant at night): larger digits, fewer lines,
        // readable from across a room. The iOS 18 tinted Home Screen (.accented) keeps the regular layout.
        let standBy = !showsBackground && renderingMode != .accented
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text(verbatim: city.name)
                    .font(standBy ? Font.subheadline.weight(.semibold) : Font.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(look.primary(surface))
                if city.isHome {
                    Image(systemName: "location.fill")
                        .font(.caption2)
                        .foregroundStyle(look.accent(surface))
                        .widgetAccentable()
                        .accessibilityLabel(Text(verbatim: entry.strings.home))
                }
                Spacer(minLength: 0)
                if entry.isShifted {
                    ShiftBadge(text: entry.strings.shiftBadge, surface: surface, look: look)
                }
            }
            if !standBy {
                HStack(spacing: 4) {
                    Image(systemName: PhaseSymbol.name(for: city.phaseKey, asleep: city.asleep))
                        .symbolRenderingMode(.hierarchical)
                        .accessibilityHidden(true)
                    Text(verbatim: "\(city.phaseText) · \(city.relative)")
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .font(.caption)
                .foregroundStyle(look.secondary(surface))
            }
            Spacer(minLength: 0)
            ClockDigits(city: city, size: standBy ? 64 : 46, style: look.digits(surface, shifted: entry.isShifted),
                        ampmStyle: look.secondary(surface))
            if let marker = city.dayMarker {
                Text(verbatim: marker)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(look.secondary(surface))
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(entry.strings.spoken(city, shifted: entry.isShifted))
    }
}

// MARK: - Medium (3-4 rows + shift controls)

struct MediumCitiesView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.showsWidgetContainerBackground) private var showsBackground
    @Environment(\.widgetContentMargins) private var margins
    let entry: ClockEntry

    var body: some View {
        let look = WidgetLook(renderingMode: renderingMode, showsBackground: showsBackground, colorScheme: colorScheme)
        let cities = Array(entry.cities.prefix(4))
        let compact = cities.count > 3
        HStack(spacing: 8) {
            if cities.isEmpty {
                EmptyWidgetView(text: entry.strings.empty)
            } else {
                VStack(spacing: compact ? 4 : 6) {
                    ForEach(cities) { city in
                        Link(destination: city.url) {
                            CityRow(city: city, entry: entry, look: look, compact: compact, showsDayLine: false)
                        }
                    }
                }
            }
            ShiftControls(entry: entry, look: look, axis: .vertical)
        }
        .padding(WidgetInsets.tight(margins))
        .containerBackground(for: .widget) { Surface.canvas(dark: look.dark) }
    }
}

// MARK: - Large (6 rows with day lines, planner header)

struct LargeCitiesView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.showsWidgetContainerBackground) private var showsBackground
    @Environment(\.widgetContentMargins) private var margins
    let entry: ClockEntry

    var body: some View {
        let look = WidgetLook(renderingMode: renderingMode, showsBackground: showsBackground, colorScheme: colorScheme)
        let cities = Array(entry.cities.prefix(6))
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Link(destination: DeepLink.planner.url) {
                    HStack(spacing: 6) {
                        Image(systemName: "calendar.day.timeline.left")
                            .accessibilityHidden(true)
                        Text(verbatim: entry.strings.title)
                            .lineLimit(1)
                    }
                    .font(.headline)
                    .foregroundStyle(look.painted ? AnyShapeStyle(Color(Palette.dayText(dark: look.dark))) : AnyShapeStyle(HierarchicalShapeStyle.primary))
                }
                Spacer(minLength: 4)
                ShiftControls(entry: entry, look: look, axis: .horizontal)
            }
            if cities.isEmpty {
                EmptyWidgetView(text: entry.strings.empty)
            } else {
                VStack(spacing: 5) {
                    ForEach(cities) { city in
                        Link(destination: city.url) {
                            CityRow(city: city, entry: entry, look: look, compact: false, showsDayLine: true)
                        }
                    }
                }
            }
        }
        .padding(WidgetInsets.tight(margins))
        .containerBackground(for: .widget) { Surface.canvas(dark: look.dark) }
    }
}

// MARK: - Lock Screen

struct CircularCityView: View {
    let entry: ClockEntry

    var body: some View {
        Group {
            if let city = entry.cities.first {
                Gauge(value: min(max(city.dayLine.now, 0), 1)) {
                    Text(verbatim: city.abbreviation)
                } currentValueLabel: {
                    Text(verbatim: city.clock.hm)
                        .monospacedDigit()
                        .minimumScaleFactor(0.5)
                        .widgetAccentable()
                }
                .gaugeStyle(.accessoryCircular)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(entry.strings.spoken("\(city.name), \(city.timeText)", shifted: entry.isShifted))
                .widgetURL(city.url)
            } else {
                Image(systemName: "globe").font(.title2)
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }
}

struct InlineCityView: View {
    let entry: ClockEntry

    var body: some View {
        Group {
            if let city = entry.cities.first {
                // Inline widgets render one line of text (plus an optional leading symbol) in the system font.
                Label {
                    Text(verbatim: "\(city.name) \(city.timeText)")
                } icon: {
                    Image(systemName: PhaseSymbol.name(for: city.phaseKey))
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(entry.strings.spoken("\(city.name), \(city.timeText)", shifted: entry.isShifted))
                .widgetURL(city.url)
            } else {
                Text(verbatim: entry.strings.empty)
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }
}

struct RectangularCitiesView: View {
    let entry: ClockEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            ForEach(entry.cities.prefix(3)) { city in
                HStack(spacing: 4) {
                    Text(verbatim: city.name)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Spacer(minLength: 2)
                    if city.dayMarker != nil {
                        Image(systemName: "calendar")
                            .font(.caption2)
                            .accessibilityHidden(true)
                    }
                    Text(verbatim: city.timeText)
                        .monospacedDigit()
                        .fontWeight(.semibold)
                        .lineLimit(1)
                        .widgetAccentable()
                }
                // System text style (scales with the Lock Screen text size) instead of a fixed 15 pt.
                .font(.headline)
                .minimumScaleFactor(0.7)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(entry.strings.spoken(city, shifted: entry.isShifted))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(DeepLink.convert(zone: nil).url)
        .containerBackground(for: .widget) { Color.clear }
    }
}

// MARK: - Building blocks

/// Big thin digits with small AM/PM, precomputed per entry for the city's zone.
struct ClockDigits: View {
    let city: CitySnapshot
    let size: CGFloat
    let style: AnyShapeStyle
    let ampmStyle: AnyShapeStyle
    @Environment(\.legibilityWeight) private var legibilityWeight

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(verbatim: city.clock.hm)
                // Bold Text thickens the thin digits.
                .font(.system(size: size, weight: legibilityWeight == .bold ? .semibold : .thin))
                .monospacedDigit()
                .tracking(-1)
                .foregroundStyle(style)
                .widgetAccentable()
                .invalidatableContent()
            if !city.clock.ampm.isEmpty {
                Text(verbatim: city.clock.ampm)
                    .font(.system(size: max(11, size * 0.27), weight: .medium))
                    .foregroundStyle(ampmStyle)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: city.timeText))
    }
}

/// One city as a mini card: light surface by day, navy by night (sky gradient), optional 24 h day line.
struct CityRow: View {
    let city: CitySnapshot
    let entry: ClockEntry
    let look: WidgetLook
    let compact: Bool
    let showsDayLine: Bool

    var body: some View {
        let surface = Surface(city: city, dark: look.dark)
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 8) {
                Image(systemName: PhaseSymbol.name(for: city.phaseKey, asleep: city.asleep))
                    .symbolRenderingMode(.hierarchical)
                    .font(.caption)
                    .frame(width: 16)
                    .foregroundStyle(look.secondary(surface))
                    .accessibilityHidden(true)
                labels(surface)
                Spacer(minLength: 4)
                if let marker = city.dayMarker {
                    Text(verbatim: marker)
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(look.painted ? surface.text.opacity(0.11) : Color.primary.opacity(0.12)))
                        .foregroundStyle(look.primary(surface))
                }
                ClockDigits(city: city, size: compact ? 22 : 26, style: look.digits(surface, shifted: entry.isShifted),
                            ampmStyle: look.secondary(surface))
                    .layoutPriority(1)
            }
            if showsDayLine {
                DayLineView(line: city.dayLine, surface: surface, look: look, shifted: entry.isShifted)
                    .frame(height: 8)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, compact ? 3 : 5)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: compact ? 10 : 12, style: .continuous).fill(look.rowFill(surface)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(entry.strings.spoken(city, shifted: entry.isShifted))
    }

    @ViewBuilder
    private func labels(_ surface: Surface) -> some View {
        if compact {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                name(surface)
                Text(verbatim: city.relative)
                    .font(.caption)
                    .foregroundStyle(look.secondary(surface))
                    .lineLimit(1)
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                name(surface)
                Text(verbatim: city.asleep ? "\(city.relative) · \(entry.strings.asleep)" : "\(city.relative) · \(city.phaseText)")
                    .font(.caption)
                    .foregroundStyle(look.secondary(surface))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
    }

    private func name(_ surface: Surface) -> some View {
        HStack(spacing: 3) {
            Text(verbatim: city.name)
                .font(.subheadline.weight(.medium))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(look.primary(surface))
            if city.isHome {
                Image(systemName: "location.fill")
                    .font(.system(size: 9))
                    .foregroundStyle(look.accent(surface))
                    .widgetAccentable()
                    .accessibilityLabel(Text(verbatim: entry.strings.home))
            }
        }
    }
}

/// Hairline 24 h track (local midnight to midnight): night shading, working-hours band, dot = now.
struct DayLineView: View {
    let line: DayLine
    let surface: Surface
    let look: WidgetLook
    let shifted: Bool

    var body: some View {
        let ink = look.painted ? surface.text : Color.primary
        let dot = look.painted ? (shifted ? surface.accent : surface.text) : Color.primary
        GeometryReader { geo in
            let width = geo.size.width
            let mid = geo.size.height / 2
            ZStack(alignment: .topLeading) {
                ForEach(Array(line.night.enumerated()), id: \.offset) { item in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(ink.opacity(0.12))
                        .frame(width: max(0, width * (item.element.end - item.element.start)), height: 6)
                        .offset(x: width * item.element.start, y: mid - 3)
                }
                Capsule()
                    .fill(ink.opacity(0.22))
                    .frame(width: width, height: 2)
                    .offset(y: mid - 1)
                ForEach(Array(line.work.enumerated()), id: \.offset) { item in
                    Capsule()
                        .fill(ink.opacity(item.element.off ? 0.2 : 0.5))
                        .frame(width: max(0, width * (item.element.end - item.element.start)), height: 2)
                        .offset(x: width * item.element.start, y: mid - 1)
                }
                Circle()
                    .fill(dot)
                    .frame(width: 8, height: 8)
                    .offset(x: min(max(width * line.now - 4, -4), width - 4), y: mid - 4)
                    .widgetAccentable()
            }
        }
    }
}

/// "+1 h" and "Now" interactive buttons (AppIntents, run in the extension). 44 x 44 pt targets.
struct ShiftControls: View {
    let entry: ClockEntry
    let look: WidgetLook
    let axis: Axis

    var body: some View {
        // Filled pills use the deeper accent under white text; outlined pills and the badge use the text-safe accent,
        // which keeps >= 4.5:1 on the canvas and on the pill's own 14 % tint (4.58:1 light, 6.80:1 dark).
        let fill = Color(Palette.accentFill(dark: look.dark))
        let ink = Color(Palette.accentText(dark: look.dark, night: false))
        let layout = axis == .vertical ? AnyLayout(VStackLayout(spacing: 6)) : AnyLayout(HStackLayout(spacing: 6))
        layout {
            if entry.isShifted, axis == .horizontal {
                badge(ink)
            }
            Button(intent: ShiftTimeIntent(minutes: 60)) {
                pill(Text(verbatim: entry.strings.plusOneHour), fill: fill, ink: ink, filled: false)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(entry.strings.spoken(entry.strings.shiftA11y))
            // Current shift ("+2 h") as the value, so VoiceOver users hear where they are.
            .accessibilityValue(Text(verbatim: entry.strings.shiftBadge))
            .accessibilityInputLabels([Text(verbatim: entry.strings.plusOneHour), Text(verbatim: entry.strings.shiftA11y)])
            if entry.isShifted {
                Button(intent: ShiftTimeIntent(minutes: 0)) {
                    pill(HStack(spacing: 3) {
                        Image(systemName: "arrow.uturn.backward")
                        if axis == .horizontal { Text(verbatim: entry.strings.now) }
                    }, fill: fill, ink: ink, filled: true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(entry.strings.spoken(entry.strings.nowA11y))
                .accessibilityInputLabels([Text(verbatim: entry.strings.now), Text(verbatim: entry.strings.nowA11y)])
            }
            if entry.isShifted, axis == .vertical {
                Spacer(minLength: 0)
                badge(ink)
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private func pill<Content: View>(_ label: Content, fill: Color, ink: Color, filled: Bool) -> some View {
        label
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 10)
            .frame(minWidth: 44, minHeight: 44)
            .foregroundStyle(look.painted ? AnyShapeStyle(filled ? Color.white : ink) : AnyShapeStyle(HierarchicalShapeStyle.primary))
            .background(
                Capsule().fill(look.painted ? (filled ? fill : ink.opacity(0.14)) : Color.primary.opacity(filled ? 0.25 : 0.12))
            )
            .contentShape(Capsule())
            .widgetAccentable()
    }

    private func badge(_ ink: Color) -> some View {
        Text(verbatim: entry.strings.shiftBadge)
            .font(.caption2.weight(.bold))
            .monospacedDigit()
            .foregroundStyle(look.painted ? AnyShapeStyle(ink) : AnyShapeStyle(HierarchicalShapeStyle.secondary))
            .lineLimit(1)
            .accessibilityHidden(true)
    }
}

struct ShiftBadge: View {
    let text: String
    let surface: Surface
    let look: WidgetLook

    var body: some View {
        Text(verbatim: text)
            .font(.caption2.weight(.bold))
            .lineLimit(1)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(look.painted ? AnyShapeStyle(Color.white) : AnyShapeStyle(HierarchicalShapeStyle.primary))
            // White text needs the deeper accent (the light accent on night surfaces is only 2.5:1).
            .background(Capsule().fill(look.painted ? Color(Palette.accentFill(dark: look.dark)) : Color.primary.opacity(0.2)))
            .widgetAccentable()
    }
}

struct EmptyWidgetView: View {
    let text: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "globe")
                .font(.title2)
                .accessibilityHidden(true)
            Text(verbatim: text)
                .font(.footnote)
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

enum WidgetInsets {
    /// Widgets with `contentMarginsDisabled()` pad with 3/4 of the system margins so row cards sit closer to the edge.
    static func tight(_ margins: EdgeInsets) -> EdgeInsets {
        let fallback: CGFloat = 12
        func v(_ x: CGFloat) -> CGFloat { x > 0 ? (x * 0.75).rounded() : fallback }
        return EdgeInsets(top: v(margins.top), leading: v(margins.leading), bottom: v(margins.bottom), trailing: v(margins.trailing))
    }
}

// MARK: - Previews

#Preview("Small", as: .systemSmall) {
    CityClockWidget()
} timeline: {
    WidgetData.sample(zones: ["Asia/Tokyo"], limit: 1)
    WidgetData.sample(zones: ["Europe/Lisbon"], shift: 60, limit: 1)
}

#Preview("Circular", as: .accessoryCircular) {
    CityClockWidget()
} timeline: {
    WidgetData.sample(zones: ["America/New_York"], limit: 1)
}

#Preview("Inline", as: .accessoryInline) {
    CityClockWidget()
} timeline: {
    WidgetData.sample(zones: ["Asia/Tokyo"], limit: 1)
}

#Preview("Medium", as: .systemMedium) {
    WorldClocksWidget()
} timeline: {
    WidgetData.sample(limit: 4)
    WidgetData.sample(shift: 60, limit: 4)
}

#Preview("Large", as: .systemLarge) {
    WorldClocksWidget()
} timeline: {
    WidgetData.sample(limit: 6)
    WidgetData.sample(shift: 120, limit: 6)
}

#Preview("Rectangular", as: .accessoryRectangular) {
    WorldClocksWidget()
} timeline: {
    WidgetData.sample(limit: 3)
}
