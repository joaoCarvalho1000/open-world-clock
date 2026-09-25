import Accessibility
import SwiftUI
import WidgetKit
import WorldClockCore

// Colors come from the shared bridge in apple/Shared/Color+RGBA.swift: `Color(_ rgba:)` and `Color.opaque(_:)`
// (widget backgrounds must be opaque: translucent container backgrounds render over an undefined base).

/// Colors for one city's surface: light card = day, navy card = night (core `Sky` + `Palette`).
struct Surface {
    init(city: CitySnapshot, dark: Bool) {
        self.init(sky: city.sky, night: city.isNightSurface, dark: dark)
    }

    let top: Color
    let bottom: Color
    let text: Color
    let secondary: Color
    /// Strokes and dots (the day line's "now" dot while shifted).
    let accent: Color
    /// Accent for text and glyphs on this surface (at least 4.5:1, `Palette.accentText`).
    let accentText: Color

    /// `night` picks the text family (navy surface = !Sun.isDay, like app.js `is-night`); `sky` only picks the gradient.
    init(sky: SkyPhase, night: Bool, dark: Bool) {
        let gradient = Sky.gradient(sky, dark: dark)
        top = Color.opaque(gradient.top)
        bottom = Color.opaque(gradient.bottom)
        text = Color(night ? Palette.nightText(dark: dark) : Palette.dayText(dark: dark))
        secondary = Color(Palette.secondaryText(night: night, dark: dark))
        // On navy surfaces the lighter (dark-theme) blue keeps contrast, like --accent-on-night in style.css.
        accent = Color(Palette.accent(dark: dark || night))
        accentText = Color(Palette.accentText(dark: dark, night: night))
    }

    var gradient: LinearGradient {
        LinearGradient(colors: [top, bottom], startPoint: .top, endPoint: .bottom)
    }

    static func canvas(dark: Bool) -> Color { Color.opaque(Palette.canvas(dark: dark)) }
}

/// How the widget is being drawn right now.
/// `painted` = full color with our background (Home Screen default). Otherwise (StandBy, tinted/clear
/// Home Screen on iOS 18+, Lock Screen) the system removes the background and recolors content, so we
/// fall back to hierarchical styles and mark the digits as the accent group.
struct WidgetLook {
    let painted: Bool
    let dark: Bool

    init(renderingMode: WidgetRenderingMode, showsBackground: Bool, colorScheme: ColorScheme) {
        painted = renderingMode == .fullColor && showsBackground
        dark = colorScheme == .dark
    }

    func primary(_ surface: Surface) -> AnyShapeStyle {
        painted ? AnyShapeStyle(surface.text) : AnyShapeStyle(HierarchicalShapeStyle.primary)
    }

    func secondary(_ surface: Surface) -> AnyShapeStyle {
        painted ? AnyShapeStyle(surface.secondary) : AnyShapeStyle(HierarchicalShapeStyle.secondary)
    }

    /// Digits: accent while the widget is shifted ("+1 h"), otherwise the surface text color.
    func digits(_ surface: Surface, shifted: Bool) -> AnyShapeStyle {
        guard painted else { return AnyShapeStyle(HierarchicalShapeStyle.primary) }
        return AnyShapeStyle(shifted ? surface.accentText : surface.text)
    }

    func accent(_ surface: Surface) -> AnyShapeStyle {
        painted ? AnyShapeStyle(surface.accentText) : AnyShapeStyle(HierarchicalShapeStyle.primary)
    }

    /// Row/card fill: the sky gradient when painted, a faint neutral plate otherwise.
    func rowFill(_ surface: Surface) -> AnyShapeStyle {
        painted ? AnyShapeStyle(surface.gradient) : AnyShapeStyle(Color.primary.opacity(0.1))
    }
}

enum PhaseSymbol {
    static func name(for key: String, asleep: Bool = false) -> String {
        if asleep { return "moon.zzz.fill" }
        switch key {
        case "phase.night": return "moon.stars.fill"
        case "phase.dawn": return "sunrise.fill"
        case "phase.golden": return "sun.haze.fill"
        case "phase.dusk": return "sunset.fill"
        default: return "sun.max.fill"
        }
    }
}

extension WidgetStrings {
    /// VoiceOver sentence for a city: "Tokyo, Home, 21:05, Night, 8 hours ahead, likely asleep, +1 day".
    func sentence(_ city: CitySnapshot) -> String {
        var parts = [city.name]
        if city.isHome { parts.append(home) }
        parts += [city.timeText, city.phaseText, city.spokenRelative]
        if city.asleep { parts.append(asleep) }
        if let marker = city.dayMarker { parts.append(marker) }
        return parts.joined(separator: ", ")
    }

    /// A VoiceOver label in the app's language (not the system's), prefixed with "In 1 hour:" while shifted,
    /// so a previewed time is never read as the current one.
    func spoken(_ text: String, shifted: Bool = false) -> Text {
        let full = shifted && !shiftPrefix.isEmpty ? "\(shiftPrefix) \(text)" : text
        var attributed = AttributedString(full)
        attributed.accessibilitySpeechLanguage = speechLanguage
        return Text(attributed)
    }

    func spoken(_ city: CitySnapshot, shifted: Bool) -> Text {
        spoken(sentence(city), shifted: shifted)
    }
}
