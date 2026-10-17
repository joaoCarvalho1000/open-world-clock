package io.joao.worldclock.ui.supporter

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.unit.dp
import io.joao.worldclock.R
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.theme.Brand
import io.joao.worldclock.ui.widgets.composeFamily
import io.joao.worldclock.widget.ClockFace
import io.joao.worldclock.widget.ThemePalette
import io.joao.worldclock.widget.WidgetStyle

/**
 * One look, shown as what it is: the surface it paints and the ink it writes in. Daylight is
 * drawn split, because that is the one look that is two surfaces.
 */
@Composable
fun LookSwatch(container: Color, ink: Color, nightHalf: Color?, modifier: Modifier = Modifier) {
    Canvas(modifier.size(16.dp)) {
        val radius = size.minDimension / 2f
        drawCircle(container, radius)
        if (nightHalf != null) {
            clipRect(left = size.width / 2f) { drawCircle(nightHalf, radius) }
        }
        drawCircle(ink, radius * 0.42f)
    }
}

/** The three free looks, drawn with the same colors the widget uses. */
@Composable
fun freeSwatch(style: WidgetStyle): Triple<Color, Color, Color?> = when (style) {
    WidgetStyle.AUTO -> Triple(Brand.DayCard, Brand.Accent, Brand.NightCard)
    WidgetStyle.LIGHT -> Triple(Color(0xFFF7F9FC), Brand.DayInk, null)
    WidgetStyle.DARK -> Triple(Color(0xFF151E33), Brand.NightInk, null)
}

/**
 * A look to choose. Locked looks stay tappable: trying one is how you see whether it is worth
 * anything to you, so the chip switches the preview and says plainly that it is a preview.
 */
@Composable
fun LookChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    style: WidgetStyle = WidgetStyle.AUTO,
    palette: ThemePalette? = null,
    locked: Boolean = false,
) {
    val t = LocalStrings.current
    val (container, ink, night) =
        if (palette != null) Triple(Color(palette.bg), Color(palette.ink), null) else freeSwatch(style)
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label, maxLines = 1) },
        // The chip's own label names the look, so the swatch stays decorative.
        leadingIcon = { LookSwatch(container, ink, night) },
        trailingIcon = if (!locked) null else {
            { Icon(Icons.Rounded.Lock, t.get(R.string.supporter_title), Modifier.size(FilterChipDefaults.IconSize)) }
        },
    )
}

/** A clock face to choose, written in the face itself. */
@Composable
fun FaceChip(label: String, selected: Boolean, face: ClockFace, locked: Boolean = false, onClick: () -> Unit) {
    val t = LocalStrings.current
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = {
            Text(label, maxLines = 1, fontFamily = face.composeFamily(), style = MaterialTheme.typography.labelLarge)
        },
        trailingIcon = if (!locked) null else {
            { Icon(Icons.Rounded.Lock, t.get(R.string.supporter_title), Modifier.size(FilterChipDefaults.IconSize)) }
        },
    )
}
