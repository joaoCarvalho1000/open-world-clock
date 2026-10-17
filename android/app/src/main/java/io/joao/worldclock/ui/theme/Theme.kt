package io.joao.worldclock.ui.theme

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import io.joao.worldclock.core.Sky
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import io.joao.worldclock.core.AppTheme
import androidx.core.view.WindowCompat

/** Open World Clock palette, translated from the desktop renderer's oklch tokens. */
object Brand {
    val DayCard = Color(0xFFFCFDFF)
    val DayInk = Color(0xFF1B2233)
    val DayInk2 = Color(0xFF5A6478)
    val NightCard = Color(0xFF1C2740)
    val NightDeep = Color(0xFF111A2E)
    val NightInk = Color(0xFFF3F6FB)
    val NightInk2 = Color(0xFFB9C3D6)
    val Accent = Color(0xFF2E6BE6)
    val AccentInk = Color(0xFF1F55C7)
    val AccentNight = Color(0xFF8DB1F7)
    val Sun = Color(0xFFF2C14E)
    val Dst = Color(0xFFB87A1E)
    val DstNight = Color(0xFFE8BC72)
    val Grouped = Color(0xFFF1F4F9)
    val GroupedNight = Color(0xFF151E33)
}

/** Colors for a surface that follows a city's real daylight, independent of the app theme. */
@Immutable
data class DaylightColors(val container: Color, val ink: Color, val ink2: Color, val accent: Color, val hair: Color)

val DayColors = DaylightColors(Brand.DayCard, Brand.DayInk, Brand.DayInk2, Brand.AccentInk, Brand.DayInk.copy(alpha = 0.10f))
val NightColors = DaylightColors(Brand.NightCard, Brand.NightInk, Brand.NightInk2, Brand.AccentNight, Color.White.copy(alpha = 0.10f))

fun daylight(isDay: Boolean) = if (isDay) DayColors else NightColors

/**
 * The two stops a city card is painted with, sky over horizon, from the same six phase ladder the
 * widgets and the desktop use. [DaylightColors] stays the source of ink, so contrast is unchanged;
 * only the surface gains the progression. The light family of stops is the right one even in the
 * app's dark theme, because a card follows the city's own sun and not the app's, which is what
 * [DaylightColors] has always meant.
 */
fun daylightStops(altitude: Double, rising: Boolean): Pair<Color, Color> {
    val stops = Sky.stops(altitude, rising, dark = false)
    return Color(Sky.argb(stops.top)) to Color(Sky.argb(stops.bottom))
}

private val Light = lightColorScheme(
    primary = Brand.Accent,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCE6FC),
    onPrimaryContainer = Color(0xFF0C2A6B),
    secondary = Color(0xFF52607A),
    secondaryContainer = Color(0xFFE2E8F3),
    onSecondaryContainer = Brand.DayInk,
    tertiary = Brand.Dst,
    tertiaryContainer = Color(0xFFFBE9C8),
    onTertiaryContainer = Color(0xFF4A3000),
    background = Brand.Grouped,
    onBackground = Brand.DayInk,
    surface = Brand.Grouped,
    onSurface = Brand.DayInk,
    onSurfaceVariant = Brand.DayInk2,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF8FAFD),
    surfaceContainer = Color.White,
    surfaceContainerHigh = Color(0xFFEAEFF6),
    surfaceContainerHighest = Color(0xFFE2E8F1),
    outline = Color(0xFF8790A3),
    outlineVariant = Color(0xFFD6DCE6),
)

private val Dark = darkColorScheme(
    primary = Brand.AccentNight,
    onPrimary = Color(0xFF0C2A6B),
    primaryContainer = Color(0xFF243E78),
    onPrimaryContainer = Color(0xFFDCE6FC),
    secondary = Color(0xFFB9C3D6),
    secondaryContainer = Color(0xFF2A3654),
    onSecondaryContainer = Brand.NightInk,
    tertiary = Brand.DstNight,
    tertiaryContainer = Color(0xFF4A3708),
    onTertiaryContainer = Color(0xFFFBE9C8),
    background = Brand.GroupedNight,
    onBackground = Brand.NightInk,
    surface = Brand.GroupedNight,
    onSurface = Brand.NightInk,
    onSurfaceVariant = Brand.NightInk2,
    surfaceContainerLowest = Color(0xFF0E1526),
    surfaceContainerLow = Color(0xFF19233A),
    surfaceContainer = Brand.NightCard,
    surfaceContainerHigh = Color(0xFF25314D),
    surfaceContainerHighest = Color(0xFF2E3A58),
    outline = Color(0xFF8792AA),
    outlineVariant = Color(0xFF34405E),
)

private val Tnum = "tnum"

private val AppTypography = Typography().run {
    copy(
        displayLarge = displayLarge.copy(fontWeight = FontWeight.Light, fontFeatureSettings = Tnum, letterSpacing = (-1).sp),
        displayMedium = displayMedium.copy(fontWeight = FontWeight.Light, fontFeatureSettings = Tnum, letterSpacing = (-0.5).sp),
        displaySmall = displaySmall.copy(fontWeight = FontWeight.Normal, fontFeatureSettings = Tnum),
        headlineMedium = headlineMedium.copy(fontWeight = FontWeight.Normal, fontFeatureSettings = Tnum),
        titleLarge = titleLarge.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.SemiBold),
    )
}

/** Monospaced-digit style for any time readout so live seconds never jitter. */
val TextStyle.tabular get() = copy(fontFeatureSettings = Tnum)

val LocalIsDark = staticCompositionLocalOf { false }

@Composable
fun isAppDark(theme: AppTheme): Boolean = when (theme) {
    AppTheme.SYSTEM -> isSystemInDarkTheme()
    AppTheme.LIGHT -> false
    AppTheme.DARK -> true
}

@Composable
fun WorldClockTheme(theme: AppTheme = AppTheme.SYSTEM, content: @Composable () -> Unit) {
    val dark = isAppDark(theme)
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            view.context.activity()?.window?.let { window ->
                WindowCompat.getInsetsController(window, view).apply {
                    isAppearanceLightStatusBars = !dark
                    isAppearanceLightNavigationBars = !dark
                }
            }
        }
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalIsDark provides dark) {
        MaterialTheme(colorScheme = if (dark) Dark else Light, typography = AppTypography) {
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background, content = content)
        }
    }
}

private tailrec fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}
