import Foundation

/// Port of time.js parseTime and app.js formatInput.
///
/// JS regex being emulated (after trim, lower-case, whitespace removal):
///   /^(\d{1,2})(?:[:.h]?(\d{2}))?h?(am|pm|a|p)?$/
/// Hand-written (no NSRegularExpression) with the same backtracking order, so captures match exactly.
public enum ParseTime {
    /// Accepts "9", "09", "930", "9:30", "9.30", "3pm", "3 pm", "3:15pm", "15h", "15h30"; nil if invalid.
    public static func parse(_ text: String) -> HourMinute? {
        let t = Array(text.lowercased().unicodeScalars.filter { !isJSWhitespace($0) })
        if t.isEmpty { return nil }
        guard let m = match(t) else { return nil }
        var h = m.hour
        let mi = m.minute ?? 0
        if mi > 59 { return nil }
        if let ap = m.ampm {
            if h < 1 || h > 12 { return nil }
            h = h % 12 + (ap.hasPrefix("p") ? 12 : 0)
        } else if h > 23 {
            return nil
        }
        return HourMinute(hour: h, minute: mi)
    }

    /// Text for an editable field that round-trips through parse(): "15:00" or "3:00 PM".
    public static func inputText(_ hm: HourMinute, hour12: Bool) -> String {
        if hour12 {
            let h = hm.hour % 12 == 0 ? 12 : hm.hour % 12
            return "\(h):\(pad(hm.minute, 2)) \(hm.hour < 12 ? "AM" : "PM")"
        }
        return "\(pad(hm.hour, 2)):\(pad(hm.minute, 2))"
    }

    // MARK: - matcher

    private struct Match { var hour: Int; var minute: Int?; var ampm: String? }

    private static func isDigit(_ c: Unicode.Scalar) -> Bool { c.value >= 48 && c.value <= 57 }
    private static func digit(_ c: Unicode.Scalar) -> Int { Int(c.value) - 48 }

    static func isJSWhitespace(_ c: Unicode.Scalar) -> Bool {
        switch c.value {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: return true
        default: return false
        }
    }

    /// Tail `h?(am|pm|a|p)?$`: returns (matched, ampm).
    private static func matchTail(_ s: ArraySlice<Unicode.Scalar>) -> (Bool, String?) {
        var rest = String(String.UnicodeScalarView(s))
        if rest.hasPrefix("h") { rest.removeFirst() }
        if rest.isEmpty { return (true, nil) }
        if ["am", "pm", "a", "p"].contains(rest) { return (true, rest) }
        return (false, nil)
    }

    private static func match(_ t: [Unicode.Scalar]) -> Match? {
        var leading = 0
        while leading < t.count && leading < 2 && isDigit(t[leading]) { leading += 1 }
        if leading == 0 { return nil }
        // \d{1,2} is greedy: try 2 digits, then 1.
        for hourLen in stride(from: leading, through: 1, by: -1) {
            let hour = t[0..<hourLen].reduce(0) { $0 * 10 + digit($1) }
            let r = hourLen
            // Optional group (?:[:.h]?(\d{2}))?, greedy: group with separator, group without, no group.
            if r + 2 < t.count, [":", ".", "h"].contains(Character(t[r])), isDigit(t[r + 1]), isDigit(t[r + 2]) {
                let mi = digit(t[r + 1]) * 10 + digit(t[r + 2])
                let (ok, ap) = matchTail(t[(r + 3)...])
                if ok { return Match(hour: hour, minute: mi, ampm: ap) }
            }
            if r + 1 < t.count, isDigit(t[r]), isDigit(t[r + 1]) {
                let mi = digit(t[r]) * 10 + digit(t[r + 1])
                let (ok, ap) = matchTail(t[(r + 2)...])
                if ok { return Match(hour: hour, minute: mi, ampm: ap) }
            }
            let (ok, ap) = matchTail(t[r...])
            if ok { return Match(hour: hour, minute: nil, ampm: ap) }
        }
        return nil
    }
}
