import Foundation

/// worldclock:// URLs handled by the app (widgets link into these).
public enum DeepLink: Hashable, Sendable {
    /// worldclock://convert?zone=Asia/Tokyo (zone percent-decoded; invalid zone -> nil)
    case convert(zone: String?)
    /// worldclock://planner
    case planner
    /// worldclock://map
    case map
    /// worldclock://settings
    case settings

    static let scheme = "worldclock"

    public init?(url: URL) {
        guard let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
              comps.scheme?.lowercased() == DeepLink.scheme else { return nil }
        // "worldclock://convert" (host) or "worldclock:convert" / "worldclock:///convert" (path).
        var name = (comps.host ?? "").lowercased()
        if name.isEmpty {
            name = comps.path.split(separator: "/").first.map { String($0).lowercased() } ?? ""
        }
        switch name {
        case "convert":
            var zone: String?
            if let raw = comps.queryItems?.first(where: { $0.name == "zone" })?.value {
                let decoded = raw.removingPercentEncoding ?? raw // tolerate double encoding
                zone = ZoneCatalog.shared.isValid(decoded) ? decoded : (ZoneCatalog.shared.isValid(raw) ? raw : nil)
            }
            self = .convert(zone: zone)
        case "planner": self = .planner
        case "map": self = .map
        case "settings": self = .settings
        default: return nil
        }
    }

    /// Unreserved characters plus "/" (legal in a query); everything else, including "+", is percent-encoded.
    private static let zoneAllowed: CharacterSet = {
        var s = CharacterSet()
        s.insert(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~/")
        return s
    }()

    public var url: URL {
        let base = DeepLink.scheme + "://"
        let s: String
        switch self {
        case .convert(let zone):
            if let zone, let enc = zone.addingPercentEncoding(withAllowedCharacters: DeepLink.zoneAllowed) {
                s = base + "convert?zone=" + enc
            } else {
                s = base + "convert"
            }
        case .planner: s = base + "planner"
        case .map: s = base + "map"
        case .settings: s = base + "settings"
        }
        return URL(string: s)!
    }
}
