import SwiftUI
import WorldClockCore

/// Rows of 24 hour cells (work / night / off), a fixed label column, overlap bands and the
/// current-hour marker. Scrolls horizontally; tapping an hour moves the converter there.
///
/// No overlap: the hours where the most cities work (`Planner.partial`) get a dashed band with a fainter fill, so the
/// dash, not only the color, tells it apart from the solid overlap band.
///
/// Accessibility sizes: every row becomes a label above its cells (the label stays pinned to the leading edge
/// while the hours scroll) and overlap hours are outlined per cell instead of by one band across rows.
/// VoiceOver: cells inside an overlap (or the best partial hours) say so, and an "Overlap" rotor jumps between
/// overlap runs, or between the partial runs when there is no overlap.
struct PlannerGrid: View {
    let plan: PlannerResult
    /// Best partial slot; only set when `plan` has no overlap.
    let partial: PlannerPartial?
    let source: String
    let day: CivilDate
    let now: Date

    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor
    @ScaledMetric(relativeTo: .caption) var cellWidth: CGFloat = 44
    @ScaledMetric(relativeTo: .caption) var rowHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .caption) var headerHeight: CGFloat = 22
    @ScaledMetric(relativeTo: .subheadline) var labelWidth: CGFloat = 116
    @State private var availableWidth: CGFloat = 0
    @Namespace private var rotorNamespace

    let spacing: CGFloat = 6

    private var stacked: Bool { typeSize.isAccessibilitySize }

    /// Bands marked on the grid: overlap runs, or the best partial runs when there is no overlap.
    private struct Marks {
        let overlap: Set<Int>
        let partial: Set<Int>
    }

    var body: some View {
        let instant = model.conversion?.instant ?? now
        let wall = TimeMath.wallClock(source, at: instant)
        let sameDay = CivilDate(wall) == day
        let marker: Double? = sameDay ? Double(wall.hour) + Double(wall.minute) / 60 : nil
        let selectedHour: Int? = model.conversion != nil && sameDay ? wall.hour : nil
        let marks = Marks(overlap: Set(plan.runs.flatMap { $0.start..<$0.end }),
                          partial: Set((partial?.runs ?? []).flatMap { $0.start..<$0.end }))

        Group {
            if stacked {
                stackedLayout(instant: instant, marker: marker, selectedHour: selectedHour, marks: marks)
            } else {
                columnLayout(instant: instant, marker: marker, selectedHour: selectedHour, marks: marks)
            }
        }
        .background {
            GeometryReader { proxy in
                Color.clear
                    .onAppear { availableWidth = proxy.size.width }
                    .onChange(of: proxy.size.width) { _, width in availableWidth = width }
            }
        }
        .accessibilityRotor(L10n.tr("plan.legend.overlap")) {
            ForEach(rotorRuns, id: \.self) { run in
                AccessibilityRotorEntry(rotorLabel(run), id: run.start, in: rotorNamespace)
            }
        }
    }

    /// Overlap runs, else the partial runs.
    private var rotorRuns: [PlannerRun] { plan.runs.isEmpty ? (partial?.runs ?? []) : plan.runs }

    /// "Best: 4 of 5 working", nil without a partial slot.
    private var partialText: String? {
        partial.map { L10n.tr("plan.partial", ["n": String($0.working), "total": String($0.total)]) }
    }

    /// "9:00 AM to 12:00 PM", or "Best: 4 of 5 working · 1:00 PM to 2:00 PM" for a partial run (the summary text).
    private func rotorLabel(_ run: PlannerRun) -> String {
        guard plan.runs.isEmpty, let partialText else { return runLabel(run) }
        return "\(partialText) · \(runLabel(run))"
    }

    // MARK: Layouts

    /// Label column + one horizontally scrolling grid (regular text sizes).
    private func columnLayout(instant: Date, marker: Double?, selectedHour: Int?, marks: Marks) -> some View {
        // The label column never takes more than about a third of the width, so hours stay visible.
        let labelColumn = availableWidth > 0 ? min(labelWidth, availableWidth * 0.35) : labelWidth
        return HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: spacing) {
                Color.clear.frame(height: headerHeight)
                ForEach(plan.rows, id: \.zone) { row in
                    rowLabel(row, instant: instant)
                        .frame(maxWidth: .infinity, minHeight: rowHeight, alignment: .leading)
                }
            }
            .frame(width: labelColumn)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: spacing) {
                        header
                        ForEach(Array(plan.rows.enumerated()), id: \.element.zone) { index, row in
                            cells(row, first: index == 0, selectedHour: selectedHour, marks: marks)
                        }
                    }
                    .overlay(alignment: .topLeading) { overlays(marker: marker) }
                    .padding(.trailing, 4)
                }
                .onAppear { proxy.scrollTo(max(0, (selectedHour ?? marker.map { Int($0) } ?? 9) - 2), anchor: .leading) }
            }
        }
    }

    /// Accessibility sizes: each row is its label above its cells, all rows in one horizontal scroll.
    private func stackedLayout(instant: Date, marker: Double?, selectedHour: Int?, marks: Marks) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: spacing * 2) {
                    header
                    ForEach(Array(plan.rows.enumerated()), id: \.element.zone) { index, row in
                        VStack(alignment: .leading, spacing: 4) {
                            rowLabel(row, instant: instant)
                                .frame(width: max(0, availableWidth - 8), alignment: .leading)
                                // Keep the label on screen while the hours scroll under it.
                                .visualEffect { content, geometry in
                                    content.offset(x: -min(0, geometry.frame(in: .scrollView).minX))
                                }
                            cells(row, first: index == 0, selectedHour: selectedHour, marks: marks)
                        }
                    }
                }
                .padding(.trailing, 4)
            }
            .onAppear { proxy.scrollTo(max(0, (selectedHour ?? marker.map { Int($0) } ?? 9) - 1), anchor: .leading) }
        }
    }

    // MARK: Row label

    private func rowLabel(_ row: PlannerRow, instant: Date) -> some View {
        let city = model.label(row.zone)
        return Button {
            model.sheet = .hours(row.zone)
        } label: {
            VStack(alignment: .leading, spacing: 1) {
                Text(city)
                    .font(.subheadline.weight(row.zone == source ? .semibold : .medium))
                    .foregroundStyle(row.zone == model.homeZone ? Color(Palette.accentText(dark: scheme == .dark, night: false)) : Color.primary)
                    .lineLimit(stacked ? nil : 1)
                    .minimumScaleFactor(stacked ? 1 : 0.75)
                Text(WCFormat.timeText(row.zone, at: instant, hour12: model.hour12))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .fixedSize(horizontal: false, vertical: true)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr("plan.edit", ["city": city]))
        // Voice Control: say the visible city name.
        .accessibilityInputLabels([Text(verbatim: city), Text(L10n.tr("plan.edit", ["city": city]))])
    }

    // MARK: Hour grid

    private var header: some View {
        HStack(spacing: 0) {
            ForEach(0..<24, id: \.self) { hour in
                Text(hourLabel(hour: hour, minute: 0, zone: source, column: hour))
                    .font(.caption2.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(width: cellWidth, height: headerHeight)
                    .id(hour)
            }
        }
        .accessibilityHidden(true)
    }

    private func cells(_ row: PlannerRow, first: Bool, selectedHour: Int?, marks: Marks) -> some View {
        HStack(spacing: 0) {
            ForEach(0..<min(24, row.cells.count, row.localTimes.count), id: \.self) { hour in
                let view = cell(row, hour: hour, selected: hour == selectedHour, overlap: marks.overlap.contains(hour),
                                partial: marks.partial.contains(hour))
                if first {
                    // Rotor targets: overlap (or partial) runs start on the first row.
                    view.accessibilityRotorEntry(id: hour, in: rotorNamespace)
                } else {
                    view
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(model.label(row.zone))
    }

    private func cell(_ row: PlannerRow, hour: Int, selected: Bool, overlap: Bool, partial: Bool) -> some View {
        let state = row.cells[hour]
        let local = row.localTimes[hour]
        let dark = scheme == .dark
        let fill: Color
        let text: Color
        switch state {
        case .work:
            fill = contrast == .increased ? Color.opaque(Palette.dayCard(dark: dark)) : Color(Palette.dayCard(dark: dark))
            text = Color(Palette.dayText(dark: dark))
        case .night:
            fill = contrast == .increased ? Color.opaque(Palette.nightCard(dark: dark)) : Color(Palette.nightCard(dark: dark))
            text = Color(Palette.secondaryText(night: true, dark: dark))
        case .off:
            fill = Color.primary.opacity(0.05)
            text = Color.secondary
        }
        let accent = Color(Palette.accent(dark: dark || state == .night))
        // Working cells barely differ from the canvas by fill alone (1.05:1 light): their outline uses the
        // secondary text color (>= 6.6:1 against canvas and card), WCAG 1.4.11.
        let workStroke = Color(Palette.secondaryText(night: false, dark: dark))
        var a11y = L10n.tr("plan.cell", [
            "time": WCFormat.formatTime(hour: hour, minute: 0, hour12: model.hour12),
            "src": model.label(source),
            "local": WCFormat.formatTime(local, hour12: model.hour12),
            "city": model.label(row.zone),
            "state": L10n.tr("plan.state." + state.rawValue),
        ])
        if overlap {
            a11y += ", " + L10n.tr("plan.legend.overlap")
        } else if partial, let partialText {
            a11y += ", " + partialText
        }
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
        return Button {
            guard plan.columns.indices.contains(hour) else { return }
            model.startConverting(from: source, at: plan.columns[hour])
        } label: {
            Text(hourLabel(hour: local.hour, minute: local.minute, zone: row.zone, column: hour))
                .font(.caption.weight(state == .work ? .semibold : .regular))
                .monospacedDigit()
                .foregroundStyle(text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(width: cellWidth - 2, height: rowHeight)
                .background(fill, in: shape)
                .overlay {
                    if state == .work {
                        shape.strokeBorder(workStroke, lineWidth: differentiateWithoutColor ? 1.5 : 1)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if state == .night && differentiateWithoutColor {
                        Image(systemName: "moon.fill")
                            .font(.system(size: 8, weight: .semibold))
                            .foregroundStyle(text)
                            .padding(3)
                            .accessibilityHidden(true)
                    }
                }
                .overlay {
                    if selected {
                        shape.strokeBorder(accent, lineWidth: 2)
                    } else if overlap && stacked {
                        // Stacked layout has no band across rows: outline each overlap hour instead.
                        shape.strokeBorder(Color(Palette.accent(dark: dark)), style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
                    } else if partial && stacked {
                        // Same marking as the partial band of the column layout: dashed outline, faint fill.
                        shape.fill(Color(Palette.accent(dark: dark)).opacity(0.06))
                            .overlay(shape.strokeBorder(Color(Palette.accent(dark: dark)), style: StrokeStyle(lineWidth: 2, dash: [4, 3])))
                    }
                }
                .frame(width: cellWidth)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(a11y)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// Hour digit like app.js ("9", "14", "9:30"); midnight shows the weekday instead.
    private func hourLabel(hour: Int, minute: Int, zone: String, column: Int) -> String {
        if hour == 0 && minute == 0, plan.columns.indices.contains(column) {
            return WCFormat.weekdayShort(zone, at: plan.columns[column])
        }
        let h = model.hour12 ? (hour % 12 == 0 ? 12 : hour % 12) : hour
        return minute == 0 ? String(h) : "\(h):\(minute < 10 ? "0" : "")\(minute)"
    }

    /// Rotor entry text: "9:00 AM to 12:00 PM".
    private func runLabel(_ run: PlannerRun) -> String {
        L10n.tr("plan.range", [
            "start": WCFormat.formatTime(hour: run.start, minute: 0, hour12: model.hour12),
            "end": WCFormat.formatTime(hour: run.end % 24, minute: 0, hour12: model.hour12),
        ])
    }

    // MARK: Overlays

    private func overlays(marker: Double?) -> some View {
        let accent = Color(Palette.accent(dark: scheme == .dark))
        let rowsHeight = CGFloat(plan.rows.count) * rowHeight + CGFloat(max(0, plan.rows.count - 1)) * spacing
        return ZStack(alignment: .topLeading) {
            ForEach(plan.runs, id: \.self) { run in
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(accent.opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(accent, lineWidth: 2))
                    .frame(width: CGFloat(run.hours) * cellWidth, height: rowsHeight + 8)
                    .offset(x: CGFloat(run.start) * cellWidth, y: headerHeight + spacing - 4)
            }
            // No overlap: the best partial hours, dashed and fainter (the dash also works without color).
            ForEach(partial?.runs ?? [], id: \.self) { run in
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(accent.opacity(0.06))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(accent, style: StrokeStyle(lineWidth: 2, dash: [4, 3])))
                    .frame(width: CGFloat(run.hours) * cellWidth, height: rowsHeight + 8)
                    .offset(x: CGFloat(run.start) * cellWidth, y: headerHeight + spacing - 4)
            }
            if let marker {
                Capsule()
                    .fill(model.conversion != nil ? accent : Color.primary.opacity(0.7))
                    .frame(width: 2, height: rowsHeight + headerHeight + spacing)
                    .offset(x: CGFloat(marker) * cellWidth - 1)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
