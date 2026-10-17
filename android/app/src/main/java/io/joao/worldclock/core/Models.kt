package io.joao.worldclock.core

import java.time.Instant
import java.time.ZoneId
import java.util.Locale

data class City(val id: String, val name: String, val country: String = "", val latitude: Double = 0.0, val longitude: Double = 0.0, val aliases: String = "")
data class SavedCity(val zoneId: String, val label: String = "", val workStart: Int = 9, val workEnd: Int = 17, val workDays: Set<Int> = setOf(1, 2, 3, 4, 5))
enum class AppTheme { SYSTEM, LIGHT, DARK }
enum class AppLanguage(val tag: String) {
    SYSTEM(""), EN("en-US"), PT("pt-BR"), ES("es-419");

    fun locale(system: Locale = Locale.getDefault()): Locale = when (this) {
        SYSTEM -> when (system.language) { "pt" -> PT; "es" -> ES; else -> EN }.locale()
        else -> Locale.forLanguageTag(tag)
    }
}
/**
 * [homeZone] is the city the app treats as "here": the clock in the Clocks header, the zone every
 * difference is measured against, and the point the backdrop centres the world on. Null means
 * follow the device, which is what it did unconditionally before this was settable.
 */
data class ClockSettings(val cities: List<SavedCity>, val use24Hour: Boolean = true, val theme: AppTheme = AppTheme.SYSTEM, val language: AppLanguage = AppLanguage.SYSTEM, val homeZone: String? = null)
/**
 * [altitude] and [rising] are what [Sky] needs to name the moment. They ride along because
 * ClockEngine already computes the altitude and throwing it away is what made every surface
 * in this app ask a yes or no question about the sun.
 */
data class ClockReading(val city: City, val label: String, val time: String, val period: String, val date: String, val offset: String, val difference: String, val dayDifference: Int, val isDay: Boolean, val phase: String, val isWorking: Boolean, val altitude: Double = 0.0, val rising: Boolean = true)
data class Conversion(val instant: Instant, val adjustedForGap: Boolean, val ambiguous: Boolean)
data class PlanSlot(val instant: Instant, val workingCount: Int, val totalCount: Int)

/**
 * The zone the app treats as "here": the chosen reference city, or the device when none is set or
 * the stored id no longer resolves. Every surface that measures a difference, including the
 * widgets, goes through this so the app can never disagree with itself about where you are.
 */
fun ClockSettings.homeZoneId(): ZoneId =
    homeZone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
