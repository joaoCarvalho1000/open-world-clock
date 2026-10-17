package io.joao.worldclock.widget

import io.joao.worldclock.core.ClockEngine
import io.joao.worldclock.core.SavedCity
import java.time.Instant
import java.time.ZoneId

data class WorkTransition(val instant: Instant, val starts: Boolean)
data class WorkdayTimeline(
    val start: Instant,
    val end: Instant,
    val working: List<Boolean>,
    val nowFraction: Float,
    val axis: List<Instant>,
)

/** Pure schedule math shared by rendering and boundary tests. No alarms or background work. */
object WorkdaySchedule {
    fun nextTransition(city: SavedCity, now: Instant): WorkTransition? {
        if (city.workStart == city.workEnd || city.workDays.isEmpty()) return null
        val zone = ZoneId.of(city.zoneId)
        val date = now.atZone(zone).toLocalDate()
        val candidates = mutableSetOf<Instant>()
        // Include both occurrences of a wall time on a fold. On a gap the zone transition
        // itself may begin or end a shift, even if neither schedule boundary exists.
        for (day in -1L..8L) {
            for (hour in listOf(city.workStart.coerceIn(0, 23), city.workEnd.coerceIn(0, 23))) {
                val wall = date.plusDays(day).atTime(hour, 0)
                val offsets = zone.rules.getValidOffsets(wall)
                if (offsets.isEmpty()) candidates += wall.atZone(zone).toInstant()
                else offsets.forEach { candidates += wall.toInstant(it) }
            }
        }
        var transition = zone.rules.nextTransition(now.minusSeconds(1))
        val limit = date.plusDays(9).atStartOfDay(zone).toInstant()
        while (transition != null && transition.instant < limit) {
            candidates += transition.instant
            transition = zone.rules.nextTransition(transition.instant.plusSeconds(1))
        }
        return candidates.asSequence().filter { it > now }.sorted().firstNotNullOfOrNull { at ->
            val before = ClockEngine.isWorking(at.minusNanos(1), city)
            val after = ClockEngine.isWorking(at, city)
            if (before != after) WorkTransition(at, after) else null
        }
    }

    fun timeline(city: SavedCity, now: Instant): WorkdayTimeline {
        val zone = ZoneId.of(city.zoneId)
        val date = now.atZone(zone).toLocalDate()
        val start = date.atStartOfDay(zone).toInstant()
        val end = date.plusDays(1).atStartOfDay(zone).toInstant()
        val seconds = end.epochSecond - start.epochSecond
        // Fifteen-minute cells preserve fractional DST changes and actual elapsed time.
        val count = (seconds / 900).toInt().coerceAtLeast(1)
        val working = (0 until count).map { ClockEngine.isWorking(start.plusSeconds(it * 900L), city) }
        return WorkdayTimeline(start, end, working,
            ((now.epochSecond - start.epochSecond).toDouble() / seconds).toFloat().coerceIn(0f, 1f),
            (0..4).map { start.plusSeconds(seconds * it / 4) })
    }
}
