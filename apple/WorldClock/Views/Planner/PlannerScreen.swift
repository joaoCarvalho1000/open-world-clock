import SwiftUI
import WorldClockCore

/// Meeting planner: 24 hours of the source zone's day, one row per city, overlap highlighted.
struct PlannerScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Counts chip picks that change the day, so the selection tick follows a tap and not a midnight rollover.
    @State private var datePicks = 0

    var body: some View {
        NavigationStack {
            TimelineView(.everyMinute) { timeline in
                ScrollView {
                    content(now: timeline.date)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                }
            }
            .background(CanvasBackground())
            .navigationTitle(L10n.tr("btn.planner"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { SettingsToolbarButton() }
            }
        }
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        let source = model.conversion?.zone ?? model.homeZone
        let sourceToday = CivilDate.today(in: source, now: now)
        let day = model.conversion?.date ?? sourceToday.adding(days: model.plannerDayOffset)
        let zones = model.displayZones
        let plan = Planner.plan(source: source, year: day.year, month: day.month, day: day.day,
                                zones: zones, hours: model.settings.hours)
        // No hour where everyone works: show the hours where the most cities do (dashed band), not a bare "No overlap".
        // Ties go to the hours where home and the source work, then to fewer cities at night (Windows bestHours).
        let partial = Planner.partial(plan, prefer: [model.homeZone, source])
        let accent = Color(Palette.accent(dark: scheme == .dark))
        let accentText = Color(Palette.accentText(dark: scheme == .dark, night: false))

        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(summary(plan, partial: partial, source: source, empty: zones.isEmpty))
                    .font(.title3.weight(.semibold))
                    // The accent stays reserved for a real overlap.
                    .foregroundStyle(plan.totalHours > 0 ? accentText : Color.primary)
                    .contentTransition(.opacity)
                Text(L10n.tr("plan.caption", ["city": model.label(source), "date": day.label]))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .animation(Motion.animation(.smooth, reduce: reduceMotion), value: plan.totalHours)

            chips(today: sourceToday, selected: day)

            if let conversion = model.conversion {
                convertingBar(conversion)
            }

            if zones.isEmpty {
                ContentUnavailableView(L10n.tr("plan.empty"), systemImage: "person.2.badge.gearshape")
            } else {
                PlannerGrid(plan: plan, partial: partial, source: source, day: day, now: now)
                legend(accent: accent, partial: partial != nil)
            }
        }
    }

    /// "3 h overlap · 9:00 AM to 12:00 PM (Lisbon) +1 more" (app.js buildPlanner summary, localized "plan.range").
    /// Without an overlap: "Best: 4 of 5 working · 1:00 PM to 2:00 PM (São Paulo)" (Planner.partial), else "No overlap".
    private func summary(_ plan: PlannerResult, partial: PlannerPartial?, source: String, empty: Bool) -> String {
        if empty { return L10n.tr("plan.empty") }
        if let best = plan.best, plan.totalHours > 0 {
            var text = "\(L10n.tr("plan.overlap", ["n": String(plan.totalHours)])) · \(rangeText(best)) (\(model.label(source)))"
            if plan.runs.count > 1 { text += " " + L10n.tr("plan.more", ["n": String(plan.runs.count - 1)]) }
            return text
        }
        guard let partial else { return L10n.tr("plan.none") }
        let best = L10n.tr("plan.partial", ["n": String(partial.working), "total": String(partial.total)])
        var text = "\(best) · \(rangeText(partial.best)) (\(model.label(source)))"
        if partial.runs.count > 1 { text += " " + L10n.tr("plan.more", ["n": String(partial.runs.count - 1)]) }
        return text
    }

    /// "9:00 AM to 12:00 PM" for a run of source-zone hours.
    private func rangeText(_ run: PlannerRun) -> String {
        let from = WCFormat.formatTime(hour: run.start, minute: 0, hour12: model.hour12)
        let to = WCFormat.formatTime(hour: run.end % 24, minute: 0, hour12: model.hour12)
        return L10n.tr("plan.range", ["start": from, "end": to])
    }

    /// Date chips: 0 = today in the source zone. Converting moves the converter's date instead.
    private func chips(today: CivilDate, selected: CivilDate) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(0..<7, id: \.self) { offset in
                    let day = today.adding(days: offset)
                    let isSelected = day == selected
                    let text = day.chipLabel(offset: offset)
                    Button(text) {
                        if !isSelected { datePicks += 1 }
                        withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) {
                            if model.conversion != nil { model.setConversionDate(day) } else { model.plannerDayOffset = offset }
                        }
                        // The grid below changes silently; say which day is now planned.
                        let source = model.conversion?.zone ?? model.homeZone
                        model.announce(L10n.tr("plan.caption", ["city": model.label(source), "date": day.longLabel]))
                    }
                    .buttonStyle(ChipButtonStyle(selected: isSelected))
                    .accessibilityLabel(day.longLabel)
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                    .accessibilityInputLabels([Text(verbatim: text), Text(verbatim: day.longLabel)])
                }
            }
        }
        .scrollClipDisabled()
        .sensoryFeedback(.selection, trigger: datePicks)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.tr("dates.aria"))
    }

    private func convertingBar(_ conversion: Conversion) -> some View {
        HStack(spacing: 10) {
            Text(L10n.tr("hint.when", ["time": WCFormat.formatTime(conversion.time, hour12: model.hour12),
                                       "city": model.label(conversion.zone)]))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 8)
            Button(L10n.tr("conv.now")) {
                withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) { model.stopConverting() }
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .prominentAccent(scheme)
            .accessibilityLabel(L10n.tr("conv.clear"))
            .accessibilityInputLabels([Text(L10n.tr("conv.now")), Text(L10n.tr("conv.clear"))])
        }
        .padding(12)
        .panelBackground(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    /// `partial`: the grid shows the dashed best-hours band (no overlap that day), so its swatch replaces the solid
    /// overlap swatch; the legend keeps three items and never needs a second line.
    private func legend(accent: Color, partial: Bool) -> some View {
        let dark = scheme == .dark
        return HStack(spacing: 16) {
            legendItem(Color(Palette.dayCard(dark: dark)), L10n.tr("plan.legend.work"))
            legendItem(Color(Palette.nightCard(dark: dark)), L10n.tr("plan.legend.night"))
            HStack(spacing: 6) {
                if partial {
                    // Same marking as PlannerGrid's partial band: dashed outline, faint fill.
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(accent.opacity(0.06))
                        .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .strokeBorder(accent, style: StrokeStyle(lineWidth: 2, dash: [4, 3])))
                        .frame(width: 18, height: 12)
                    Text(L10n.tr("plan.legend.best"))
                } else {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(accent, lineWidth: 2)
                        .frame(width: 18, height: 12)
                    Text(L10n.tr("plan.legend.overlap"))
                }
            }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
    }

    private func legendItem(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(color)
                .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(Color.primary.opacity(0.15), lineWidth: 0.5))
                .frame(width: 18, height: 12)
            Text(text)
        }
    }
}
