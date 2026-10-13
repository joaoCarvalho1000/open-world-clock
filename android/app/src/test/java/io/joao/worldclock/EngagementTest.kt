package io.joao.worldclock

import io.joao.worldclock.engagement.MeetingShare
import io.joao.worldclock.engagement.ReviewPolicy
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.util.Locale

class EngagementTest {
    private val day = 86_400_000L

    @Test fun reviewWaitsForActualUseAndHasLongCooldown() {
        val first = 1_000L
        val now = first + 8 * day
        assertFalse(ReviewPolicy.eligible(first + 6 * day, first, 3, 5, 0))
        assertFalse(ReviewPolicy.eligible(now, first, 2, 5, 0))
        assertFalse(ReviewPolicy.eligible(now, first, 3, 4, 0))
        assertTrue(ReviewPolicy.eligible(now, first, 3, 5, 0))
        assertFalse(ReviewPolicy.eligible(now + 179 * day, first, 10, 100, now))
        assertTrue(ReviewPolicy.eligible(now + 180 * day, first, 10, 100, now))
        assertFalse(ReviewPolicy.eligible(now - day, first, 10, 100, now))
    }

    @Test fun meetingLinkPreservesRepeatedHourAndChosenLanguage() {
        val zones = listOf("America/New_York", "Asia/Kathmandu", "America/New_York")
        val first = MeetingShare.url(Instant.parse("2026-11-01T05:30:00Z"), zones, Locale.forLanguageTag("pt-BR"))
        val second = MeetingShare.url(Instant.parse("2026-11-01T06:30:00Z"), zones, Locale.forLanguageTag("es-419"))
        assertEquals("https://openworldclock.com/pt/#lang=pt&c=America/New_York,Asia/Kathmandu&t=2026-11-01T05:30&z=UTC", first)
        assertTrue(second.startsWith("https://openworldclock.com/es/#lang=es&"))
        assertTrue(second.endsWith("&t=2026-11-01T06:30&z=UTC"))
        assertFalse(first.contains("My team"))
        assertTrue(MeetingShare.url(Instant.EPOCH, listOf("Etc/GMT+5"), Locale.JAPANESE).contains("#lang=en&c=Etc/GMT%2B5"))
    }
}
