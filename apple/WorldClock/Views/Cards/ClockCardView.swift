import SwiftUI
import WorldClockCore

/// Everything a card needs besides the zone itself.
struct CardContext {
    let instant: Date
    let converting: Bool
    /// Converter source (or the home zone when live): day markers are relative to it.
    let refZone: String
    let homeZone: String
    let hour12: Bool
    let showSeconds: Bool
    /// Settings > Display > Compact cards: the compact row while live too.
    let compactCards: Bool
}

/// One city card: phase, big thin digits, date, offsets, working-hours bar, clock-change note.
/// While converting it becomes a compact row (name and phase, then the converted time and day marker), so about six
/// cities stay visible above the converter panel. The row's VoiceOver label and hint (ClockListScreen) carry what the
/// compact row leaves out. The Compact cards setting uses the same row while live, with the time in the plain text
/// color (the accent is kept for converted times).
struct ClockCardView: View {
    let zone: String
    let label: String
    let hours: WorkingHours
    let context: CardContext
    /// Outlined like the converter source for a moment (a widget tap scrolled to this city).
    var highlighted = false

    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) var digitSize: CGFloat = 60

    private var isHome: Bool { zone == context.homeZone }
    private var isSource: Bool { context.converting && zone == context.refZone }
    /// Compact rows while converting, or all the time with the Compact cards setting.
    private var compact: Bool { context.converting || context.compactCards }
    private var cornerRadius: CGFloat { compact ? 16 : 24 }

    var body: some View {
        let instant = context.instant
        let night = !Sun.isDay(zone: zone, at: instant)
        let colors = SurfaceColors(night: night, dark: scheme == .dark, highContrast: contrast == .increased)
        let asleep = context.converting && TimeMath.isLikelyAsleep(zone, at: instant)

        Group {
            if compact {
                // 8 pt keeps a row at about 54 pt (57 with a day marker), so six rows and their gaps fit above the panel.
                compactContent(colors: colors, asleep: asleep)
                    .padding(.vertical, 8)
                    .padding(.horizontal, 12)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    header(colors: colors, asleep: asleep)
                    digits(colors: colors)
                    DayArcView(zone: zone, instant: instant, hours: hours, colors: colors)
                    footer(colors: colors)
                    if let note = ClockChangeCache.note(zone, at: instant) {
                        // The detail ("Clocks go forward 1 h on ...") is part of the row's VoiceOver hint (ClockListScreen).
                        Label(WCFormat.clockChangeText(note), systemImage: "clock.arrow.2.circlepath")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(colors.primary)
                    }
                }
                .padding(16)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // "Likely asleep" dims only the surface: the text keeps its full contrast.
        .background(CardSurface(sky: Sky.phase(zone: zone, at: instant), night: night, cornerRadius: cornerRadius)
            .opacity(asleep && contrast != .increased ? 0.7 : 1))
        .overlay {
            if isSource || highlighted {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(colors.accent, lineWidth: 2)
            }
        }
        .animation(Motion.animation(.smooth, reduce: reduceMotion), value: asleep)
        .animation(Motion.animation(.smooth, reduce: reduceMotion), value: highlighted)
    }

    // MARK: Compact (converting, or the Compact cards setting)

    @ViewBuilder
    private func compactContent(colors: SurfaceColors, asleep: Bool) -> some View {
        let clock = WCFormat.clock(zone, at: context.instant, hour12: context.hour12)
        let marker = WCFormat.dayMarker(TimeMath.dayDiff(zone, at: context.instant, relativeTo: context.refZone))
        if typeSize.isAccessibilitySize {
            // Accessibility text sizes: name, time and phase stacked in the same compact card, nothing truncated.
            VStack(alignment: .leading, spacing: 4) {
                compactName(colors: colors, lineLimit: nil)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    compactTime(clock, colors: colors)
                    if !marker.isEmpty { dayMarkerCapsule(marker, colors: colors, font: .caption2.weight(.semibold)) }
                }
                compactPhase(colors: colors, asleep: asleep, lineLimit: nil)
            }
        } else {
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    compactName(colors: colors, lineLimit: 1)
                    compactPhase(colors: colors, asleep: asleep, lineLimit: 1)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 0) {
                    compactTime(clock, colors: colors)
                    if !marker.isEmpty {
                        dayMarkerCapsule(marker, colors: colors, font: .caption2.weight(.semibold), vertical: 0)
                    }
                }
                // A long custom label truncates, never the converted time.
                .layoutPriority(1)
            }
        }
    }

    private func compactName(colors: SurfaceColors, lineLimit: Int?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(colors.primary)
                .lineLimit(lineLimit)
            if isHome { homePill }
        }
    }

    private func compactPhase(colors: SurfaceColors, asleep: Bool, lineLimit: Int?) -> some View {
        HStack(spacing: 4) {
            Text(WCFormat.phaseLabel(zone, at: context.instant))
                .font(.caption)
                .foregroundStyle(colors.secondary)
                .lineLimit(lineLimit)
            if asleep {
                Image(systemName: "moon.zzz.fill")
                    .font(.caption)
                    .foregroundStyle(colors.secondary)
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityLabel(L10n.tr("card.asleep"))
            }
        }
    }

    private func compactTime(_ clock: ClockText, colors: SurfaceColors) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(clock.hm)
                .font(.title2)
                .monospacedDigit()
                .contentTransition(.numericText())
                // Accent means "converted time"; a live compact card keeps the plain text color.
                .foregroundStyle(context.converting ? colors.accentText : colors.primary)
                .lineLimit(1)
                .animation(Motion.animation(.snappy, reduce: reduceMotion), value: clock.hm)
            if !clock.ampm.isEmpty {
                Text(clock.ampm)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(colors.secondary)
            }
        }
    }

    // MARK: Sections

    private var homePill: some View {
        Text(L10n.tr("card.home"))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            // Deeper accent under white text (contrast >= 4.5:1 in both themes).
            .background(Color(Palette.accentFill(dark: scheme == .dark)), in: Capsule())
    }

    /// "+1 day" style marker: full-contrast text; the tinted capsule carries the accent.
    private func dayMarkerCapsule(_ marker: String, colors: SurfaceColors, font: Font, vertical: CGFloat = 1) -> some View {
        Text(marker)
            .font(font)
            .foregroundStyle(colors.primary)
            .padding(.horizontal, 6)
            .padding(.vertical, vertical)
            .background(colors.accent.opacity(0.15), in: Capsule())
    }

    private func header(colors: SurfaceColors, asleep: Bool) -> some View {
        // Accessibility text sizes: stack the offset under the name instead of squeezing both on one line.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
        return layout {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(label)
                        .font(.headline)
                        .foregroundStyle(colors.primary)
                    if isHome { homePill }
                }
                HStack(spacing: 5) {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(colors.secondary)
                    if asleep {
                        Image(systemName: "moon.zzz.fill")
                            .font(.subheadline)
                            .foregroundStyle(colors.secondary)
                            .transition(.scale.combined(with: .opacity))
                            .accessibilityLabel(L10n.tr("card.asleep"))
                    }
                }
            }
            if !typeSize.isAccessibilitySize { Spacer(minLength: 8) }
            Text(WCFormat.relativeLabel(zone, at: context.instant, localZone: context.homeZone))
                .font(.subheadline.weight(isHome ? .medium : .semibold))
                .foregroundStyle(isHome ? colors.secondary : colors.primary)
                .monospacedDigit()
        }
    }

    /// "Portugal · Morning" in the app language (country may be missing for uncurated zones).
    private var subtitle: String {
        let phase = WCFormat.phaseLabel(zone, at: context.instant)
        let country = ZoneCatalog.shared.country(of: zone, language: L10n.resolvedLanguage)
        guard !country.isEmpty, country != label else { return phase }
        return "\(country) · \(phase)"
    }

    private func digits(colors: SurfaceColors) -> some View {
        let clock = WCFormat.clock(zone, at: context.instant, hour12: context.hour12)
        let small = max(15, digitSize * 0.28)
        return HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(clock.hm)
                // Bold Text: thin strokes are the first thing it should thicken.
                .font(.system(size: digitSize, weight: digitWeight))
                .monospacedDigit()
                .contentTransition(.numericText())
                .foregroundStyle(context.converting ? colors.accentText : colors.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .animation(Motion.animation(.snappy, reduce: reduceMotion), value: clock.hm)
            VStack(alignment: .leading, spacing: 0) {
                if !clock.ampm.isEmpty {
                    Text(clock.ampm)
                        .font(.system(size: small, weight: .medium))
                        .foregroundStyle(colors.secondary)
                }
                if context.showSeconds && !context.converting {
                    SecondsText(zone: zone, hour12: context.hour12, size: small, color: colors.secondary)
                }
            }
        }
    }

    private var digitWeight: Font.Weight {
        if legibilityWeight == .bold { return .semibold }
        return digitSize < 20 ? .medium : .thin
    }

    @ViewBuilder
    private func footer(colors: SurfaceColors) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
        let marker = WCFormat.dayMarker(TimeMath.dayDiff(zone, at: context.instant, relativeTo: context.refZone))
        let abbr = WCFormat.abbreviation(zone, at: context.instant)
        let utc = TimeMath.utcLabel(zone, at: context.instant)
        layout {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(WCFormat.dateText(zone, at: context.instant))
                    .foregroundStyle(colors.secondary)
                if !marker.isEmpty { dayMarkerCapsule(marker, colors: colors, font: .caption.weight(.semibold)) }
            }
            if !typeSize.isAccessibilitySize { Spacer(minLength: 4) }
            Text(abbr.isEmpty ? utc : "\(abbr) · \(utc)")
                .foregroundStyle(colors.secondary)
                .monospacedDigit()
        }
        .font(.footnote)
    }
}

/// Seconds ticking on their own 1 s timeline so the rest of the card only redraws once a minute.
private struct SecondsText: View {
    let zone: String
    let hour12: Bool
    let size: CGFloat
    let color: Color

    var body: some View {
        let start = Date(timeIntervalSince1970: (Date.now.timeIntervalSince1970 / 60).rounded(.down) * 60)
        TimelineView(.periodic(from: start, by: 1)) { timeline in
            Text(WCFormat.clock(zone, at: timeline.date, hour12: hour12).seconds)
                .font(.system(size: size, weight: .medium))
                .monospacedDigit()
                .foregroundStyle(color)
        }
        .accessibilityHidden(true)
    }
}

/// Working-hours band on a 24 h line with a dot at the current local time (app.js .arc).
struct DayArcView: View {
    let zone: String
    let instant: Date
    let hours: WorkingHours
    let colors: SurfaceColors

    var body: some View {
        let wall = TimeMath.wallClock(zone, at: instant)
        let progress = Double(wall.hour * 60 + wall.minute) / 1440
        // Overnight shifts: the early-morning part belongs to the previous day's shift (core Planner.isWorking).
        let bands = WorkBands.bands(hours, weekday: wall.weekday)
        let working = Planner.isWorking(zone, hours: hours, at: instant)
        let track = colors.secondary.opacity(0.25)
        let dot = working ? colors.accent : colors.primary
        let primary = colors.primary

        Canvas { context, size in
            let height: CGFloat = 3
            let y = size.height / 2 - height / 2
            let bar = { (from: Double, to: Double) -> Path in
                Path(roundedRect: CGRect(x: from * size.width, y: y, width: max(0, (to - from) * size.width), height: height),
                     cornerRadius: height / 2)
            }
            context.fill(bar(0, 1), with: .color(track))
            for band in bands {
                let active = working && progress >= band.start && progress < band.end
                let opacity = band.off ? 0.15 : (active ? 0.7 : 0.4)
                context.fill(bar(band.start, band.end), with: .color(primary.opacity(opacity)))
            }
            let radius: CGFloat = 4
            let x = min(max(progress * size.width, radius), size.width - radius)
            context.fill(Path(ellipseIn: CGRect(x: x - radius, y: size.height / 2 - radius, width: radius * 2, height: radius * 2)),
                         with: .color(dot))
        }
        .frame(height: 10)
        .accessibilityHidden(true)
    }
}
