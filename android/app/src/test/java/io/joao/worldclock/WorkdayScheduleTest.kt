package io.joao.worldclock

import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.widget.WorkdaySchedule
import io.joao.worldclock.widget.WidgetKind
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class WorkdayScheduleTest {
    @Test fun overnightShiftBelongsToTheDayItStartedAndSkipsWeekend() {
        val city = SavedCity("UTC", workStart = 22, workEnd = 6, workDays = setOf(5))
        val saturday = Instant.parse("2026-10-10T02:00:00Z")
        val end = WorkdaySchedule.nextTransition(city, saturday)!!
        assertFalse(end.starts)
        assertEquals(Instant.parse("2026-10-10T06:00:00Z"), end.instant)
        val next = WorkdaySchedule.nextTransition(city, end.instant)!!
        assertTrue(next.starts)
        assertEquals(Instant.parse("2026-10-16T22:00:00Z"), next.instant)
        val day = WorkdaySchedule.timeline(city, saturday)
        assertTrue(day.working.take(24).all { it })
        assertFalse(day.working.drop(24).any { it })
    }

    @Test fun disabledSchedulesHaveNoNextChange() {
        val now = Instant.parse("2026-10-11T00:00:00Z")
        assertNull(WorkdaySchedule.nextTransition(SavedCity("UTC", workStart = 9, workEnd = 9), now))
        assertNull(WorkdaySchedule.nextTransition(SavedCity("UTC", workDays = emptySet()), now))
    }

    @Test fun realCivilDayIncludesDstGapFoldAndFractionalZone() {
        val newYork = SavedCity("America/New_York", workDays = (1..7).toSet())
        val spring = WorkdaySchedule.timeline(newYork, Instant.parse("2026-03-08T12:00:00Z"))
        val fall = WorkdaySchedule.timeline(newYork, Instant.parse("2026-11-01T12:00:00Z"))
        assertEquals(23 * 4, spring.working.size)
        assertEquals(25 * 4, fall.working.size)
        assertEquals(spring.end, spring.axis.last())
        val kathmandu = WorkdaySchedule.timeline(SavedCity("Asia/Kathmandu"), Instant.parse("2026-10-11T18:15:00Z"))
        assertEquals(Instant.parse("2026-10-11T18:15:00Z"), kathmandu.start)
        assertEquals(0f, kathmandu.nowFraction)
    }

    @Test fun dstTransitionCanStartShiftInsideMissingHour() {
        val city = SavedCity("America/New_York", workStart = 2, workEnd = 4, workDays = setOf(7))
        val next = WorkdaySchedule.nextTransition(city, Instant.parse("2026-03-08T06:30:00Z"))!!
        assertTrue(next.starts)
        assertEquals(Instant.parse("2026-03-08T07:00:00Z"), next.instant)
    }

    @Test fun onlyAdditionalWidgetsRequireAccessAndRecoveryRetainsKind() {
        assertEquals(listOf(WidgetKind.SINGLE, WidgetKind.WORLD, WidgetKind.MEETING), WidgetKind.entries.filterNot { it.premium })
        assertEquals(WidgetKind.WORLD, WidgetKind.DUO.forAccess(false))
        assertEquals(WidgetKind.WORLD, WidgetKind.BOARD.forAccess(false))
        assertEquals(WidgetKind.SINGLE, WidgetKind.WORKDAY.forAccess(false))
        WidgetKind.entries.forEach { assertEquals(it, it.forAccess(true)) }
    }
}
