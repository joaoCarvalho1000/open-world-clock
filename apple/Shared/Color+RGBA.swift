import SwiftUI
import WorldClockCore

extension Color {
    /// sRGB color from a core palette value (`Palette`, `Sky`).
    init(_ rgba: RGBA) {
        self.init(.sRGB, red: rgba.r, green: rgba.g, blue: rgba.b, opacity: rgba.a)
    }

    /// Same color with the alpha forced to 1 (increased-contrast surfaces).
    static func opaque(_ rgba: RGBA) -> Color {
        Color(RGBA(r: rgba.r, g: rgba.g, b: rgba.b, a: 1))
    }
}
