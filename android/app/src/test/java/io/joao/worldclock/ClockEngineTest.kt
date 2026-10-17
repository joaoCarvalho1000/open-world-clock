package io.joao.worldclock

import io.joao.worldclock.core.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.*
import java.time.temporal.ChronoUnit

class ClockEngineTest {
    private val golden = JSONObject(javaClass.getResource("/golden.json")!!.readText())
    @Test fun sharedOffsetVectors() {
        val vectors = golden.getJSONArray("offsets")
        repeat(vectors.length()) { i ->
            val v = vectors.getJSONObject(i)
            assertEquals(v.toString(), v.getInt("offsetMinutes"), ZoneId.of(v.getString("zone")).rules.getOffset(Instant.ofEpochMilli(v.getLong("epochMs"))).totalSeconds / 60)
        }
    }
    @Test fun sharedSolarAltitudeVectors() {
        val vectors = golden.getJSONArray("sunAltitude")
        repeat(vectors.length()) { i ->
            val v = vectors.getJSONObject(i)
            val altitude = Sun.altitude(Instant.ofEpochMilli(v.getLong("epochMs")), v.getDouble("lat"), v.getDouble("lng"))
            assertEquals(v.toString(), v.getDouble("altitude"), altitude, 0.000001)
        }
    }
    @Test fun normalConversionsAndGapsMatchSharedVectors() {
        val vectors = golden.getJSONArray("zonedToEpoch")
        repeat(vectors.length()) { i ->
            val v = vectors.getJSONObject(i)
            val conversion = ClockEngine.convert(LocalDate.of(v.getInt("y"), v.getInt("m"), v.getInt("d")), LocalTime.of(v.getInt("h"), v.getInt("mi")), v.getString("zone"))
            // JS has iterative overlap selection. Android exposes both occurrences explicitly.
            if (v.getString("note") != "overlap") assertEquals(v.toString(), v.getLong("epochMs"), conversion.instant.toEpochMilli())
            assertEquals(v.toString(), v.getString("note") == "gap", conversion.adjustedForGap)
            assertEquals(v.toString(), v.getString("note") == "overlap", conversion.ambiguous)
        }
    }
    @Test fun foldsExposeBothRealOccurrencesIncludingHalfHour() {
        listOf(Triple("America/New_York", LocalDate.of(2026,11,1), LocalTime.of(1,30)), Triple("Australia/Lord_Howe", LocalDate.of(2026,4,5), LocalTime.of(1,45))).forEach { (id,date,time) ->
            val earlier = ClockEngine.convert(date,time,id)
            val later = ClockEngine.convert(date,time,id,true)
            assertTrue(earlier.ambiguous)
            assertTrue(later.ambiguous)
            assertEquals(if (id == "Australia/Lord_Howe") 1800L else 3600L, Duration.between(earlier.instant,later.instant).seconds)
            assertEquals(time, earlier.instant.atZone(ZoneId.of(id)).toLocalTime())
            assertEquals(time, later.instant.atZone(ZoneId.of(id)).toLocalTime())
        }
    }
    @Test fun sharedCivilDayDifferences() {
        val vectors = golden.getJSONArray("dayDiff")
        repeat(vectors.length()) { i ->
            val v = vectors.getJSONObject(i)
            val id = v.getString("zone")
            val reading = ClockEngine.reading(City(id,id),SavedCity(id),Instant.ofEpochMilli(v.getLong("epochMs")),true,ZoneId.of(v.getString("refZone")))
            assertEquals(v.toString(), v.getInt("diff"), reading.dayDifference)
        }
    }
    @Test fun overnightShiftBelongsToPreviousWorkingDay() {
        val city = SavedCity("UTC",workStart=22,workEnd=6,workDays=setOf(5))
        assertTrue(ClockEngine.isWorking(Instant.parse("2026-10-09T23:00:00Z"),city))
        assertTrue(ClockEngine.isWorking(Instant.parse("2026-10-10T05:59:00Z"),city))
        assertFalse(ClockEngine.isWorking(Instant.parse("2026-10-10T06:00:00Z"),city))
        assertFalse(ClockEngine.isWorking(Instant.parse("2026-10-10T23:00:00Z"),city))
    }
    @Test fun plannerKeepsDistinctInstantsAcrossDst() {
        val city = SavedCity("America/New_York",workDays=(1..7).toSet())
        val slots = ClockEngine.plan(LocalDate.of(2026,11,1),city.zoneId,listOf(city))
        assertEquals(25,slots.size)
        assertEquals(25,slots.map { it.instant }.distinct().size)
        assertEquals(listOf(0,1,1,2),slots.take(4).map { it.instant.atZone(ZoneId.of(city.zoneId)).hour })
        assertTrue(slots.zipWithNext().all { (a,b) -> ChronoUnit.HOURS.between(a.instant,b.instant) == 1L })
        assertEquals(8,slots.count { it.workingCount == 1 })
    }
    @Test fun plannerContainsOnlyTheSelectedCivilDay() {
        listOf(
            Triple("America/New_York", LocalDate.of(2026,3,8), 23),
            Triple("America/New_York", LocalDate.of(2026,11,1), 25),
            Triple("Australia/Lord_Howe", LocalDate.of(2026,10,4), 24),
            Triple("Australia/Lord_Howe", LocalDate.of(2026,4,5), 25),
            Triple("Asia/Kathmandu", LocalDate.of(2026,10,16), 24),
        ).forEach { (id, date, count) ->
            val zone = ZoneId.of(id)
            val slots = ClockEngine.plan(date, id, listOf(SavedCity(id)))
            assertEquals(id, count, slots.size)
            assertTrue(slots.all { it.instant.atZone(zone).toLocalDate() == date })
            val end = date.plusDays(1).atStartOfDay(zone).toInstant()
            assertTrue(Duration.between(slots.last().instant, end).seconds in 1..3600)
        }
        assertTrue(ClockEngine.plan(LocalDate.of(2011,12,30), "Pacific/Apia", emptyList()).isEmpty())
    }
    @Test fun fractionalOffsetAndDateLineFormatting() {
        assertEquals("UTC+5:45",ClockEngine.offsetLabel(345))
        assertEquals("UTC−3:30",ClockEngine.offsetLabel(-210))
        assertEquals("Same time",ClockEngine.differenceLabel(0))
        assertEquals("5h 45m ahead",ClockEngine.differenceLabel(345))
    }
}
