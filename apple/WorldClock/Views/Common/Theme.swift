import SwiftUI
import WorldClockCore

/// Colors for one surface (day card, night card) in the current theme, from core `Palette`.
struct SurfaceColors {
    let primary: Color
    let secondary: Color
    /// Strokes, dots and tints.
    let accent: Color
    /// Accent for text on this surface (at least 4.5:1, `Palette.accentText`).
    let accentText: Color
    let hairline: Color

    init(night: Bool, dark: Bool, highContrast: Bool) {
        let fg = night ? Palette.nightText(dark: dark) : Palette.dayText(dark: dark)
        primary = Color(fg)
        secondary = highContrast ? Color(fg) : Color(Palette.secondaryText(night: night, dark: dark))
        // The light-theme accent is too dark on navy; night surfaces use the lighter dark-theme accent.
        accent = Color(Palette.accent(dark: dark || night))
        accentText = Color(Palette.accentText(dark: dark, night: night))
        hairline = Color(fg).opacity(highContrast ? 0.55 : 0.12)
    }
}

enum Motion {
    /// `animation`, or nil when Reduce Motion is on.
    static func animation(_ animation: Animation, reduce: Bool) -> Animation? {
        reduce ? nil : animation
    }
}

/// The pale blue (light) / deep navy (dark) page background.
struct CanvasBackground: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Color(Palette.canvas(dark: scheme == .dark)).ignoresSafeArea()
    }
}

/// Rounded continuous-corner card background: sky gradient that crossfades slowly when the phase changes.
struct CardSurface: View {
    let sky: SkyPhase
    let night: Bool
    var cornerRadius: CGFloat = 24

    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let dark = scheme == .dark
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        let colors = SurfaceColors(night: night, dark: dark, highContrast: contrast == .increased)
        ZStack {
            if contrast == .increased {
                shape.fill(Color.opaque(night ? Palette.nightCard(dark: dark) : Palette.dayCard(dark: dark)))
            } else {
                let stops = Sky.gradient(sky, dark: dark)
                shape
                    .fill(LinearGradient(colors: [Color(stops.top), Color(stops.bottom)], startPoint: .top, endPoint: .bottom))
                    .id(SurfaceKey(sky: sky, dark: dark))
                    .transition(.opacity)
            }
        }
        .animation(Motion.animation(.easeInOut(duration: 1.2), reduce: reduceMotion), value: sky)
        .background(.ultraThinMaterial, in: shape)
        .overlay(shape.strokeBorder(colors.hairline, lineWidth: contrast == .increased ? 1 : 0.5))
        .shadow(color: .black.opacity(dark ? 0.35 : 0.10), radius: 14, x: 0, y: 6)
        // Sky colors carry meaning (day / night); Smart Invert must not flip them.
        .accessibilityIgnoresInvertColors()
    }

    private struct SurfaceKey: Hashable {
        let sky: SkyPhase
        let dark: Bool
    }
}

/// Subtle scale on press (disabled with Reduce Motion).
struct PressableCardStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .animation(Motion.animation(.snappy(duration: 0.22), reduce: reduceMotion), value: configuration.isPressed)
    }
}

/// Capsule chip used for date shortcuts (selected = accent fill with white text). At least 44 pt tall.
struct ChipButtonStyle: ButtonStyle {
    let selected: Bool
    @Environment(\.colorScheme) private var scheme

    func makeBody(configuration: Configuration) -> some View {
        // accentFill, not accent: white text on the regular accent is below 4.5:1.
        let fill = Color(Palette.accentFill(dark: scheme == .dark))
        configuration.label
            .font(.subheadline.weight(selected ? .semibold : .regular))
            .lineLimit(1)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(minHeight: 44)
            .foregroundStyle(selected ? Color.white : Color.primary)
            .background(selected ? fill : Color.primary.opacity(configuration.isPressed ? 0.14 : 0.07), in: Capsule())
            .contentShape(Capsule())
    }
}

extension View {
    /// Prominent (filled, white text) buttons use the deeper accent so the label keeps >= 4.5:1.
    func prominentAccent(_ scheme: ColorScheme) -> some View {
        tint(Color(Palette.accentFill(dark: scheme == .dark)))
    }

    /// Background of a floating panel (converter panel, planner converting bar, toast). iOS 26: Liquid Glass in
    /// `shape`, which brings its own depth, so no shadow. Earlier versions: the regular material plus the panel's
    /// shadow, exactly as before (`shadowOpacity` 0 = no shadow).
    @ViewBuilder
    func panelBackground<S: Shape>(_ shape: S, shadowOpacity: Double = 0, shadowRadius: CGFloat = 0,
                                   shadowY: CGFloat = 0) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: shape)
        } else if shadowOpacity > 0 {
            self.background(.regularMaterial, in: shape)
                .shadow(color: .black.opacity(shadowOpacity), radius: shadowRadius, x: 0, y: shadowY)
        } else {
            self.background(.regularMaterial, in: shape)
        }
    }
}

/// Toolbar button that opens Settings (shared by every tab).
struct SettingsToolbarButton: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Button {
            model.sheet = .settings
        } label: {
            Label(L10n.tr("btn.settings"), systemImage: "gearshape")
        }
    }
}
