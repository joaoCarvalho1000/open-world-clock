import Foundation

/// A rectangle in view points, top-left origin (Foundation only: the core does not import CoreGraphics).
public struct MapLabelRect: Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    /// map.js `hit`: strict overlap, so rectangles that only touch along an edge do not intersect.
    public func intersects(_ other: MapLabelRect) -> Bool {
        x < other.x + other.width && other.x < x + width && y < other.y + other.height && other.y < y + height
    }
}

/// One city label to place: the dot center (`x`, `y`) and the size of its pill.
public struct MapLabelItem: Hashable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

/// Where a pill sits relative to its dot, in the order map.js SIDES tries them
/// (right, left, top, bottom, then the four diagonals).
public enum MapLabelSide: String, CaseIterable, Hashable, Sendable {
    case r, l, t, b, tr, tl, br, bl
}

/// A placed pill: `dx`, `dy` offset the pill's top-left corner from the dot center.
public struct MapLabelPlacement: Hashable, Sendable {
    public var side: MapLabelSide
    public var dx: Double
    public var dy: Double

    public init(side: MapLabelSide, dx: Double, dy: Double) {
        self.side = side
        self.dx = dx
        self.dy = dy
    }

    /// The pill's rectangle for `item` (without the collision padding).
    public func rect(for item: MapLabelItem) -> MapLabelRect {
        MapLabelRect(x: item.x + dx, y: item.y + dy, width: item.width, height: item.height)
    }
}

/// Port of src/renderer/views/map.js `offsetFor` and `placeLabels`: greedy, collision-free placement of the
/// city pills. Items are placed in priority order; each tries the sides in `MapLabelSide.allCases` order and
/// takes the first one whose padded rectangle stays inside the bounds (inset by 2) and hits neither a dot nor
/// a pill placed before it. The Windows map keeps a hover position for labels that do not fit; the iPhone
/// has no hover, so those return nil and the city list under the map carries the name and time instead.
public enum MapLabels {
    /// map.js GAP: distance between the dot center and the pill on the straight sides.
    public static let gap: Double = 8
    /// map.js DOT: half the side of the square every dot reserves.
    public static let dot: Double = 5

    /// map.js offsetFor: top-left offset of a `width` x `height` pill from the dot center for `side`.
    public static func offset(for side: MapLabelSide, width: Double, height: Double) -> (dx: Double, dy: Double) {
        let d = gap * 0.7
        switch side {
        case .r: return (gap, -height / 2)
        case .l: return (-gap - width, -height / 2)
        case .t: return (-width / 2, -gap - height)
        case .tr: return (d, -d - height)
        case .tl: return (-d - width, -d - height)
        case .br: return (d, d)
        case .bl: return (-d - width, d)
        case .b: return (-width / 2, gap)
        }
    }

    /// The square a dot reserves (map.js `taken` seed).
    public static func dotRect(x: Double, y: Double) -> MapLabelRect {
        MapLabelRect(x: x - dot, y: y - dot, width: dot * 2, height: dot * 2)
    }

    /// The four `side` x `side` squares in the corners of `bounds`, for `place(blocked:)` when the map is drawn with
    /// rounded corners. 8 pt suits the app's 20 pt continuous corner: a capsule pill that clears these squares (and
    /// the 2 pt edge margin) stays inside the curve.
    public static func corners(of bounds: MapLabelRect, side: Double = 8) -> [MapLabelRect] {
        let right = bounds.x + bounds.width - side, bottom = bounds.y + bounds.height - side
        return [MapLabelRect(x: bounds.x, y: bounds.y, width: side, height: side),
                MapLabelRect(x: right, y: bounds.y, width: side, height: side),
                MapLabelRect(x: bounds.x, y: bottom, width: side, height: side),
                MapLabelRect(x: right, y: bottom, width: side, height: side)]
    }

    /// map.js placeLabels: one result per item, in the same order; nil when no side fits.
    /// `blocked`: extra rectangles no pill may overlap (native only: the app passes the corners its rounded map clips;
    /// map.js has no such list, so parity callers pass none).
    public static func place(items: [MapLabelItem], bounds: MapLabelRect,
                             blocked: [MapLabelRect] = []) -> [MapLabelPlacement?] {
        // Every dot is reserved up front, so a pill never covers any city, including lower-priority ones. The dots keep
        // indexes 0..<items.count (the own-dot check below relies on it); `blocked` follows them.
        var taken = items.map { dotRect(x: $0.x, y: $0.y) } + blocked
        func inside(_ r: MapLabelRect) -> Bool {
            r.x >= bounds.x + 2 && r.y >= bounds.y + 2
                && r.x + r.width <= bounds.x + bounds.width - 2 && r.y + r.height <= bounds.y + bounds.height - 2
        }
        return items.enumerated().map { i, item in
            for side in MapLabelSide.allCases {
                let o = offset(for: side, width: item.width, height: item.height)
                let r = MapLabelRect(x: item.x + o.dx - 2, y: item.y + o.dy - 1, width: item.width + 4, height: item.height + 2)
                if !inside(r) { continue }
                // Index i is this item's own dot; everything else (other dots, placed pills) blocks.
                if taken.indices.contains(where: { $0 != i && r.intersects(taken[$0]) }) { continue }
                taken.append(r)
                return MapLabelPlacement(side: side, dx: o.dx, dy: o.dy)
            }
            return nil
        }
    }
}
