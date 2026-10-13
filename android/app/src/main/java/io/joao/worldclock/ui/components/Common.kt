package io.joao.worldclock.ui.components

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.joao.worldclock.R
import io.joao.worldclock.core.AppLanguage
import io.joao.worldclock.core.AppTheme
import io.joao.worldclock.core.City
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.data.SettingsRepository
import io.joao.worldclock.engagement.Engagement
import io.joao.worldclock.billing.SupporterBilling
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.theme.Brand
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Single entry point for UI mutations. The repository already broadcasts a widget refresh
 * on every change, so this stays a thin pass-through that screens can share.
 */
class AppServices(private val context: Context, val catalog: CityCatalog, val repository: SettingsRepository) {
    private inline fun after(block: () -> Unit) = block()

    /** Curating the clock list is the clearest sign the app is useful to someone. */
    val engagement: Engagement by lazy { Engagement(context) }
    val supporter: SupporterBilling by lazy { SupporterBilling.get(context) }

    fun addCity(id: String) = after { repository.addCity(id); engagement.recordMeaningfulUse() }
    fun removeCity(id: String) = after { repository.removeCity(id) }
    fun moveCity(id: String, delta: Int) = after { repository.moveCity(id, delta) }
    fun updateCity(city: SavedCity) = after { repository.updateCity(city); engagement.recordMeaningfulUse() }
    fun setUse24Hour(value: Boolean) = after { repository.setUse24Hour(value) }
    fun setTheme(value: AppTheme) = after { repository.setTheme(value) }
    fun setLanguage(value: AppLanguage) = after { repository.setLanguage(value) }
    fun setHomeZone(id: String?) = after { repository.setHomeZone(id); engagement.recordMeaningfulUse() }
}

val LocalServices = staticCompositionLocalOf<AppServices> { error("AppServices not provided") }

/** The reference city resolved to a point on the globe, for the clock header and the backdrop. */
data class HomePoint(val zoneId: String, val city: City, val latitude: Double, val longitude: Double)

/**
 * Where "here" is. [ClockSettings.homeZone] when the user has chosen one, the device zone otherwise.
 *
 * Zones the catalogue carries no coordinates for fall back to their own UTC offset, which still puts
 * the mark on roughly the right meridian. Without that fallback a missing entry would land the
 * backdrop on (0, 0): the Atlantic south of Ghana, which is not where anybody lives.
 */
@Composable
fun rememberHomePoint(settings: ClockSettings, locale: Locale): HomePoint {
    val catalog = LocalServices.current.catalog
    val zoneId = settings.homeZone ?: ZoneId.systemDefault().id
    return remember(zoneId, locale, catalog) {
        val city = catalog.find(zoneId, locale)
        if (city.latitude != 0.0 || city.longitude != 0.0) {
            HomePoint(zoneId, city, city.latitude, city.longitude)
        } else {
            val hours = runCatching {
                ZoneId.of(zoneId).rules.getOffset(Instant.now()).totalSeconds / 3600.0
            }.getOrDefault(0.0)
            HomePoint(zoneId, city, 20.0, (hours * 15.0).coerceIn(-180.0, 180.0))
        }
    }
}

/** Current instant, ticking on each whole second. */
@Composable
fun rememberNow(periodMs: Long = 1_000): State<Instant> = produceState(Instant.now(), periodMs) {
    while (true) {
        value = Instant.now()
        delay(periodMs - System.currentTimeMillis() % periodMs)
    }
}

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = modifier.padding(start = 4.dp, top = 20.dp, bottom = 8.dp).semantics { heading() },
    )
}

@Composable
fun DayNightIcon(isDay: Boolean, tint: Color, modifier: Modifier = Modifier) {
    val t = LocalStrings.current
    Icon(
        if (isDay) Icons.Rounded.WbSunny else Icons.Rounded.DarkMode,
        contentDescription = t.get(if (isDay) R.string.day_phase_daytime else R.string.day_phase_night),
        tint = if (isDay) Brand.Sun else tint,
        modifier = modifier,
    )
}

@Composable
fun ScreenTitle(title: String, subtitle: String? = null, modifier: Modifier = Modifier) {
    Column(modifier.padding(top = 8.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.semantics { heading() })
        if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun LabeledRow(label: String, modifier: Modifier = Modifier, trailing: @Composable () -> Unit) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        trailing()
    }
}

/** A whole hour written out, e.g. 09:00 or 9 AM, in the app language. */
fun hourLabel(hour: Int, use24: Boolean, locale: Locale): String =
    java.time.LocalTime.of(hour.coerceIn(0, 23), 0)
        .format(DateTimeFormatter.ofPattern(if (use24) "HH:mm" else "h a", locale))

/**
 * The narrowest honest hour label for a dense timeline cell: "09" in 24 hour time,
 * "9a" / "12p" otherwise, with the day half taken from the locale's own AM/PM words.
 */
fun compactHour(hour: Int, use24: Boolean, locale: Locale): String {
    val h = hour.coerceIn(0, 23)
    if (use24) return "%02d".format(locale, h)
    val half = java.text.DateFormatSymbols.getInstance(locale).amPmStrings
        .getOrNull(if (h < 12) 0 else 1)?.takeIf { it.isNotBlank() }?.first()?.lowercaseChar() ?: if (h < 12) 'a' else 'p'
    return "${if (h % 12 == 0) 12 else h % 12}$half"
}

/** Short weekday names, Monday first, in the app language. */
fun weekdayShort(locale: Locale): List<String> = java.time.DayOfWeek.entries
    .map { it.getDisplayName(java.time.format.TextStyle.SHORT, locale) }
