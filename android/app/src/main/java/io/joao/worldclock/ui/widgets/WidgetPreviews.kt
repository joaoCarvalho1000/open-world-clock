package io.joao.worldclock.ui.widgets

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import io.joao.worldclock.ui.theme.Brand
import io.joao.worldclock.ui.theme.DaylightColors
import io.joao.worldclock.ui.theme.LocalIsDark
import io.joao.worldclock.ui.theme.daylight
import io.joao.worldclock.widget.ClockFace
import io.joao.worldclock.widget.ThemePalette
import io.joao.worldclock.widget.WidgetStyle

/**
 * Colours and faces shared by the catalog's miniatures.
 *
 * There is deliberately no Compose re-drawing of a widget here any more. There used to be one,
 * faithful to the three free kinds, and it was already a second implementation that could
 * drift from the renderer. At ten premium kinds it would have become ten more. Every preview
 * in the app now inflates the real RemoteViews through [NativeWidgetPreview], so what the
 * gallery shows is what the launcher will draw, by construction rather than by diligence.
 */

internal val LightBase = DaylightColors(Color(0xFFF7F9FC), Brand.DayInk, Brand.DayInk2, Brand.AccentInk, Brand.DayInk.copy(alpha = 0.12f))
internal val DarkBase = DaylightColors(Color(0xFF151E33), Brand.NightInk, Brand.NightInk2, Brand.AccentNight, Color.White.copy(alpha = 0.16f))

/**
 * A palette's colours, exactly as the launcher will paint them. The catalog carries plain
 * values rather than colour resources, so there is nothing to resolve and nothing that can
 * resolve differently here than it does in the widget.
 */
fun paletteColors(p: ThemePalette): DaylightColors =
    DaylightColors(Color(p.bg), Color(p.ink), Color(p.ink2), Color(p.accent), Color(p.track))

/**
 * The colours a look actually paints, free styles included. A free card has to show its own
 * surface rather than the app's, or Daylight, Light and Dark all look like the same card.
 * [isDay] is the real daylight of the widget's first city, so Daylight shows what it shows now.
 */
@Composable
fun lookColors(look: LookSpec, isDay: Boolean): DaylightColors =
    look.palette?.let { paletteColors(it) } ?: when (look.style) {
        WidgetStyle.AUTO -> daylight(isDay)
        WidgetStyle.LIGHT -> LightBase
        WidgetStyle.DARK -> DarkBase
    }

/** The chosen clock face, as the same system family the widget asks the launcher for. */
@Composable
fun ClockFace.composeFamily(): FontFamily? {
    val name = family ?: return null
    return remember(name) { FontFamily(android.graphics.Typeface.create(name, android.graphics.Typeface.NORMAL)) }
}
