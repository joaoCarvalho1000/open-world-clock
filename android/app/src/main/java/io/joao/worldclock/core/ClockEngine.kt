package io.joao.worldclock.core

import java.time.*
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs

object ClockEngine {
    fun reading(city: City, saved: SavedCity, instant: Instant, use24Hour: Boolean, homeZone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): ClockReading {
        val local = instant.atZone(ZoneId.of(city.id))
        val home = instant.atZone(homeZone)
        val offset = local.offset.totalSeconds / 60
        val difference = offset - home.offset.totalSeconds / 60
        val day = Sun.isDay(instant, city.latitude, city.longitude)
        val altitude = Sun.altitude(instant, city.latitude, city.longitude)
        val phase = when {
            altitude < -6 -> "Night"
            altitude < -0.833 -> if (local.hour < 12) "Dawn" else "Dusk"
            altitude < 6 -> if (local.hour < 12) "Dawn" else "Golden hour"
            local.hour < 12 -> "Morning"
            local.hour < 14 -> "Midday"
            else -> "Afternoon"
        }
        return ClockReading(city, saved.label.ifBlank { city.name },
            local.format(DateTimeFormatter.ofPattern(if (use24Hour) "HH:mm" else "h:mm", locale)),
            if (use24Hour) "" else local.format(DateTimeFormatter.ofPattern("a", locale)),
            local.format(DateTimeFormatter.ofPattern(if (locale.language == "en") "EEE, MMM d" else "EEE, d MMM", locale)),
            offsetLabel(offset), differenceLabel(difference, locale),
            ChronoUnit.DAYS.between(home.toLocalDate(), local.toLocalDate()).toInt(), day, phaseLabel(phase, locale), isWorking(instant, saved),
            altitude, Sky.rising(instant, city.latitude, city.longitude, altitude))
    }

    /** Gaps move forward by the transition length; folds default to the earlier occurrence. */
    fun convert(date: LocalDate, time: LocalTime, zoneId: String, laterOffset: Boolean = false): Conversion {
        val zone = ZoneId.of(zoneId)
        val local = LocalDateTime.of(date, time)
        val offsets = zone.rules.getValidOffsets(local)
        val zoned = if (offsets.size > 1 && laterOffset) ZonedDateTime.ofLocal(local, zone, offsets.last()) else local.atZone(zone)
        return Conversion(zoned.toInstant(), offsets.isEmpty(), offsets.size > 1)
    }

    fun isWorking(instant: Instant, saved: SavedCity): Boolean {
        val local = instant.atZone(ZoneId.of(saved.zoneId))
        val hour = local.hour + local.minute / 60.0
        val start = saved.workStart.coerceIn(0, 23)
        val end = saved.workEnd.coerceIn(0, 23)
        if (start == end) return false
        return if (start < end) local.dayOfWeek.value in saved.workDays && hour >= start && hour < end
        else (hour >= start && local.dayOfWeek.value in saved.workDays) ||
            (hour < end && local.minusDays(1).dayOfWeek.value in saved.workDays)
    }

    fun plan(date: LocalDate, referenceZone: String, cities: List<SavedCity>): List<PlanSlot> {
        val midnight = date.atStartOfDay(ZoneId.of(referenceZone)).toInstant()
        return (0..23).map { h -> midnight.plusSeconds(h * 3600L).let { PlanSlot(it, cities.count { city -> isWorking(it, city) }, cities.size) } }
    }

    fun offsetLabel(minutes: Int): String = "UTC" + signedDuration(minutes)
    fun differenceLabel(minutes: Int, locale: Locale = Locale.ENGLISH): String = when (locale.language) {
        "pt" -> if (minutes == 0) "Mesmo horário" else "${duration(abs(minutes))} ${if (minutes > 0) "a mais" else "a menos"}"
        "es" -> if (minutes == 0) "Misma hora" else "${duration(abs(minutes))} ${if (minutes > 0) "más" else "menos"}"
        else -> if (minutes == 0) "Same time" else "${duration(abs(minutes))} ${if (minutes > 0) "ahead" else "behind"}"
    }
    private fun phaseLabel(phase: String, locale: Locale): String {
        val index = listOf("Night", "Dawn", "Morning", "Midday", "Afternoon", "Golden hour", "Dusk").indexOf(phase)
        return when (locale.language) {
            "pt" -> listOf("Noite", "Amanhecer", "Manhã", "Meio-dia", "Tarde", "Fim de tarde", "Anoitecer")
            "es" -> listOf("Noche", "Amanecer", "Mañana", "Mediodía", "Tarde", "Atardecer", "Anochecer")
            else -> return phase
        }.getOrElse(index) { phase }
    }
    private fun signedDuration(minutes: Int): String = "${if (minutes >= 0) "+" else "−"}${abs(minutes) / 60}" + if (abs(minutes) % 60 == 0) "" else ":${(abs(minutes) % 60).toString().padStart(2, '0')}"
    private fun duration(minutes: Int): String = listOfNotNull(if (minutes >= 60) "${minutes / 60}h" else null, if (minutes % 60 != 0) "${minutes % 60}m" else null).joinToString(" ")
}
