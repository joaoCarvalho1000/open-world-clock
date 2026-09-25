import SwiftUI
import WorldClockCore

/// Equirectangular projection of `WorldLand` (lat 75N...58S) with a movable center longitude
/// (`WorldMap.pickCenter(longitudes:)` keeps the seam away from the cities).
struct MapProjection {
    let land: WorldLand
    let center: Double

    func fitted(to size: CGSize) -> MapFrame {
        let width = CGFloat(land.width)
        let height = CGFloat(land.height)
        let scale = max(0.0001, min(size.width / width, size.height / height))
        let origin = CGPoint(x: (size.width - width * scale) / 2, y: (size.height - height * scale) / 2)
        return MapFrame(land: land, center: center, scale: scale, origin: origin)
    }
}

/// A projection fitted into a view: land units -> points.
struct MapFrame {
    let land: WorldLand
    let center: Double
    let scale: CGFloat
    let origin: CGPoint

    /// Land units per degree (3600 / 360 horizontally, 1330 / 133 vertically).
    var unitsPerLng: Double { land.width / 360 }
    var unitsPerLat: Double { land.height / max(1, land.north - land.south) }

    func point(lat: Double, lng: Double) -> CGPoint {
        let p = land.point(lat: lat, lng: WorldMap.wrapLng(lng - center))
        return CGPoint(x: origin.x + CGFloat(p.x) * scale, y: origin.y + CGFloat(p.y) * scale)
    }

    func coordinate(x: CGFloat, y: CGFloat) -> (lat: Double, lng: Double) {
        let lng = WorldMap.wrapLng(Double((x - origin.x) / scale) / unitsPerLng - 180 + center)
        let lat = land.north - Double((y - origin.y) / scale) / unitsPerLat
        return (lat, lng)
    }

    /// Transform for the land path, copy `k` (-1, 0, 1) of the wrapped world.
    func landTransform(copy k: Int) -> CGAffineTransform {
        let dx = origin.x + CGFloat(Double(k) * land.width - center * unitsPerLng) * scale
        return CGAffineTransform(translationX: dx, y: origin.y).scaledBy(x: scale, y: scale)
    }
}

/// Map colors from the core palette (map.css meaning: light land = day, navy shade = night, accent = home).
struct MapStyle {
    let dark: Bool
    let ocean: Color
    let oceanTint: Color
    let land: Color
    let coast: Color
    let equator: Color
    let night: Color
    let nightMax: Double
    /// Home and source dots.
    let accent: Color
    /// Home and source pill text (at least 4.5:1, `Palette.accentText`).
    let accentText: Color
    let dayDot: Color
    let nightDot: Color
    let dotRing: Color
    let sun = Color(red: 1.0, green: 0.84, blue: 0.36)
    let sunHalo = Color(red: 1.0, green: 0.82, blue: 0.3).opacity(0.35)
    let sunGlow: Color

    init(dark: Bool, highContrast: Bool) {
        self.dark = dark
        ocean = Color(Palette.canvas(dark: dark))
        oceanTint = dark ? Color.black.opacity(0.12) : Color.blue.opacity(0.07)
        land = Color.opaque(Palette.dayCard(dark: dark))
        coast = Color(Palette.dayText(dark: dark)).opacity(highContrast ? 0.5 : 0.18)
        equator = Color(Palette.dayText(dark: dark)).opacity(0.12)
        night = Color.opaque(Palette.nightCard(dark: dark))
        nightMax = dark ? 0.78 : 0.54
        accent = Color(Palette.accent(dark: dark))
        accentText = Color(Palette.accentText(dark: dark, night: false))
        dayDot = Color(Palette.dayText(dark: false))
        nightDot = Color(Palette.nightText(dark: false))
        dotRing = dark ? Color.opaque(Palette.nightCard(dark: true)) : Color.white
        sunGlow = Color(red: 1.0, green: 0.95, blue: 0.7).opacity(dark ? 0.18 : 0.5)
    }
}

/// Land outline parsed once from `WorldLand.shared.commands` (land-unit coordinates).
@MainActor
enum LandShape {
    static let path: Path = {
        var path = Path()
        for command in WorldLand.shared.commands {
            switch command {
            case let .move(x, y): path.move(to: CGPoint(x: x, y: y))
            case let .line(x, y): path.addLine(to: CGPoint(x: x, y: y))
            case .close: path.closeSubpath()
            }
        }
        return path
    }()
}

enum MapPainter {
    /// `night`: the pre-rendered night layer for this minute and size (NightLayerCache); drawn live when nil.
    static func paint(_ context: inout GraphicsContext, size: CGSize, frame: MapFrame, landPath: Path,
                      subsolar: Coordinate, night: Image?, style: MapStyle) {
        let bounds = CGRect(origin: .zero, size: size)
        context.fill(Path(bounds), with: .color(style.ocean))
        context.fill(Path(bounds), with: .color(style.oceanTint))

        for k in -1...1 {
            let shape = landPath.applying(frame.landTransform(copy: k))
            context.fill(shape, with: .color(style.land))
            context.stroke(shape, with: .color(style.coast), lineWidth: 0.6)
        }

        let equatorY = frame.point(lat: 0, lng: 0).y
        var equator = Path()
        equator.move(to: CGPoint(x: 0, y: equatorY))
        equator.addLine(to: CGPoint(x: size.width, y: equatorY))
        context.stroke(equator, with: .color(style.equator), style: StrokeStyle(lineWidth: 1, dash: [2, 5]))

        if let night {
            context.draw(night, in: bounds)
        } else {
            paintNight(&context, size: size, frame: frame, subsolar: subsolar, style: style)
        }
        paintSun(&context, frame: frame, subsolar: subsolar, style: style)
    }

    /// Night shading sampled on a coarse grid, blurred into a soft twilight band (map.js drawNight).
    static func paintNight(_ context: inout GraphicsContext, size: CGSize, frame: MapFrame,
                           subsolar: Coordinate, style: MapStyle) {
        let cell = max(4, (size.width / 110).rounded())
        context.drawLayer { layer in
            layer.addFilter(.blur(radius: cell * 0.9))
            var y: CGFloat = -cell
            while y < size.height + cell {
                var x: CGFloat = -cell
                while x < size.width + cell {
                    let c = frame.coordinate(x: x + cell / 2, y: y + cell / 2)
                    let altitude = WorldMap.altitude(lat: c.lat, lng: c.lng, subsolar: subsolar)
                    let alpha = WorldMap.nightAlpha(altitude: altitude) * style.nightMax
                    if alpha > 0.004 {
                        layer.fill(Path(CGRect(x: x, y: y, width: cell + 0.5, height: cell + 0.5)),
                                   with: .color(style.night.opacity(alpha)))
                    }
                    x += cell
                }
                y += cell
            }
        }
    }

    private static func paintSun(_ context: inout GraphicsContext, frame: MapFrame, subsolar: Coordinate, style: MapStyle) {
        let center = frame.point(lat: subsolar.lat, lng: subsolar.lng)
        func circle(_ radius: CGFloat) -> Path {
            Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
        }
        context.fill(circle(34), with: .radialGradient(Gradient(colors: [style.sunGlow, style.sunGlow.opacity(0)]),
                                                      center: center, startRadius: 0, endRadius: 34))
        context.fill(circle(10), with: .color(style.sunHalo))
        context.fill(circle(6), with: .color(style.sun))
    }
}

/// The blurred night layer rasterized once per displayed minute and map size, so redraws within the same
/// minute (converter edits, list updates) and scrubbing back and forth over recent steps skip both the
/// altitude grid and the blur. Rendered at 1x: the layer is a soft blur, extra pixels add nothing.
@MainActor
enum NightLayerCache {
    private struct Key: Hashable {
        let minute: Int
        let width: Int          // points x 2 (half-point precision)
        let height: Int
        let center: Double
        let dark: Bool
        let nightMax: Double
    }

    private static var images: [Key: Image] = [:]
    private static var order: [Key] = []
    private static let capacity = 16

    static func image(minute: Int, size: CGSize, frame: MapFrame, subsolar: Coordinate, style: MapStyle) -> Image? {
        guard size.width >= 1, size.height >= 1 else { return nil }
        let key = Key(minute: minute, width: Int((size.width * 2).rounded()), height: Int((size.height * 2).rounded()),
                      center: frame.center, dark: style.dark, nightMax: style.nightMax)
        if let cached = images[key] {
            if let i = order.firstIndex(of: key) { order.remove(at: i); order.append(key) }
            return cached
        }
        let layer = Canvas { context, canvasSize in
            MapPainter.paintNight(&context, size: canvasSize, frame: frame, subsolar: subsolar, style: style)
        }
        .frame(width: size.width, height: size.height)
        let renderer = ImageRenderer(content: layer)
        renderer.scale = 1
        renderer.isOpaque = false
        guard let cgImage = renderer.cgImage else { return nil }
        let image = Image(decorative: cgImage, scale: 1).interpolation(.medium)
        images[key] = image
        order.append(key)
        if order.count > capacity { images[order.removeFirst()] = nil }
        return image
    }
}
