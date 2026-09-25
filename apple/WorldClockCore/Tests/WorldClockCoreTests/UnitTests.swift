import Foundation
import XCTest
@testable import WorldClockCore

final class ParseTimeTests: XCTestCase {
    func testInputTextRoundTrip() {
        for h in 0..<24 {
            for m in stride(from: 0, to: 60, by: 7) {
                let hm = HourMinute(hour: h, minute: m)
                for h12 in [false, true] {
                    XCTAssertEqual(ParseTime.parse(ParseTime.inputText(hm, hour12: h12)), hm, "\(hm) hour12=\(h12)")
                }
            }
        }
        XCTAssertEqual(ParseTime.inputText(HourMinute(hour: 15, minute: 0), hour12: false), "15:00")
        XCTAssertEqual(ParseTime.inputText(HourMinute(hour: 15, minute: 0), hour12: true), "3:00 PM")
        XCTAssertEqual(ParseTime.inputText(HourMinute(hour: 0, minute: 5), hour12: true), "12:05 AM")
    }
}

final class ClockTextTests: XCTestCase {
    // 2026-09-23 08:05:07 UTC = 09:05:07 in Lisbon (WEST, UTC+1)
    let instant = Date(timeIntervalSince1970: 1_790_150_707)

    func test24h() {
        let t = ClockText.make("Europe/Lisbon", at: instant, hour12: false, locale: Locale(identifier: "en_US_POSIX"))
        XCTAssertEqual(t.hm, "09:05")
        XCTAssertEqual(t.seconds, "07")
        XCTAssertEqual(t.ampm, "")
    }

    func test12h() {
        let t = ClockText.make("Europe/Lisbon", at: instant, hour12: true, locale: Locale(identifier: "en_US_POSIX"))
        XCTAssertEqual(t.hm, "9:05")
        XCTAssertEqual(t.ampm, "AM")
        let pm = ClockText.make("Europe/Lisbon", at: instant.addingTimeInterval(12 * 3600), hour12: true, locale: Locale(identifier: "en_US_POSIX"))
        XCTAssertEqual(pm.hm, "9:05")
        XCTAssertEqual(pm.ampm, "PM")
    }

    func testDurationParts() {
        XCTAssertTrue(DurationParts.split(-90) == (1, 30))
        XCTAssertTrue(DurationParts.split(45) == (0, 45))
    }

    func testWallClockAndHelpers() {
        let w = TimeMath.wallClock("Europe/Lisbon", at: instant)
        XCTAssertEqual(w, WallClock(year: 2026, month: 9, day: 23, hour: 9, minute: 5, second: 7, weekday: 3))
        XCTAssertEqual(w.ymd, "2026-09-23")
        XCTAssertEqual(TimeMath.utcLabel("Asia/Kolkata", at: instant), "UTC+5:30")
        XCTAssertFalse(TimeMath.isLikelyAsleep("Europe/Lisbon", at: instant))
        XCTAssertEqual(Phase.midday.localizationKey, "phase.midday")
    }
}

final class LocalizationTests: XCTestCase {
    func testTemplateFill() {
        XCTAssertEqual(Template.fill("Clocks change in {n} days ({delta})", ["n": "3", "delta": "−1 h"]), "Clocks change in 3 days (−1 h)")
        XCTAssertEqual(Template.fill("Unknown {missing} stays", ["x": "1"]), "Unknown {missing} stays")
        XCTAssertEqual(Template.fill("{{n}}", ["n": "x"]), "{x}")
        XCTAssertEqual(Template.fill("{n", ["n": "x"]), "{n")
    }

    func testAppLanguageResolve() {
        XCTAssertEqual(AppLanguage.resolve(.auto, preferred: ["pt-PT", "en"]), .pt)
        XCTAssertEqual(AppLanguage.resolve(.auto, preferred: ["es-MX"]), .es)
        XCTAssertEqual(AppLanguage.resolve(.auto, preferred: ["fr-FR", "pt-BR"]), .pt) // first language the app speaks (src/main.js)
        XCTAssertEqual(AppLanguage.resolve(.auto, preferred: ["fr-FR", "de-DE"]), .en)
        XCTAssertEqual(AppLanguage.resolve(.auto, preferred: ["en-GB", "pt-BR"]), .en)
        XCTAssertEqual(AppLanguage.resolve(.auto, preferred: []), .en)
        XCTAssertEqual(AppLanguage.resolve(.es, preferred: ["pt-BR"]), .es)
        XCTAssertNil(AppLanguage.auto.lprojName)
        XCTAssertEqual(AppLanguage.pt.lprojName, "pt-BR")
        XCTAssertEqual(AppLanguage.pt.localeIdentifier, "pt-BR")
        XCTAssertEqual(AppLanguage.es.localeIdentifier, "es-419")
        XCTAssertEqual(AppLanguage.en.localeIdentifier, "en-US")
        XCTAssertNotEqual(AppLanguage.resolve(.auto), .auto)
    }
}

final class ZoneCatalogTests: XCTestCase {
    let c = ZoneCatalog.shared

    func testLisbonMeta() {
        let m = c.meta["Europe/Lisbon"]
        XCTAssertEqual(m?.city, "Lisbon")
        XCTAssertEqual(m?.country, "Portugal")
        XCTAssertEqual(m?.alias, "Porto")
        XCTAssertEqual(c.coordinate(of: "Europe/Lisbon"), Coordinate(lat: 38.72, lng: -9.14))
        XCTAssertEqual(c.country(of: "Europe/Lisbon"), "Portugal")
        XCTAssertEqual(c.abbreviations["est"], ["America/New_York", "America/Toronto"])
    }

    func testCoordinateFallbackToCoords() {
        XCTAssertNil(c.meta["Africa/Accra"])
        XCTAssertEqual(c.coordinate(of: "Africa/Accra"), Coordinate(lat: 5.6, lng: -0.19))
        XCTAssertNil(c.coordinate(of: "Nowhere/Nothing"))
    }

    func testCityNameFallback() {
        XCTAssertEqual(c.cityName(of: "America/Argentina/Buenos_Aires"), "Buenos Aires")
        XCTAssertEqual(c.cityName(of: "America/North_Dakota/New_Salem"), "New Salem")
        XCTAssertEqual(c.cityName(of: "UTC"), "UTC")
        XCTAssertEqual(c.displayName(of: "Europe/Lisbon", labels: ["Europe/Lisbon": "  Home  "]), "Home")
        XCTAssertEqual(c.displayName(of: "Europe/Lisbon", labels: ["Europe/Lisbon": "   "]), "Lisbon")
    }

    func testValidityAndAllZones() {
        XCTAssertTrue(c.isValid("Europe/Lisbon"))
        XCTAssertTrue(c.isValid("Asia/Tel_Aviv"), "Asia/Tel_Aviv must resolve (alias to Asia/Jerusalem if needed)")
        XCTAssertFalse(c.isValid("Mars/Olympus_Mons"))
        XCTAssertFalse(c.isValid(""))
        let all = c.allZoneIDs
        XCTAssertEqual(all, all.sorted())
        XCTAssertEqual(Set(all).count, all.count)
        XCTAssertTrue(all.contains("Europe/Lisbon"))
        XCTAssertTrue(all.count > 300, "only \(all.count) zones")
        for z in c.meta.keys { XCTAssertTrue(all.contains(z), z) }
        XCTAssertEqual(ZoneCatalog.defaultZones, ["Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Singapore"])
    }
}

final class SettingsTests: XCTestCase {
    func testTolerantDecoding() throws {
        let json = """
        {"zones":["Europe/Lisbon","Bogus/Zone","Asia/Tokyo","Europe/Lisbon"],
         "labels":{"Europe/Lisbon":"  Home ","Asia/Tokyo":"","Bogus/Zone":"x","America/New_York":7,
                   "Europe/London":"\(String(repeating: "a", count: 41))","Europe/Paris":"\(String(repeating: "b", count: 40))"},
         "hours":{"Europe/Lisbon":{"start":"08:00","end":"17:00","days":[5,1,3]},
                  "Asia/Tokyo":{"start":"9:00","end":"18:00","days":[1]},
                  "Europe/London":{"start":"09:00","end":"09:00","days":[1]},
                  "Europe/Paris":{"start":"09:00","end":"18:00","days":[1,1]},
                  "Europe/Berlin":{"start":"22:00","end":"06:00","days":[0,6]},
                  "Europe/Rome":"nope"},
         "hour12":"yes","showSeconds":true,"theme":"neon","language":"pt","widgetShiftMinutes":60}
        """
        let s = try JSONDecoder().decode(AppSettings.self, from: Data(json.utf8))
        XCTAssertEqual(s.zones, ["Europe/Lisbon", "Asia/Tokyo"])
        XCTAssertEqual(s.labels, ["Europe/Lisbon": "Home", "Europe/Paris": String(repeating: "b", count: 40)])
        XCTAssertEqual(Set(s.hours.keys), ["Europe/Lisbon", "Europe/Berlin"])
        XCTAssertEqual(s.hours["Europe/Lisbon"]?.days, [1, 3, 5])
        XCTAssertEqual(s.hour12, false)
        XCTAssertEqual(s.showSeconds, true)
        XCTAssertEqual(s.theme, .system)
        XCTAssertEqual(s.language, .pt)
        XCTAssertEqual(s.widgetShiftMinutes, 60)
        XCTAssertNil(s.widgetShiftExpires)
    }

    func testEmptyAndGarbage() throws {
        XCTAssertEqual(try JSONDecoder().decode(AppSettings.self, from: Data("{}".utf8)), AppSettings.default)
        XCTAssertEqual(try JSONDecoder().decode(AppSettings.self, from: Data(#"{"zones":[1,2]}"#.utf8)).zones, ZoneCatalog.defaultZones)
        XCTAssertEqual(AppSettings.default.zones, ZoneCatalog.defaultZones)
        XCTAssertFalse(AppSettings.default.hour12)
        XCTAssertFalse(AppSettings.default.showSeconds)
    }

    func testSanitizedAndShift() {
        var s = AppSettings.default
        s.zones = ["Asia/Tokyo", "Nope/Nope", "Asia/Tokyo"]
        s.labels = ["Asia/Tokyo": "  T  ", "Nope/Nope": "x"]
        s.hours = ["Asia/Tokyo": WorkingHours(start: "25:00", end: "18:00", days: [1])]
        let c = s.sanitized()
        XCTAssertEqual(c.zones, ["Asia/Tokyo"])
        XCTAssertEqual(c.labels, ["Asia/Tokyo": "T"])
        XCTAssertTrue(c.hours.isEmpty)

        let now = Date(timeIntervalSince1970: 1_790_000_000)
        s.widgetShiftMinutes = 120
        s.widgetShiftExpires = now.addingTimeInterval(3600)
        XCTAssertEqual(s.effectiveShift(at: now), 120)
        XCTAssertEqual(s.effectiveShift(at: now.addingTimeInterval(3600)), 0)
        s.widgetShiftExpires = nil
        XCTAssertEqual(s.effectiveShift(at: now), 120)
    }

    func testLegacyZoneMigration() {
        var s = AppSettings.default
        s.zones = ["Asia/Tel_Aviv", "Europe/Lisbon", "Asia/Jerusalem", "Asia/Calcutta"]
        s.labels = ["Asia/Tel_Aviv": "TLV", "Asia/Calcutta": "Old", "Asia/Kolkata": "New"]
        s.hours = ["Asia/Tel_Aviv": WorkingHours(start: "08:00", end: "17:00", days: [0, 1, 2, 3, 4])]
        let c = s.sanitized()
        XCTAssertEqual(c.zones, ["Asia/Jerusalem", "Europe/Lisbon", "Asia/Kolkata"])
        XCTAssertEqual(c.labels, ["Asia/Jerusalem": "TLV", "Asia/Kolkata": "New"])
        XCTAssertEqual(Array(c.hours.keys), ["Asia/Jerusalem"])
        XCTAssertEqual(ZoneCatalog.shared.canonical("Asia/Tel_Aviv"), "Asia/Jerusalem")
        XCTAssertEqual(ZoneCatalog.shared.canonical("Europe/Lisbon"), "Europe/Lisbon")
    }

    func testEncodeDecodeRoundTrip() throws {
        var s = AppSettings.default
        s.zones = ["Asia/Tokyo", "Europe/Lisbon"]
        s.labels = ["Asia/Tokyo": "Office"]
        s.hours = ["Asia/Tokyo": WorkingHours(start: "22:00", end: "06:00", days: [0, 1])]
        s.hour12 = true
        s.theme = .dark
        s.language = .es
        s.widgetShiftMinutes = 60
        s.widgetShiftExpires = Date(timeIntervalSince1970: 1_790_000_000)
        let back = try JSONDecoder().decode(AppSettings.self, from: JSONEncoder().encode(s))
        XCTAssertEqual(back, s)
    }

    func testWorkingHoursValidity() {
        XCTAssertTrue(WorkingHours.default.isValid)
        XCTAssertEqual(WorkingHours.default.startMinutes, 540)
        XCTAssertEqual(WorkingHours.default.endMinutes, 1080)
        XCTAssertTrue(WorkingHours(start: "23:59", end: "00:00", days: [0, 1, 2, 3, 4, 5, 6]).isValid)
        XCTAssertFalse(WorkingHours(start: "24:00", end: "08:00", days: [1]).isValid)
        XCTAssertFalse(WorkingHours(start: "08:60", end: "09:00", days: [1]).isValid)
        XCTAssertFalse(WorkingHours(start: "08:00", end: "09:00", days: []).isValid)
        XCTAssertFalse(WorkingHours(start: "08:00", end: "09:00", days: [7]).isValid)
        XCTAssertEqual(Planner.hours(for: "X", in: ["X": WorkingHours(start: "9:00", end: "10:00", days: [1])]), .default)
    }

    func testSettingsStoreRoundTrip() throws {
        let suite = "WorldClockCoreTests-\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else {
            throw XCTSkip("UserDefaults(suiteName:) unavailable on this platform; encode/decode covered by testEncodeDecodeRoundTrip")
        }
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = SettingsStore(defaults: defaults)
        XCTAssertEqual(store.load(), .default)
        var s = AppSettings.default
        s.zones = ["Asia/Tokyo"]
        s.showSeconds = true
        store.save(s)
        XCTAssertEqual(store.load(), s)
        let updated = store.update { $0.zones.append("Bogus/Zone"); $0.zones.append("Europe/Paris") }
        XCTAssertEqual(updated.zones, ["Asia/Tokyo", "Europe/Paris"])
        XCTAssertEqual(store.load(), updated)
        defaults.set(Data("garbage".utf8), forKey: SettingsStore.storageKey)
        XCTAssertEqual(store.load(), .default)
        XCTAssertEqual(SettingsStore.appGroupID, "group.io.joao.worldclock.shared")
        XCTAssertEqual(SettingsStore.storageKey, "settings.v1")
    }
}

final class DeepLinkTests: XCTestCase {
    func testRoundTrip() {
        let links: [DeepLink] = [.convert(zone: "Asia/Tokyo"), .convert(zone: "America/Argentina/Buenos_Aires"),
                                 .convert(zone: "Etc/GMT+5"), .convert(zone: nil), .planner, .map, .settings]
        for l in links { XCTAssertEqual(DeepLink(url: l.url), l, l.url.absoluteString) }
        XCTAssertEqual(DeepLink.convert(zone: "Asia/Tokyo").url.absoluteString, "worldclock://convert?zone=Asia/Tokyo")
        XCTAssertEqual(DeepLink.planner.url.absoluteString, "worldclock://planner")
    }

    func testParsing() {
        XCTAssertEqual(DeepLink(url: URL(string: "worldclock://convert?zone=Asia%2FTokyo")!), .convert(zone: "Asia/Tokyo"))
        XCTAssertEqual(DeepLink(url: URL(string: "worldclock://convert?zone=Asia/Tokyo")!), .convert(zone: "Asia/Tokyo"))
        XCTAssertEqual(DeepLink(url: URL(string: "worldclock://convert?zone=Not/AZone")!), .convert(zone: nil))
        XCTAssertEqual(DeepLink(url: URL(string: "WorldClock://MAP")!), .map)
        XCTAssertNil(DeepLink(url: URL(string: "worldclock://unknown")!))
        XCTAssertNil(DeepLink(url: URL(string: "https://planner")!))
    }
}

final class TimelineDatesTests: XCTestCase {
    func testSortedDedupedWithSunrise() {
        // Lisbon, 2026-09-23: sunrise ~06:25 UTC (07:25 local). Window 06:00:30 UTC + 60 min.
        let from = Date(timeIntervalSince1970: 1_790_143_230) // 2026-09-23T06:00:30Z
        let out = TimelineDates.entries(from: from, minutes: 60, zones: ["Europe/Lisbon", "Europe/Lisbon", "Africa/Accra"])
        XCTAssertEqual(out, out.sorted())
        XCTAssertEqual(Set(out).count, out.count)
        XCTAssertEqual(out.first, Date(timeIntervalSince1970: 1_790_143_200))
        let minuteMarks = out.filter { Int($0.timeIntervalSince1970) % 60 == 0 }
        XCTAssertGreaterThanOrEqual(minuteMarks.count, 60)
        let sunrise = Sun.times(at: Date(timeIntervalSince1970: 1_790_150_000), lat: 38.72, lng: -9.14).sunrise!
        XCTAssertTrue(sunrise > from && sunrise < from.addingTimeInterval(3600))
        let sunriseSecond = Date(timeIntervalSince1970: sunrise.timeIntervalSince1970.rounded(.down))
        XCTAssertTrue(out.contains(sunriseSecond), "sunrise \(sunrise) not in entries")
        XCTAssertEqual(out.count, 60 + (Int(sunriseSecond.timeIntervalSince1970) % 60 == 0 ? 0 : 1))
    }

    func testSunEvents() {
        let from = Date(timeIntervalSince1970: 1_790_121_600) // 2026-09-23T00:00Z
        let evs = Sun.events(for: Coordinate(lat: 38.72, lng: -9.14), from: from, until: from.addingTimeInterval(3 * 86400))
        XCTAssertEqual(evs.count, 6)
        XCTAssertEqual(evs.map(\.kind), [.sunrise, .sunset, .sunrise, .sunset, .sunrise, .sunset])
        XCTAssertTrue(Sun.events(for: Coordinate(lat: 69.65, lng: 18.96), from: Date(timeIntervalSince1970: 1_782_000_000),
                                 until: Date(timeIntervalSince1970: 1_782_086_400)).isEmpty) // Tromso midnight sun
    }
}

final class WorldLandTests: XCTestCase {
    func testSmallPath() {
        let cmds = SVGPathParser.parse("M10 20l5-5 1.5.5h3v-2zm1 1L3,4 7 8H1V2Z")
        XCTAssertEqual(cmds, [
            .move(x: 10, y: 20), .line(x: 15, y: 15), .line(x: 16.5, y: 15.5), .line(x: 19.5, y: 15.5), .line(x: 19.5, y: 13.5), .close,
            .move(x: 11, y: 21), .line(x: 3, y: 4), .line(x: 7, y: 8), .line(x: 1, y: 8), .line(x: 1, y: 2), .close,
        ])
        XCTAssertEqual(SVGPathParser.parse("M1e1 2E0"), [.move(x: 10, y: 2)])
    }

    func testWorldLand() {
        let w = WorldLand.shared
        XCTAssertEqual(w.width, 3600)
        XCTAssertEqual(w.height, 1330)
        XCTAssertEqual(w.north, 75)
        XCTAssertEqual(w.south, -58)
        let cmds = w.commands
        XCTAssertGreaterThan(cmds.count, 1000)
        var moves = 0
        for c in cmds {
            switch c {
            case .move(let x, let y), .line(let x, let y):
                if case .move = c { moves += 1 }
                XCTAssertTrue(x >= -1 && x <= w.width + 1 && y >= -1 && y <= w.height + 1, "point \(x),\(y) out of bounds")
            case .close: break
            }
        }
        XCTAssertGreaterThan(moves, 50)
        let p = w.point(lat: 38.72, lng: -9.14)
        XCTAssertEqual(p.x, 1708.6, accuracy: 1e-6)
        XCTAssertEqual(p.y, 362.8, accuracy: 1e-6)
    }
}

final class SkyPaletteTests: XCTestCase {
    func testGradientsAndSurfaces() {
        for p in SkyPhase.allCases {
            for dark in [false, true] {
                let g = Sky.gradient(p, dark: dark)
                for c in [g.top, g.bottom] { XCTAssertTrue([c.r, c.g, c.b, c.a].allSatisfy { (0...1).contains($0) }) }
            }
        }
        XCTAssertTrue(Sky.isNightSurface(.twilight))
        XCTAssertFalse(Sky.isNightSurface(.golden))
        XCTAssertGreaterThan(Palette.canvas(dark: false).r, Palette.canvas(dark: true).r)
        XCTAssertEqual(SkyPhase.allCases.map(\.rawValue), ["night", "twilight", "dawn", "day", "golden", "dusk"])
    }

    func testZoneConvenience() {
        let noon = Date(timeIntervalSince1970: 1_790_164_800) // 2026-09-23T12:00Z
        XCTAssertTrue(Sun.isDay(zone: "Europe/Lisbon", at: noon))
        XCTAssertEqual(Sky.phase(zone: "Europe/Lisbon", at: noon), .day)
        XCTAssertEqual(Sun.phase(zone: "Europe/Lisbon", at: noon), .midday)
        XCTAssertEqual(Sky.phase(zone: "Asia/Tokyo", at: noon), .night)
    }
}

final class ClockChangeTests: XCTestCase {
    func testLisbonOctober() throws {
        // 2026-10-22T12:00Z; Lisbon falls back on 2026-10-25 at 02:00 local (01:00 UTC).
        let d = Date(timeIntervalSince1970: 1_792_670_400)
        let n = try XCTUnwrap(ClockChanges.note("Europe/Lisbon", at: d))
        XCTAssertEqual(n.change.at, Date(timeIntervalSince1970: 1_792_890_000))
        XCTAssertEqual(n.change.deltaMinutes, -60)
        XCTAssertEqual(n.change.oldOffsetMinutes, 60)
        XCTAssertEqual(n.change.wallClockBefore, HourMinute(hour: 2, minute: 0))
        XCTAssertEqual(n.daysUntil, 3)
        XCTAssertNil(ClockChanges.nextOffsetChange("Asia/Tokyo", after: d))
    }

    func testShortDeltaAndTextParts() {
        XCTAssertEqual(ClockChanges.deltaText(60), "+1h")
        XCTAssertEqual(ClockChanges.deltaText(-60), "−1h")
        XCTAssertEqual(ClockChanges.deltaText(-30), "−30m")
        XCTAssertEqual(ClockChanges.deltaText(90), "+1h30m")
        let ch = OffsetChange(at: Date(timeIntervalSince1970: 0), deltaMinutes: -60, oldOffsetMinutes: 60, wallClockBefore: HourMinute(hour: 2, minute: 0))
        let n = ClockChangeNote(change: ch, daysUntil: 3, dayOfChange: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(n.textKey, "dst.in")
        XCTAssertEqual(n.textVars, ["delta": "−1h", "n": "3"])
        XCTAssertEqual(ClockChangeNote(change: ch, daysUntil: 1, dayOfChange: ch.at).textKey, "dst.tomorrow")
        XCTAssertEqual(ClockChangeNote(change: ch, daysUntil: 0, dayOfChange: ch.at).textVars, ["delta": "−1h"])
    }
}

final class PickCenterTests: XCTestCase {
    // Expected values produced by the real JS, from the repo root:
    //   node -e 'const I=require("./src/renderer/views/map.js")._internals; console.log(I.pickCenter([...]))'
    func testMatchesMapJS() {
        let cases: [([Double], Double)] = [
            ([], 10),
            ([42], 42),
            ([-9, -74, 2, 13, 139], 32.5),
            ([-9.14, -74.01, -118.24, -0.13, 103.82], -7.210000000000036),
            ([170, -170, 175], -180),
            ([190, .nan, -200, 0], 95),
            ([139.69, -118.24, 151.21, -157.86], -169.27499999999998),
        ]
        for (input, expected) in cases {
            XCTAssertEqual(WorldMap.pickCenter(longitudes: input), expected, accuracy: 1e-9, "pickCenter(\(input))")
        }
    }
}

final class UniqueClocksTests: XCTestCase {
    // Same cases and expectations as test/unit/time.test.js "uniqueClocks keeps the first zone of each same-time group".
    let sep = Date(timeIntervalSince1970: 1_790_164_800)   // 2026-09-23T12:00Z: northern DST still on
    let dec = Date(timeIntervalSince1970: 1_796_126_400)   // 2026-12-01T12:00Z
    let defaults = ["Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Singapore"]

    func testGroupsMatchTimeJS() {
        let u = TimeMath.uniqueClocks
        for ref in [sep, dec] {
            // São Paulo user: local city first, London dropped (same clock as Lisbon all year)
            XCTAssertEqual(u(["America/Sao_Paulo"] + defaults, ref),
                           ["America/Sao_Paulo", "Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Asia/Singapore"], "\(ref)")
            // London first: Lisbon and the repeated London go
            XCTAssertEqual(u(["Europe/London", "Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Singapore"], ref),
                           ["Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Singapore"], "\(ref)")
            // Dublin (GMT in winter, IST in summer) shares both offsets with Lisbon and London: both are dropped
            XCTAssertEqual(u(["Europe/Dublin"] + defaults, ref),
                           ["Europe/Dublin", "America/New_York", "America/Los_Angeles", "Asia/Singapore"], "\(ref)")
            // Half and quarter hour offsets are their own clocks
            XCTAssertEqual(u(["Asia/Kolkata", "Asia/Kathmandu"], ref), ["Asia/Kolkata", "Asia/Kathmandu"], "\(ref)")
            // Same winter offset, different DST rules: both stay (Phoenix has no DST)
            XCTAssertEqual(u(["America/Phoenix", "America/Denver"], ref), ["America/Phoenix", "America/Denver"], "\(ref)")
            XCTAssertEqual(u(["America/Denver", "America/Phoenix"], ref), ["America/Denver", "America/Phoenix"], "\(ref)")
            // Same offset in the northern summer only (Lisbon +1 vs Lagos +1 all year): both stay
            XCTAssertEqual(u(["Europe/Lisbon", "Africa/Lagos"], ref), ["Europe/Lisbon", "Africa/Lagos"], "\(ref)")
            // Same clock all year: Singapore and Kuala Lumpur, New York and Toronto
            XCTAssertEqual(u(["Asia/Singapore", "Asia/Kuala_Lumpur", "America/New_York", "America/Toronto"], ref),
                           ["Asia/Singapore", "America/New_York"], "\(ref)")
        }
        // A Tokyo user keeps 5 of the 6 cards
        XCTAssertEqual(u(["Asia/Tokyo"] + defaults, sep).count, 5)
        XCTAssertEqual(u(defaults, sep), ["Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Asia/Singapore"])
        XCTAssertEqual(u([], sep), [])
    }

    func testUnknownZoneIsItsOwnGroup() {
        // Swift's offsetMinutes returns 0 for an unknown zone; without the timeZone check it would swallow Lisbon in winter
        // and London all year.
        XCTAssertEqual(TimeMath.uniqueClocks(["Bad/Zone", "Europe/Lisbon"], at: sep), ["Bad/Zone", "Europe/Lisbon"])
        XCTAssertEqual(TimeMath.uniqueClocks(["Bad/Zone", "Europe/London", "Bad/Zone", "Other/Bad"], at: dec),
                       ["Bad/Zone", "Europe/London", "Other/Bad"])
        XCTAssertEqual(TimeMath.uniqueClocks(["Bad/Zone", "Etc/UTC"], at: dec), ["Bad/Zone", "Etc/UTC"])
    }

    func testFirstRunZones() {
        for ref in [sep, dec] {
            // Home is not added (the app shows the device zone implicitly): 5 cards with the São Paulo card, as on Windows.
            XCTAssertEqual(ZoneCatalog.firstRunZones(home: "America/Sao_Paulo", at: ref),
                           ["Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Asia/Singapore"], "\(ref)")
            // Home is a default: it keeps its place and wins its group (Lisbon goes).
            XCTAssertEqual(ZoneCatalog.firstRunZones(home: "Europe/London", at: ref),
                           ["America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Singapore"], "\(ref)")
            XCTAssertEqual(ZoneCatalog.firstRunZones(home: "Europe/Lisbon", at: ref),
                           ["Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Asia/Singapore"], "\(ref)")
            // Dublin shares Lisbon's and London's clock: both go, Dublin stays implicit.
            XCTAssertEqual(ZoneCatalog.firstRunZones(home: "Europe/Dublin", at: ref),
                           ["America/New_York", "America/Los_Angeles", "Asia/Singapore"], "\(ref)")
            // Toronto home drops New York; Tokyo home drops only London.
            XCTAssertEqual(ZoneCatalog.firstRunZones(home: "America/Toronto", at: ref),
                           ["Europe/Lisbon", "America/Los_Angeles", "Asia/Singapore"], "\(ref)")
            XCTAssertEqual(ZoneCatalog.firstRunZones(home: "Asia/Tokyo", at: ref),
                           ["Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Asia/Singapore"], "\(ref)")
        }
        XCTAssertEqual(ZoneCatalog.defaultZones, defaults, "golden.json parity depends on defaultZones staying as is")
    }
}

final class PlannerPartialTests: XCTestCase {
    let firstRunSaoPaulo = ["America/Sao_Paulo", "Europe/Lisbon", "America/New_York", "America/Los_Angeles", "Asia/Singapore"]

    func testDefaultCitiesFromSaoPaulo() throws {
        // Wed 2026-09-23 in São Paulo (UTC-3): Los Angeles and Singapore never share a working hour, so there is no overlap.
        let plan = Planner.plan(source: "America/Sao_Paulo", year: 2026, month: 9, day: 23, zones: firstRunSaoPaulo, hours: [:])
        XCTAssertEqual(plan.totalHours, 0)
        let partial = try XCTUnwrap(Planner.partial(plan))
        XCTAssertEqual(partial.working, 4)
        XCTAssertEqual(partial.total, 5)
        // 13:00 to 14:00 São Paulo = 16:00 to 17:00 UTC: São Paulo, Lisbon, New York and Los Angeles work; Singapore sleeps.
        XCTAssertEqual(partial.runs, [PlannerRun(start: 13, end: 14)])
        XCTAssertEqual(partial.best, PlannerRun(start: 13, end: 14))
        let working = plan.rows.filter { $0.cells[13] == .work }.map(\.zone)
        XCTAssertEqual(working, ["America/Sao_Paulo", "Europe/Lisbon", "America/New_York", "America/Los_Angeles"])
        // Without Singapore that hour is a real overlap, and partial goes back to nil.
        let noSingapore = Planner.plan(source: "America/Sao_Paulo", year: 2026, month: 9, day: 23,
                                       zones: Array(firstRunSaoPaulo.dropLast()), hours: [:])
        XCTAssertEqual(noSingapore.totalHours, 1)
        XCTAssertEqual(noSingapore.best, PlannerRun(start: 13, end: 14))
        XCTAssertNil(Planner.partial(noSingapore))
    }

    func testTwoCitiesWithoutOverlapGiveNil() {
        let plan = Planner.plan(source: "Europe/Lisbon", year: 2026, month: 9, day: 23,
                                zones: ["America/Los_Angeles", "Asia/Singapore"], hours: [:])
        XCTAssertEqual(plan.totalHours, 0)
        XCTAssertNil(Planner.partial(plan))
    }

    func testRealOverlapGivesNil() {
        let plan = Planner.plan(source: "Europe/Lisbon", year: 2026, month: 9, day: 23,
                                zones: ["Europe/Lisbon", "Europe/London", "Europe/Paris"], hours: [:])
        XCTAssertGreaterThan(plan.totalHours, 0)
        XCTAssertNil(Planner.partial(plan))
    }

    func testAllOffWeekendGivesNil() {
        // Sat 2026-09-26 in São Paulo: nobody works with the default Monday to Friday hours.
        let plan = Planner.plan(source: "America/Sao_Paulo", year: 2026, month: 9, day: 26, zones: firstRunSaoPaulo, hours: [:])
        XCTAssertEqual(plan.totalHours, 0)
        XCTAssertTrue(plan.rows.allSatisfy { !$0.cells.contains(.work) })
        XCTAssertNil(Planner.partial(plan))
    }

    func testRunsAndTies() {
        // Hand-built rows: the highest count (2 of 3) happens in two runs; the longer one wins, the earlier on ties.
        func row(_ zone: String, _ work: Set<Int>) -> PlannerRow {
            PlannerRow(zone: zone, cells: (0..<24).map { work.contains($0) ? .work : .off },
                       localTimes: (0..<24).map { HourMinute(hour: $0, minute: 0) })
        }
        func plan(_ rows: [PlannerRow]) -> PlannerResult {
            PlannerResult(columns: [], rows: rows, runs: [], totalHours: 0, best: nil)
        }
        let longerSecond = plan([row("A", [2, 3, 10, 11, 12]), row("B", [2, 3, 10, 11, 12, 21]), row("C", [20])])
        XCTAssertEqual(Planner.partial(longerSecond)?.runs, [PlannerRun(start: 2, end: 4), PlannerRun(start: 10, end: 13)])
        XCTAssertEqual(Planner.partial(longerSecond)?.best, PlannerRun(start: 10, end: 13))
        let tie = plan([row("A", [2, 3, 10, 11]), row("B", [2, 3, 10, 11]), row("C", [])])
        XCTAssertEqual(Planner.partial(tie)?.best, PlannerRun(start: 2, end: 4))
        // Never more than one city working at once: nothing worth suggesting.
        XCTAssertNil(Planner.partial(plan([row("A", [1]), row("B", [2]), row("C", [3])])))
    }

    /// The tie-breaks of time.js bestHours. Each expected run is what `WCTime.bestHours(states, prefer)` returns in node
    /// for the same states ('work' / 'night' / 'off' per hour; prefer = row indexes there, zones here).
    func testTieBreaksMatchBestHours() {
        func row(_ zone: String, work: Set<Int>, night: Set<Int> = []) -> PlannerRow {
            PlannerRow(zone: zone, cells: (0..<24).map { work.contains($0) ? .work : (night.contains($0) ? .night : .off) },
                       localTimes: (0..<24).map { HourMinute(hour: $0, minute: 0) })
        }
        func plan(_ rows: [PlannerRow]) -> PlannerResult {
            PlannerResult(columns: [], rows: rows, runs: [], totalHours: 0, best: nil)
        }
        // bestHours(three, []) = 10 to 13; bestHours(three, [0]) = 2 to 4.
        let three = plan([row("A", work: [2, 3]), row("B", work: [2, 3, 10, 11, 12]), row("C", work: [10, 11, 12])])
        XCTAssertEqual(Planner.partial(three)?.runs, [PlannerRun(start: 2, end: 4), PlannerRun(start: 10, end: 13)])
        XCTAssertEqual(Planner.partial(three)?.best, PlannerRun(start: 10, end: 13))
        let preferA = Planner.partial(three, prefer: ["A"])
        XCTAssertEqual(preferA?.runs, [PlannerRun(start: 2, end: 4)])
        XCTAssertEqual(preferA?.best, PlannerRun(start: 2, end: 4))
        XCTAssertEqual(preferA?.working, 2)
        XCTAssertEqual(preferA?.total, 3)
        // Same count, fewer cities at night wins: bestHours = 10 to 12 (at 2 and 3, C is at night).
        let night = plan([row("A", work: [2, 3, 10, 11]), row("B", work: [2, 3, 10, 11]), row("C", work: [], night: [2, 3])])
        XCTAssertEqual(Planner.partial(night)?.runs, [PlannerRun(start: 10, end: 12)])
        // A preferred city working beats fewer nights: bestHours(four, [0]) = 2 to 4, bestHours(four, []) = 10 to 12.
        let four = plan([row("A", work: [2, 3]), row("B", work: [2, 3, 10, 11]), row("C", work: [10, 11]),
                         row("D", work: [], night: [2, 3])])
        XCTAssertEqual(Planner.partial(four, prefer: ["A"])?.best, PlannerRun(start: 2, end: 4))
        XCTAssertEqual(Planner.partial(four)?.best, PlannerRun(start: 10, end: 12))
        // Both preferred rows count (home and source): bestHours(both, [0, 1]) = 5 to 7, bestHours(both, [1]) = 16 to 19.
        // Duplicates and zones without a row are ignored.
        let both = plan([row("A", work: [5, 6]), row("B", work: [5, 6, 16, 17, 18]), row("C", work: [16, 17, 18]),
                         row("D", work: [])])
        XCTAssertEqual(Planner.partial(both, prefer: ["A", "B", "A", "Unknown/Zone"])?.best, PlannerRun(start: 5, end: 7))
        XCTAssertEqual(Planner.partial(both, prefer: ["B"])?.best, PlannerRun(start: 16, end: 19))
    }

    func testDefaultCitiesFromSaoPauloWithPreference() throws {
        // The app passes [home, source]; with the São Paulo first-run cities the pick stays 13:00 to 14:00, as on Windows.
        let plan = Planner.plan(source: "America/Sao_Paulo", year: 2026, month: 9, day: 23, zones: firstRunSaoPaulo, hours: [:])
        let partial = try XCTUnwrap(Planner.partial(plan, prefer: ["America/Sao_Paulo", "America/Sao_Paulo"]))
        XCTAssertEqual(partial.runs, [PlannerRun(start: 13, end: 14)])
        XCTAssertEqual(partial.working, 4)
        XCTAssertEqual(partial.total, 5)
    }
}
