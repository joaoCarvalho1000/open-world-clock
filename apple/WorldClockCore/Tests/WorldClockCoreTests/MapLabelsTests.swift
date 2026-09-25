import Foundation
import XCTest
@testable import WorldClockCore

/// MapLabels is a port of map.js offsetFor / placeLabels. Expected values come from running the real JS:
/// load src/renderer/views/map.js in a node:vm sandbox like test/unit/map.test.js and call
/// `window.WCMap._internals.placeLabels(items, bounds)`.
final class MapLabelsTests: XCTestCase {
    private func sides(_ result: [MapLabelPlacement?]) -> [MapLabelSide?] { result.map { $0?.side } }

    func testOffsetsMatchMapJS() {
        let expected: [MapLabelSide: (Double, Double)] = [
            .r: (8, -10), .l: (-88, -10), .t: (-40, -28), .b: (-40, 8),
            .tr: (5.6, -25.6), .tl: (-85.6, -25.6), .br: (5.6, 5.6), .bl: (-85.6, 5.6),
        ]
        for side in MapLabelSide.allCases {
            let o = MapLabels.offset(for: side, width: 80, height: 20)
            let e = expected[side]!
            XCTAssertEqual(o.dx, e.0, accuracy: 1e-9, "\(side) dx")
            XCTAssertEqual(o.dy, e.1, accuracy: 1e-9, "\(side) dy")
        }
        XCTAssertEqual(MapLabelSide.allCases, [.r, .l, .t, .b, .tr, .tl, .br, .bl], "map.js SIDES order")
    }

    /// The cluster and edge cases of test/unit/map.test.js, with the exact results map.js returns.
    func testMatchesMapJSVectors() {
        let bounds = MapLabelRect(x: 0, y: 0, width: 400, height: 110)
        let cluster = [(100.0, 50.0), (104, 52), (108, 54), (110, 50), (112, 52)].map { MapLabelItem(x: $0.0, y: $0.1, width: 80, height: 20) }
        let res = MapLabels.place(items: cluster, bounds: bounds)
        XCTAssertEqual(res, [
            MapLabelPlacement(side: .l, dx: -88, dy: -10), nil,
            MapLabelPlacement(side: .b, dx: -40, dy: 8),
            MapLabelPlacement(side: .tr, dx: 8 * 0.7, dy: -8 * 0.7 - 20), nil,
        ])
        XCTAssertEqual(sides(MapLabels.place(items: [MapLabelItem(x: 100, y: 50, width: 80, height: 20)], bounds: bounds)), [.r])
        XCTAssertEqual(sides(MapLabels.place(items: [MapLabelItem(x: 390, y: 50, width: 80, height: 20)], bounds: bounds)), [.l])
        XCTAssertEqual(MapLabels.place(items: [], bounds: bounds), [])
    }

    /// iPhone geometry: the map fills 361 pt (393 pt screen minus 16 pt margins) at the land aspect ratio,
    /// projected like MapProjection / MapFrame in the app, centered on `centerZones` (default: the default city list).
    private func iPhonePoints(_ zones: [String], centerZones: [String] = ZoneCatalog.defaultZones,
                              width: Double = 361) -> (points: [String: (x: Double, y: Double)], bounds: MapLabelRect) {
        let land = WorldLand.shared
        let height = width * land.height / land.width
        let coords = centerZones.compactMap { ZoneCatalog.shared.coordinate(of: $0) }
        let center = WorldMap.pickCenter(longitudes: coords.map(\.lng))
        let scale = min(width / land.width, height / land.height)
        let ox = (width - land.width * scale) / 2, oy = (height - land.height * scale) / 2
        var points: [String: (x: Double, y: Double)] = [:]
        for zone in zones {
            guard let c = ZoneCatalog.shared.coordinate(of: zone) else { continue }
            let p = land.point(lat: c.lat, lng: WorldMap.wrapLng(c.lng - center))
            points[zone] = (ox + p.x * scale, oy + p.y * scale)
        }
        return (points, MapLabelRect(x: 0, y: 0, width: width, height: height))
    }

    func testLisbonAndLondonDoNotOverlapOnIPhone() {
        let (points, bounds) = iPhonePoints(["Europe/Lisbon", "Europe/London"])
        let items = ["Europe/Lisbon", "Europe/London"].map { MapLabelItem(x: points[$0]!.x, y: points[$0]!.y, width: 70, height: 17) }
        // The dots are about 9 pt apart horizontally and 13 pt vertically: the old fixed +30 pt pills overlapped.
        XCTAssertLessThan(abs(items[0].x - items[1].x), 12)
        let res = MapLabels.place(items: items, bounds: bounds)
        XCTAssertEqual(res, [MapLabelPlacement(side: .l, dx: -78, dy: -8.5), MapLabelPlacement(side: .r, dx: 8, dy: -8.5)])
        let a = res[0]!.rect(for: items[0]), b = res[1]!.rect(for: items[1])
        XCTAssertFalse(a.intersects(b))
    }

    func testDefaultCityListOnIPhoneMatchesMapJS() {
        let zones = ZoneCatalog.defaultZones
        let (points, bounds) = iPhonePoints(zones)
        let items = zones.map { MapLabelItem(x: points[$0]!.x, y: points[$0]!.y, width: 70, height: 17) }
        XCTAssertEqual(sides(MapLabels.place(items: items, bounds: bounds)), [.b, .t, .b, .r, .l])
    }

    func testDotNearTheRightEdgeGetsTheLeftSide() {
        let bounds = MapLabelRect(x: 0, y: 0, width: 361, height: 133)
        for gap in stride(from: 12.0, through: 60, by: 4) {
            let res = MapLabels.place(items: [MapLabelItem(x: 361 - gap, y: 60, width: 70, height: 17)], bounds: bounds)
            XCTAssertEqual(res.first??.side, .l, "dot \(gap) pt from the right edge")
        }
        // Far from the edge the right side wins.
        XCTAssertEqual(MapLabels.place(items: [MapLabelItem(x: 200, y: 60, width: 70, height: 17)], bounds: bounds).first??.side, .r)
    }

    /// Native only: the app passes the corners of its rounded map as `blocked`, and pills avoid them like dots.
    func testCornerBlocksKeepPillsOutOfTheCorners() {
        let bounds = MapLabelRect(x: 0, y: 0, width: 361, height: 133)
        let corners = MapLabels.corners(of: bounds)
        XCTAssertEqual(corners, [
            MapLabelRect(x: 0, y: 0, width: 8, height: 8), MapLabelRect(x: 353, y: 0, width: 8, height: 8),
            MapLabelRect(x: 0, y: 125, width: 8, height: 8), MapLabelRect(x: 353, y: 125, width: 8, height: 8),
        ])
        // A dot at the top-left edge: the right-side pill (padded rect at 6.5, 2.5) reaches into the corner square,
        // so with the corners blocked it moves below right of the dot instead.
        let edge = [MapLabelItem(x: 0.5, y: 12, width: 70, height: 17)]
        XCTAssertEqual(sides(MapLabels.place(items: edge, bounds: bounds)), [.r])
        XCTAssertEqual(sides(MapLabels.place(items: edge, bounds: bounds, blocked: corners)), [.br])
        // No blocked rectangle: exactly the map.js result (the parity tests above rely on this default).
        let items = [MapLabelItem(x: 100, y: 50, width: 80, height: 20), MapLabelItem(x: 104, y: 52, width: 80, height: 20)]
        XCTAssertEqual(MapLabels.place(items: items, bounds: bounds, blocked: []), MapLabels.place(items: items, bounds: bounds))
        // Blocks away from the pills change nothing, and each item still ignores only its own dot.
        XCTAssertEqual(MapLabels.place(items: items, bounds: bounds, blocked: corners), MapLabels.place(items: items, bounds: bounds))
    }

    func testDenseClusterPlacesHigherPriorityFirst() {
        // Nine western European cities in priority order (home, source, then the list) on the iPhone map:
        // map.js places the first two and Berlin, and hides the rest, including the last city.
        let zones = ["Europe/Lisbon", "Europe/Madrid", "Europe/Paris", "Europe/London", "Europe/Amsterdam",
                     "Europe/Brussels", "Europe/Berlin", "Europe/Zurich", "Europe/Rome"]
        let (points, bounds) = iPhonePoints(zones, centerZones: zones)
        let items = zones.map { MapLabelItem(x: points[$0]!.x, y: points[$0]!.y, width: 70, height: 17) }
        let res = MapLabels.place(items: items, bounds: bounds)
        XCTAssertEqual(sides(res), [.l, .br, nil, nil, nil, nil, .r, nil, nil])
        XCTAssertNotNil(res[0], "the home city is placed first")
        XCTAssertNotNil(res[1], "then the conversion source")
        XCTAssertNil(res.last!, "the last city in a full cluster gets no pill")
        // Same cities in reverse priority (map.js result): Rome now gets a pill and Lisbon moves below its dot.
        let reversed = MapLabels.place(items: Array(items.reversed()), bounds: bounds)
        XCTAssertEqual(sides(Array(reversed.reversed())), [.b, .tl, nil, nil, nil, nil, nil, nil, .r])
    }

    /// mulberry32, the same generator the JS signature below was produced with.
    private struct Mulberry32 {
        var state: UInt32
        mutating func next() -> Double {
            state = state &+ 0x6D2B_79F5
            var t = (state ^ (state >> 15)) &* (state | 1)
            t = (t &+ ((t ^ (t >> 7)) &* (t | 61))) ^ t
            return Double(t ^ (t >> 14)) / 4_294_967_296
        }
    }

    /// 200 seeded random layouts: every placed pill is inside the inset bounds, no two pills overlap and no
    /// pill covers a dot. The side sequence also matches map.js exactly (FNV-1a of the signature), from:
    ///   let a = 20260923; r = mulberry32; per layout W = 280 + floor(r() * 160), H = 100 + floor(r() * 300),
    ///   n = 1 + floor(r() * 12), items { x: r() * W, y: r() * H, w: 40 + floor(r() * 100), h: 14 + floor(r() * 12) };
    ///   signature = sides (or "-") per item, layouts joined by "|".
    func testRandomLayoutsAreCollisionFreeAndMatchMapJS() {
        var rng = Mulberry32(state: 20_260_923)
        var signature = ""
        var placedCount = 0, total = 0
        for layout in 0..<200 {
            let width = 280 + (rng.next() * 160).rounded(.down)
            let height = 100 + (rng.next() * 300).rounded(.down)
            let n = 1 + Int((rng.next() * 12).rounded(.down))
            var items: [MapLabelItem] = []
            for _ in 0..<n {
                let x = rng.next() * width, y = rng.next() * height
                let w = 40 + (rng.next() * 100).rounded(.down), h = 14 + (rng.next() * 12).rounded(.down)
                items.append(MapLabelItem(x: x, y: y, width: w, height: h))
            }
            let bounds = MapLabelRect(x: 0, y: 0, width: width, height: height)
            let res = MapLabels.place(items: items, bounds: bounds)
            XCTAssertEqual(res.count, items.count)
            if layout > 0 { signature += "|" }
            var pills: [(index: Int, rect: MapLabelRect)] = []
            for (i, placement) in res.enumerated() {
                total += 1
                signature += placement?.side.rawValue ?? "-"
                guard let placement else { continue }
                placedCount += 1
                let rect = placement.rect(for: items[i])
                XCTAssertGreaterThanOrEqual(rect.x, 2, "layout \(layout) item \(i)")
                XCTAssertGreaterThanOrEqual(rect.y, 2, "layout \(layout) item \(i)")
                XCTAssertLessThanOrEqual(rect.x + rect.width, width - 2, "layout \(layout) item \(i)")
                XCTAssertLessThanOrEqual(rect.y + rect.height, height - 2, "layout \(layout) item \(i)")
                for (j, other) in items.enumerated() {
                    // Other dots are fully clear; the pill never covers its own dot either.
                    XCTAssertFalse(rect.intersects(MapLabels.dotRect(x: other.x, y: other.y)), "layout \(layout): pill \(i) covers dot \(j)")
                }
                for pill in pills {
                    XCTAssertFalse(rect.intersects(pill.rect), "layout \(layout): pills \(pill.index) and \(i) overlap")
                }
                pills.append((i, rect))
            }
        }
        XCTAssertEqual(total, 1371)
        XCTAssertEqual(placedCount, 1134)
        XCTAssertEqual(signature.count, 1718)
        XCTAssertTrue(signature.hasPrefix("tlttl------|rrlrlrrrr|rb|blbllbblrr-|tbr-bltr-lrlr|"), String(signature.prefix(80)))
        var fnv: UInt32 = 0x811C_9DC5
        for byte in signature.utf8 { fnv = (fnv ^ UInt32(byte)) &* 16_777_619 }
        XCTAssertEqual(fnv, 0x45E1_1DBA, "side sequence differs from map.js")
    }
}
