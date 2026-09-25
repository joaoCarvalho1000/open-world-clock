import Foundation
import WorldClockCore

extension AppModel {
    /// Plain-text summary for the clipboard, same line format as app.js copyLines:
    ///   When it is 9:00 AM in Lisbon:
    ///   9:00 AM Lisbon · Wed, Sep 23
    ///   5:00 PM Tokyo · Wed, Sep 23
    func copyText(onlyZone: String?, now: Date) -> String {
        let date = conversion?.instant ?? now
        let refZone = conversion?.zone ?? homeZone
        let header: String
        if let conversion {
            header = L10n.tr("copy.header", ["time": WCFormat.formatTime(conversion.time, hour12: hour12),
                                             "city": label(conversion.zone)])
        } else {
            header = L10n.tr("copy.header", ["time": WCFormat.timeText(homeZone, at: date, hour12: hour12),
                                             "city": label(homeZone)])
        }
        let zones = displayZones.filter { onlyZone == nil || $0 == onlyZone }
        let lines = zones.map { zone -> String in
            let time = WCFormat.timeText(zone, at: date, hour12: hour12)
            let day = WCFormat.shortDateText(zone, at: date)
            let marker = WCFormat.dayMarker(TimeMath.dayDiff(zone, at: date, relativeTo: refZone))
            return "\(time) \(label(zone)) · \(day)" + (marker.isEmpty ? "" : " \(marker)")
        }
        return ([header] + lines).joined(separator: "\n")
    }
}
