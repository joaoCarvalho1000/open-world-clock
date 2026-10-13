package io.joao.worldclock

import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.widget.PremiumWidgetData
import io.joao.worldclock.widget.WidgetKind
import org.junit.Assert.*
import org.junit.Test
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class PremiumWidgetDataTest {
    @Test fun tenPremiumKindsAreDistinctFromTheThreeFreeKinds() {
        assertEquals(10, WidgetKind.entries.count { it.premium })
        assertEquals(13, WidgetKind.entries.map { it.providerClass.name }.distinct().size)
    }

    @Test fun quarterHourOffsetsProduceExactOverlapBoundaries() {
        val cities = listOf(SavedCity("UTC"), SavedCity("Asia/Kathmandu"))
        val windows = PremiumWidgetData.windows(cities, Instant.parse("2026-10-12T00:00:00Z"), Instant.parse("2026-10-13T00:00:00Z"))
        assertEquals(1, windows.size)
        assertEquals(Instant.parse("2026-10-12T09:00:00Z"), windows.single().start)
        assertEquals(Instant.parse("2026-10-12T11:15:00Z"), windows.single().end)
    }

    @Test fun nextWindowHandlesActiveOvernightAndNoOverlap() {
        val overnight = listOf(SavedCity("UTC", workStart = 22, workEnd = 6, workDays = setOf(5)))
        val now = Instant.parse("2026-10-10T02:00:00Z")
        val window = PremiumWidgetData.nextWindow(overnight, now)!!
        assertEquals(now, window.start)
        assertEquals(Instant.parse("2026-10-10T06:00:00Z"), window.end)
        val incompatible = listOf(SavedCity("UTC", workStart = 9, workEnd = 10), SavedCity("UTC", workStart = 11, workEnd = 12))
        assertNull(PremiumWidgetData.nextWindow(incompatible, now))
    }

    @Test fun weekEvaluatesEveryDateAcrossDstInsteadOfRepeatingOneDay() {
        val cities = listOf(SavedCity("America/New_York", workDays = (1..7).toSet()), SavedCity("UTC", workDays = (1..7).toSet()))
        val week = PremiumWidgetData.week(cities, Instant.parse("2026-10-30T12:00:00Z"))
        assertEquals(7, week.size)
        assertEquals(LocalDate.parse("2026-10-30"), week.first().first)
        assertEquals(13, week[0].second.single().start.atZone(ZoneId.of("UTC")).hour)
        assertEquals(14, week[2].second.single().start.atZone(ZoneId.of("UTC")).hour)
    }

    @Test fun clockChangesComeFromZoneRulesAndFixedZonesHaveNone() {
        val now = Instant.parse("2026-10-11T00:00:00Z")
        assertNull(PremiumWidgetData.nextClockChange(listOf(SavedCity("Asia/Kathmandu"), SavedCity("UTC")), now))
        val change = PremiumWidgetData.nextClockChange(listOf(SavedCity("America/New_York"), SavedCity("Europe/Lisbon")), now)!!
        assertEquals("Europe/Lisbon", change.city.zoneId)
        assertEquals(Instant.parse("2026-10-25T01:00:00Z"), change.transition.instant)
    }

    @Test fun solarEventsCrossHorizonAndPolarStatesAreExplicit() {
        val normal = PremiumWidgetData.solar(LocalDate.parse("2026-03-20"), ZoneId.of("UTC"), 0.0, 0.0)
        assertNotNull(normal.rise); assertNotNull(normal.set)
        assertTrue(normal.rise!! < normal.set!!)
        val length = Duration.between(normal.rise, normal.set).toMinutes()
        assertTrue("Equinox at equator is about twelve hours", length in 715..735)
        val summer = PremiumWidgetData.solar(LocalDate.parse("2026-06-21"), ZoneId.of("Europe/Oslo"), 78.22, 15.65)
        assertTrue(summer.alwaysDay); assertNull(summer.rise); assertNull(summer.set)
        val winter = PremiumWidgetData.solar(LocalDate.parse("2026-12-21"), ZoneId.of("Europe/Oslo"), 78.22, 15.65)
        assertTrue(winter.alwaysNight); assertNull(winter.rise); assertNull(winter.set)
    }
}
