import SwiftUI
import WorldClockCore

/// Converter controls shown under the cards while converting: source city, typed time, hint,
/// date shortcuts, 15-minute scrubber, Copy and Now.
struct ConverterPanel: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @FocusState private var timeFocused: Bool
    @State private var timeText = ""
    @State private var invalid = false
    @ScaledMetric(relativeTo: .title3) private var fieldWidth: CGFloat = 104

    var body: some View {
        if let conversion = model.conversion {
            panelContent(conversion)
                .padding(14)
                .modifier(LargeTypeScroll(enabled: typeSize >= .accessibility3))
                .panelBackground(RoundedRectangle(cornerRadius: 28, style: .continuous),
                                 shadowOpacity: 0.12, shadowRadius: 18, shadowY: 4)
                .padding(.horizontal, 10)
                .padding(.bottom, 6)
                .onAppear { syncText(conversion.time) }
                .onChange(of: conversion.time) { _, time in
                    if !timeFocused { syncText(time) }
                }
                .onChange(of: model.hour12) { _, _ in
                    if !timeFocused { syncText(conversion.time) }
                }
                .onChange(of: timeFocused) { _, focused in
                    if !focused { commitText() }
                }
                .onChange(of: invalid) { _, isInvalid in
                    // The red outline and hint are visual; say it too.
                    if isInvalid { model.announce(L10n.tr("hint.invalid")) }
                }
        }
    }

    private func panelContent(_ conversion: Conversion) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            let stack = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                : AnyLayout(HStackLayout(spacing: 8))
            stack { controls(conversion) }
            // "Today" (hint wording, date chips) is re-evaluated every minute so it rolls over at midnight.
            TimelineView(.everyMinute) { timeline in
                hint(conversion, now: timeline.date)
            }
            TimelineView(.everyMinute) { timeline in
                DateChipsRow(now: timeline.date)
            }
            TimeScrubber()
        }
    }

    // MARK: Controls

    @ViewBuilder
    private func controls(_ conversion: Conversion) -> some View {
        sourceMenu(conversion)
        HStack(spacing: 8) {
            TextField(L10n.tr("conv.placeholder"), text: $timeText)
                .focused($timeFocused)
                .keyboardType(.numbersAndPunctuation)
                .submitLabel(.done)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .multilineTextAlignment(.center)
                .font(.title3.weight(.medium))
                .monospacedDigit()
                .frame(width: fieldWidth)
                .frame(minHeight: 44)
                .background(Color.primary.opacity(0.07), in: Capsule())
                .overlay(Capsule().strokeBorder(invalid ? Color.red : Color.clear, lineWidth: 1.5))
                .accessibilityLabel(L10n.tr("conv.timeAria"))
                .accessibilityHint(invalid ? L10n.tr("hint.invalid") : "")
                .onSubmit { commitText() }
                .onChange(of: timeText) { _, text in liveParse(text) }
            Spacer(minLength: 0)
            Button {
                model.copyTimes()
            } label: {
                Label(L10n.tr("conv.copyTimes"), systemImage: "doc.on.doc")
                    .labelStyle(.iconOnly)
                    .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityHint(L10n.tr("conv.copyTitle"))
            // Same text Copy puts on the clipboard; it only leaves the device if the user picks a target in the sheet.
            ShareLink(item: model.copyText(onlyZone: nil, now: .now)) {
                Label(L10n.tr("menu.share"), systemImage: "square.and.arrow.up")
                    .labelStyle(.iconOnly)
                    .frame(minWidth: 44, minHeight: 44)
            }
            Button {
                timeFocused = false
                withAnimation(Motion.animation(.snappy, reduce: reduceMotion)) { model.stopConverting() }
            } label: {
                Text(L10n.tr("conv.now"))
                    .fontWeight(.semibold)
                    .frame(minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .prominentAccent(scheme)
            .accessibilityLabel(L10n.tr("conv.clear"))
            .accessibilityHint(L10n.tr("conv.clearTitle"))
            .accessibilityInputLabels([Text(L10n.tr("conv.now")), Text(L10n.tr("conv.clear"))])
        }
    }

    private func sourceMenu(_ conversion: Conversion) -> some View {
        let zones = model.displayZones.contains(conversion.zone) ? model.displayZones : [conversion.zone] + model.displayZones
        let selection = Binding<String>(
            get: { model.conversion?.zone ?? conversion.zone },
            set: { zone in model.setConversionSource(zone) })
        let city = model.label(conversion.zone)
        return Menu {
            Picker(L10n.tr("conv.zoneAria"), selection: selection) {
                ForEach(zones, id: \.self) { zone in
                    Text(zone == model.homeZone ? L10n.tr("conv.local", ["city": model.label(zone)]) : model.label(zone))
                        .tag(zone)
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(L10n.tr("conv.in")).foregroundStyle(.secondary)
                Text(city).fontWeight(.semibold).lineLimit(1)
                Image(systemName: "chevron.up.chevron.down").font(.caption.weight(.semibold))
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(L10n.tr("conv.zoneAria"))
        .accessibilityValue(city)
        // Voice Control: the visible text ("in Lisbon") first, then the city alone.
        .accessibilityInputLabels([Text(verbatim: "\(L10n.tr("conv.in")) \(city)"), Text(verbatim: city)])
    }

    private func hint(_ conversion: Conversion, now: Date) -> some View {
        let text: String
        if invalid {
            text = L10n.tr("hint.invalid")
        } else if let flash = model.flash {
            text = flash
        } else {
            let vars = ["time": WCFormat.formatTime(conversion.time, hour12: model.hour12), "city": model.label(conversion.zone)]
            if conversion.date != CivilDate.today(in: conversion.zone, now: now) {
                text = L10n.tr("hint.whenOn", vars.merging(["date": conversion.date.label]) { $1 })
            } else {
                text = L10n.tr("hint.when", vars)
            }
        }
        return Text(text)
            .font(.subheadline)
            .foregroundStyle(invalid ? Color.red : Color.secondary)
            .contentTransition(.opacity)
            .animation(Motion.animation(.smooth, reduce: reduceMotion), value: text)
            .accessibilityAddTraits(.updatesFrequently)
    }

    // MARK: Text field

    private func syncText(_ time: HourMinute) {
        timeText = ParseTime.inputText(time, hour12: model.hour12)
        invalid = false
    }

    /// Like app.js `input` events: apply as soon as the text parses; flag it once it does not.
    private func liveParse(_ text: String) {
        guard timeFocused else { return }
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if let time = ParseTime.parse(trimmed) {
            invalid = false
            if time != model.conversion?.time { model.setConversionTime(time) }
        } else {
            invalid = !trimmed.isEmpty
        }
    }

    private func commitText() {
        if let time = ParseTime.parse(timeText.trimmingCharacters(in: .whitespaces)) {
            model.setConversionTime(time)
            syncText(time)
        } else if let time = model.conversion?.time {
            if timeText.trimmingCharacters(in: .whitespaces).isEmpty { syncText(time) } else { invalid = true }
        }
    }
}

/// Today, Tomorrow, the next five weekdays and a date picker. Counted from today in the converter's
/// source zone (the zone the picked date is read in), so "Tomorrow" is always the source city's tomorrow.
/// `now` comes from a minute timeline so the chips roll over at the source zone's midnight.
/// At accessibility sizes AX3+ the chip strip would be a long sideways scroll; the date picker alone is used instead.
struct DateChipsRow: View {
    let now: Date
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var typeSize
    /// Counts user date picks, so the selection tick follows a chip or picker choice only (a scrub past midnight or a
    /// new source city also moves the date, and the scrubber already ticks on its own).
    @State private var datePicks = 0

    var body: some View {
        Group {
            if let conversion = model.conversion {
                if typeSize >= .accessibility3 {
                    DatePicker(L10n.tr("dates.btn"), selection: dateBinding(conversion), displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .environment(\.timeZone, .gmt)
                        .accessibilityLabel(L10n.tr("dates.aria"))
                } else {
                    chips(conversion)
                }
            }
        }
        .sensoryFeedback(.selection, trigger: datePicks)
    }

    private func chips(_ conversion: Conversion) -> some View {
        let today = CivilDate.today(in: conversion.zone, now: now)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(0..<7, id: \.self) { offset in
                    let day = today.adding(days: offset)
                    let selected = day == conversion.date
                    let text = day.chipLabel(offset: offset)
                    Button(text) { pick(day) }
                        .buttonStyle(ChipButtonStyle(selected: selected))
                        .accessibilityLabel(day.longLabel)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        // Voice Control: the visible chip text first ("Tomorrow"), then the full date.
                        .accessibilityInputLabels([Text(verbatim: text), Text(verbatim: day.longLabel)])
                }
                DatePicker(L10n.tr("dates.btn"), selection: dateBinding(conversion), displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .environment(\.timeZone, .gmt)
                    .accessibilityLabel(L10n.tr("dates.aria"))
            }
            .padding(.vertical, 1)
        }
        .scrollClipDisabled()
    }

    private func dateBinding(_ conversion: Conversion) -> Binding<Date> {
        Binding(
            get: { (model.conversion?.date ?? conversion.date).noonUTC },
            set: { pick(CivilDate(noonUTC: $0)) })
    }

    private func pick(_ day: CivilDate) {
        if day != model.conversion?.date { datePicks += 1 }
        model.setConversionDate(day)
    }
}

/// AX3+ text sizes: the converter panel scrolls inside at most half of the window instead of pushing the
/// cards off screen. Below AX3 it is laid out as-is.
private struct LargeTypeScroll: ViewModifier {
    let enabled: Bool

    func body(content: Content) -> some View {
        if enabled {
            ScrollView(.vertical) { content }
                .scrollBounceBehavior(.basedOnSize)
                .containerRelativeFrame(.vertical, alignment: .bottom) { length, _ in length * 0.5 }
        } else {
            content
        }
    }
}
