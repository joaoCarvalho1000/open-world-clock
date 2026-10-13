package io.joao.worldclock.widget

import io.joao.worldclock.core.ClockEngine
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.core.Sun
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.zone.ZoneOffsetTransition

data class WorkingWindow(val start: Instant, val end: Instant)
data class SolarDay(val rise: Instant?, val set: Instant?, val alwaysDay: Boolean, val alwaysNight: Boolean,
    val start: Instant, val end: Instant, val altitudes: List<Double>)
data class CityClockChange(val city: SavedCity, val transition: ZoneOffsetTransition)

/** Offline data for the additional widget compositions. All time ranges use real instants. */
object PremiumWidgetData {
    fun windows(cities: List<SavedCity>, from: Instant, until: Instant): List<WorkingWindow> {
        if (cities.isEmpty() || until <= from || cities.any { it.workDays.isEmpty() || it.workStart == it.workEnd }) return emptyList()
        val result = mutableListOf<WorkingWindow>()
        var at = from
        var open: Instant? = null
        // Each city's next schedule or DST transition is an exact boundary. Sampling by hour
        // would miss quarter-hour zones and short shared windows.
        while (at < until) {
            val active = cities.all { ClockEngine.isWorking(at, it) }
            if (active && open == null) open = at
            if (!active && open != null) { result += WorkingWindow(open, at); open = null }
            val next = cities.mapNotNull { WorkdaySchedule.nextTransition(it, at)?.instant }.minOrNull()
            at = if (next == null || next >= until) until else next
        }
        if (open != null) result += WorkingWindow(open, until)
        return result
    }

    fun nextWindow(cities: List<SavedCity>, now: Instant): WorkingWindow? =
        windows(cities, now, now.plus(Duration.ofDays(8))).firstOrNull()

    fun week(cities: List<SavedCity>, now: Instant): List<Pair<LocalDate, List<WorkingWindow>>> {
        val zone = ZoneId.of(cities.firstOrNull()?.zoneId ?: "UTC")
        val date = now.atZone(zone).toLocalDate()
        return (0L..6L).map { offset ->
            val day = date.plusDays(offset)
            day to windows(cities, day.atStartOfDay(zone).toInstant(), day.plusDays(1).atStartOfDay(zone).toInstant())
        }
    }

    fun nextClockChange(cities: List<SavedCity>, now: Instant): CityClockChange? = cities.mapNotNull { city ->
        ZoneId.of(city.zoneId).rules.nextTransition(now)?.takeIf {
            it.instant <= now.atZone(ZoneId.of(city.zoneId)).plusYears(1).toInstant()
        }
            ?.let { CityClockChange(city, it) }
    }.minByOrNull { it.transition.instant }

    fun solar(date: LocalDate, zone: ZoneId, latitude: Double, longitude: Double): SolarDay {
        val start = date.atStartOfDay(zone).toInstant()
        val end = date.plusDays(1).atStartOfDay(zone).toInstant()
        var rise: Instant? = null
        var set: Instant? = null
        var left = start
        var wasDay = Sun.isDay(left, latitude, longitude)
        var anyDay = wasDay
        var anyNight = !wasDay
        while (left < end) {
            val right = minOf(left.plusSeconds(300), end)
            val isDay = Sun.isDay(right, latitude, longitude)
            anyDay = anyDay || isDay; anyNight = anyNight || !isDay
            if (isDay != wasDay) {
                var low = left.toEpochMilli(); var high = right.toEpochMilli()
                while (high - low > 1000) {
                    val middle = (low + high) / 2
                    if (Sun.isDay(Instant.ofEpochMilli(middle), latitude, longitude) == wasDay) low = middle else high = middle
                }
                val crossing = Instant.ofEpochMilli(high)
                if (isDay && rise == null) rise = crossing
                if (!isDay && set == null) set = crossing
            }
            left = right; wasDay = isDay
        }
        val seconds = end.epochSecond - start.epochSecond
        val heights = (0..96).map { Sun.altitude(start.plusSeconds(seconds * it / 96), latitude, longitude) }
        return SolarDay(rise, set, anyDay && !anyNight, anyNight && !anyDay, start, end, heights)
    }
}
