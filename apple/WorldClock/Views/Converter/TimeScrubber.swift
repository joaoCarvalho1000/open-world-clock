import SwiftUI
import WorldClockCore

/// Horizontal time wheel: 15-minute detents with a selection haptic on each user-driven step, momentum
/// scrolling, hour labels in the source zone and a VoiceOver adjustable action (+/- 15 min).
///
/// Feedback-loop guard: the wheel writes the converter (user scrolls) and the converter moves the wheel
/// (typed time, date chips, VoiceOver). A user scroll commits on every detent it crosses, on every iOS version,
/// so the clocks move with the finger. Position updates caused by our own programmatic scrolls are ignored
/// while they animate, and on iOS 18+ `follow` also stands still while the user is dragging or flinging, except
/// for a change that did not come from the wheel (a date chip or a typed time during a fling): that one wins and
/// the wheel moves to it.
struct TimeScrubber: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .caption2) private var height: CGFloat = 58
    /// Width of one 15-minute step (one hour = 4 steps); grows with Dynamic Type, capped so the wheel stays usable.
    @ScaledMetric(relativeTo: .caption2) private var scaledStep: CGFloat = 14
    @State private var position: Int?
    /// True while a programmatic scroll (follow / initial placement) is in flight.
    @State private var programmaticScroll = false
    /// iOS 18+: the user is dragging or the wheel is decelerating from a user fling (`follow` skips while set).
    @State private var userScrolling = false
    /// Detent of the converter right after the wheel's last commit, so `follow` can tell the wheel's own changes from
    /// a date chip or a typed time that arrives during a fling.
    @State private var lastCommit: Int?

    private var step: CGFloat { min(28, scaledStep) }

    var body: some View {
        if let conversion = model.conversion, let anchor = model.scrubAnchor {
            let labelEvery = typeSize.isAccessibilitySize ? 3 : 1   // hours between labels (large labels would overlap)
            GeometryReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 0) {
                        ForEach(ScrubAnchor.range, id: \.self) { index in
                            ScrubTick(anchor: anchor, index: index, width: step, hour12: model.hour12, labelEvery: labelEvery)
                        }
                    }
                    .scrollTargetLayout()
                }
                .contentMargins(.horizontal, max(0, (proxy.size.width - step) / 2), for: .scrollContent)
                .scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: $position, anchor: .center)
                .modifier(UserScrollPhase(userScrolling: $userScrolling) { commit(position) })
                .mask { edgeFade }
                .overlay(alignment: .top) { indicator }
            }
            .frame(height: height)
            .id(anchor)
            .task(id: anchor) {
                // Runs once the (re)built scroll view exists: re-set the binding so it lands on the detent.
                // A new anchor (a date chip outside the range) rebuilds the wheel mid-fling: the old scroll view never
                // reports .idle, so clear the fling state here or `follow` would stay blocked.
                userScrolling = false
                lastCommit = nil
                guard let instant = model.conversion?.instant else { return }
                programmaticScroll = true
                position = nil
                await Task.yield()
                scroll(to: anchor.index(for: instant), animated: false)
            }
            .onChange(of: position) { _, index in
                guard !programmaticScroll else { return }
                // Every detent a user scroll crosses moves the converter (UserScrollPhase adds a final settle on iOS 18+).
                commit(index)
            }
            .onChange(of: conversion.instant) { _, instant in follow(instant) }
            .sensoryFeedback(.selection, trigger: position) { old, new in
                old != nil && new != nil && !programmaticScroll
            }
            .accessibilityElement()
            .accessibilityLabel(Text(verbatim: "\(L10n.tr("conv.sliderAria")), \(model.label(conversion.zone))"))
            .accessibilityValue(accessibilityValue(conversion))
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: model.scrub(byMinutes: 15)
                case .decrement: model.scrub(byMinutes: -15)
                @unknown default: break
                }
            }
            // Whole-hour jumps without 4 swipes each ("+1 h" / "−1 h", same text as the widget button).
            .accessibilityAction(named: Text(verbatim: WCFormat.shiftText(60))) { model.scrub(byMinutes: 60) }
            .accessibilityAction(named: Text(verbatim: WCFormat.shiftText(-60))) { model.scrub(byMinutes: -60) }
        }
    }

    private var indicator: some View {
        Capsule()
            .fill(Color(Palette.accent(dark: scheme == .dark)))
            .frame(width: 3, height: height * 0.5)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private var edgeFade: some View {
        LinearGradient(stops: [
            .init(color: .clear, location: 0),
            .init(color: .black, location: 0.12),
            .init(color: .black, location: 0.88),
            .init(color: .clear, location: 1),
        ], startPoint: .leading, endPoint: .trailing)
    }

    /// A user scroll reached a detent (or came to rest on one): move the converter there (ignored when it
    /// is already the nearest detent, so an off-grid typed time like 9:07 is kept).
    private func commit(_ index: Int?) {
        guard let index, let conversion = model.conversion, let anchor = model.scrubAnchor else { return }
        if anchor.index(for: conversion.instant) != index {
            model.setConversionInstant(anchor.instant(at: index))
            // Where the converter actually landed (a repeated hour at a clock change can move it by 4 detents).
            lastCommit = model.conversion.map { anchor.index(for: $0.instant) }
        }
    }

    /// The converter changed elsewhere (typed time, date chip, VoiceOver): scroll the wheel to it. During a user
    /// scroll only the wheel's own commits are skipped; anything else stops the fling and moves the wheel.
    private func follow(_ instant: Date) {
        guard let anchor = model.scrubAnchor else { return }
        let index = anchor.index(for: instant)
        if userScrolling {
            guard index != lastCommit else { return }
            userScrolling = false
        }
        guard index != position, ScrubAnchor.range.contains(index) else { return }
        scroll(to: index, animated: true)
    }

    /// Moves the wheel without committing or buzzing: `programmaticScroll` stays set until the animation
    /// is logically complete (or, unanimated, until SwiftUI has delivered the position change).
    private func scroll(to index: Int, animated: Bool) {
        programmaticScroll = true
        if animated, let animation = Motion.animation(.snappy, reduce: reduceMotion) {
            withAnimation(animation, completionCriteria: .logicallyComplete) {
                position = index
            } completion: {
                programmaticScroll = false
            }
        } else {
            position = index
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(150))
                programmaticScroll = false
            }
        }
    }

    private func accessibilityValue(_ conversion: Conversion) -> String {
        "\(WCFormat.formatTime(conversion.time, hour12: model.hour12)), \(conversion.date.longLabel)"
    }
}

/// iOS 18+: tracks user-driven scroll phases. `userScrolling` makes `follow` skip programmatic scrolls
/// while the finger or a fling moves the wheel; the per-detent commits happen in `onChange(of: position)`
/// on every iOS version, and `onSettled` commits once more when a user scroll comes to rest (a final settle
/// on the centered detent). Programmatic scrolls report `.animating` and never count as user scrolls.
/// No-op on iOS 17, where `userScrolling` stays false and `follow` relies on its `index != position` guard.
private struct UserScrollPhase: ViewModifier {
    @Binding var userScrolling: Bool
    let onSettled: () -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollPhaseChange { _, phase in
                switch phase {
                case .tracking, .interacting, .decelerating:
                    userScrolling = true
                case .idle:
                    guard userScrolling else { return }
                    userScrolling = false
                    onSettled()
                default:
                    break   // .animating: our own scrollPosition changes
                }
            }
        } else {
            content
        }
    }
}

/// One 15-minute detent: tall tick + label on the hour (every `labelEvery` hours; midnight always), medium on the half hour.
private struct ScrubTick: View {
    let anchor: ScrubAnchor
    let index: Int
    let width: CGFloat
    let hour12: Bool
    let labelEvery: Int

    var body: some View {
        let wall = TimeMath.wallClock(anchor.zone, at: anchor.instant(at: index))
        let onHour = wall.minute == 0
        let labeled = onHour && (wall.hour == 0 || wall.hour % labelEvery == 0)
        VStack(spacing: 4) {
            Rectangle()
                .fill(onHour ? Color.primary.opacity(0.75) : Color.secondary.opacity(wall.minute == 30 ? 0.55 : 0.35))
                .frame(width: onHour ? 2 : 1, height: onHour ? 18 : (wall.minute == 30 ? 12 : 8))
                .frame(maxHeight: 18, alignment: .top)
            Spacer(minLength: 0)
        }
        .frame(width: width)
        .padding(.top, 6)
        .overlay(alignment: .bottom) {
            if labeled {
                Text(label(wall))
                    .font(.caption2.weight(wall.hour == 0 ? .bold : .medium))
                    .monospacedDigit()
                    .foregroundStyle(wall.hour == 0 ? Color.primary : Color.secondary)
                    .fixedSize()
            }
        }
    }

    private func label(_ wall: WallClock) -> String {
        if wall.hour == 0 {
            return WCFormat.calendarWeekdayShort(year: wall.year, month: wall.month, day: wall.day)
        }
        if hour12 {
            return "\(wall.hour % 12 == 0 ? 12 : wall.hour % 12)"
        }
        return String(wall.hour)
    }
}
