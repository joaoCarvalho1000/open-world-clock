import Foundation

/// Widget timeline helper.
public enum TimelineDates {
    /// Minute boundaries from the start of the minute containing `from` (inclusive), `minutes` of them,
    /// merged with every sunrise/sunset of `zones` inside that window (deduplicated to the second, sorted).
    /// The window is (start, start + minutes * 60 s].
    public static func entries(from: Date, minutes: Int, zones: [String], catalog: ZoneCatalog = .shared) -> [Date] {
        guard minutes > 0 else { return [] }
        let start = (from.timeIntervalSince1970 / 60).rounded(.down) * 60
        let end = start + Double(minutes) * 60
        var seconds = Set<Int64>()
        for i in 0..<minutes { seconds.insert(Int64(start) + Int64(i) * 60) }
        var seenCoords = Set<Coordinate>()
        for zone in zones {
            guard let c = catalog.coordinate(of: zone), seenCoords.insert(c).inserted else { continue }
            for ev in Sun.events(for: c, from: Date(timeIntervalSince1970: start), until: Date(timeIntervalSince1970: end)) {
                seconds.insert(Int64(ev.date.timeIntervalSince1970.rounded(.down)))
            }
        }
        return seconds.sorted().map { Date(timeIntervalSince1970: TimeInterval($0)) }
    }
}
