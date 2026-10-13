package io.joao.worldclock.ui.backdrop

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.IntSize
import io.joao.worldclock.core.Sky
import io.joao.worldclock.core.Sun
import io.joao.worldclock.ui.map.LandShape
import io.joao.worldclock.ui.map.loadLand
import io.joao.worldclock.ui.map.nightBitmap
import io.joao.worldclock.ui.theme.LocalIsDark
import java.time.Instant
import java.time.ZoneId
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/**
 * The app background: the real world, centred and spotlit on the reference city, shaded by the live
 * terminator, under a wash of that city's own sky.
 *
 * Three rules hold this together, and each one exists because breaking it looked wrong:
 *
 *  1. **Lightness is clamped, hue is not.** The wash borrows the sky phase's hue and some of its
 *     chroma, but its lightness is pinned to a narrow band by [washBand]. Text contrast is therefore
 *     invariant across the whole day: there is no hour at which `onBackground` gets closer to the
 *     surface it sits on. Only colour moves.
 *  2. **The focal point sits beside the clock, not behind it.** City cards cover most of the screen
 *     and are nearly opaque, so the only place a backdrop is genuinely visible is the header. The
 *     halo is placed in the gap to the right of the time readout and below the header icons.
 *  3. **It ticks once a minute.** Callers pass a minute-quantised instant. The terminator cannot
 *     visibly move faster than that, and redrawing an 18KB path every second would be absurd.
 */
object Backdrop {
    /** How tightly the world closes around the reference city. 0 is a flat map, 1 is a pinhole. */
    const val FOCUS = 0.6f

    /**
     * How much longitude the backdrop spans across the screen's width.
     *
     * This is framed on width on purpose. A "cover" scale is driven by height here, because the map
     * is wide and short (3600x1330) while a phone is tall and narrow, and covering the height zooms
     * to roughly 30 degrees across: close enough that the coastline stops reading as Earth and
     * becomes grey blobs. Ninety-six degrees shows your continent and its neighbours.
     */
    const val DEGREES_ACROSS = 96f

    /**
     * Where the reference city sits on screen, as a fraction of the canvas.
     *
     * Chosen against the Clocks header: the icon row ends around 0.12h and the time readout runs to
     * roughly 0.55w, so this lands clear of both while still reading as part of the header block.
     */
    const val FOCAL_X = 0.76f
    const val FOCAL_Y = 0.17f
}

/** The two wash stops for one moment: the city's sky, held inside a safe lightness band. */
private fun washBand(altitude: Double, rising: Boolean, dark: Boolean): Pair<Color, Color> {
    val sky = Sky.stops(altitude, rising, dark)
    // 0 at astronomical night, 1 at a high sun. Drives only how light the wash is allowed to be.
    val k = ((altitude + 18.0) / 78.0).coerceIn(0.0, 1.0)
    val topL = if (dark) 0.205 + 0.045 * k else 0.928 + 0.030 * k
    val bottomL = if (dark) topL + 0.055 else topL - 0.038
    val pull = if (dark) 0.80 else 0.75
    val topC = min(sky.top.c * pull, if (dark) 0.055 else 0.026)
    val bottomC = min(sky.bottom.c * pull, if (dark) 0.065 else 0.032)
    return Color(Sky.argb(Sky.Oklch(topL, topC, sky.top.h, 1.0))) to
        Color(Sky.argb(Sky.Oklch(bottomL, bottomC, sky.bottom.h, 1.0)))
}

@Composable
fun WorldBackdrop(
    latitude: Double,
    longitude: Double,
    cityName: String,
    zone: ZoneId,
    instant: Instant,
    modifier: Modifier = Modifier,
) {
    val dark = LocalIsDark.current
    val context = LocalContext.current
    val measurer = rememberTextMeasurer()
    val land = remember(context) { loadLand(context) }
    val north = land?.north ?: 75.0
    val south = land?.south ?: -58.0
    val shade = remember(instant, dark) { nightBitmap(instant, north, south, if (dark) 0.46f else 0.34f) }

    val altitude = remember(instant, latitude, longitude) { Sun.altitude(instant, latitude, longitude) }
    val rising = remember(instant, latitude, longitude) { Sky.rising(instant, latitude, longitude, altitude) }
    val (washTop, washBottom) = remember(altitude, rising, dark) { washBand(altitude, rising, dark) }
    val isDay = altitude > Sky.HORIZON
    val offsetMinutes = remember(zone, instant) { zone.rules.getOffset(instant).totalSeconds / 60 }
    val label = remember(cityName, offsetMinutes) { cityName.uppercase() + "   " + utcLabel(offsetMinutes) }

    Canvas(modifier) {
        drawRect(Brush.verticalGradient(listOf(washTop, washBottom)))
        val focal = Offset(size.width * Backdrop.FOCAL_X, size.height * Backdrop.FOCAL_Y)
        if (land != null) drawSpotlitWorld(land, latitude, longitude, focal, dark, shade)
        drawHomeMark(focal, isDay, dark)
        drawHomeLabel(measurer, label, focal, dark)
        drawStars(altitude, dark)
    }
}

/**
 * The map, drawn into its own layer and then masked down to a spotlight on the reference city.
 *
 * The mask is a radial gradient composited with [BlendMode.DstIn], which keeps the map only where
 * the gradient is opaque. Drawing the fade as a normal overlay instead would tint the wash
 * underneath it, which is exactly what we do not want: the wash is carrying the contrast guarantee.
 */
private fun DrawScope.drawSpotlitWorld(
    land: LandShape,
    latitude: Double,
    longitude: Double,
    focal: Offset,
    dark: Boolean,
    shade: androidx.compose.ui.graphics.ImageBitmap,
) {
    val scale = size.width / (Backdrop.DEGREES_ACROSS * (land.width / 360f))
    val homeX = ((longitude + 180.0) / 360.0 * land.width).toFloat()
    val homeY = ((land.north - latitude) / (land.north - land.south) * land.height).toFloat()
    val originX = focal.x - homeX * scale
    val originY = focal.y - homeY * scale

    val landColor = if (dark) Color(0xFFBCD4FF).copy(alpha = 0.11f) else Color(0xFF17304F).copy(alpha = 0.085f)
    val coastColor = if (dark) Color(0xFFD6E6FF).copy(alpha = 0.26f) else Color(0xFF17304F).copy(alpha = 0.24f)

    drawIntoCanvas { canvas ->
        canvas.saveLayer(Rect(Offset.Zero, size), Paint())
        withTransform({
            translate(originX, originY)
            scale(scale, scale, Offset.Zero)
        }) {
            drawPath(land.path, landColor)
            drawPath(land.path, coastColor, style = Stroke(width = 1.6.dp.toPx() / scale))
            drawZoneBand(land, longitude, dark, scale)
            drawImage(
                image = shade,
                dstOffset = IntOffset.Zero,
                dstSize = IntSize(land.width.toInt(), land.height.toInt()),
                filterQuality = FilterQuality.Low,
            )
        }
        drawRect(
            brush = Brush.radialGradient(
                0f to Color.Black,
                0.5f to Color.Black.copy(alpha = 1f - Backdrop.FOCUS * 0.45f),
                1f to Color.Black.copy(alpha = (0.5f - Backdrop.FOCUS * 0.5f).coerceAtLeast(0f)),
                center = focal,
                radius = max(size.width, size.height) * (0.95f - Backdrop.FOCUS * 0.52f),
            ),
            blendMode = BlendMode.DstIn,
        )
        canvas.restore()
    }
}

/**
 * The strip of the planet around your city, lit and edged, so the mark is a place on Earth rather
 * than a ring floating on a coastline.
 *
 * This is centred on the city's own longitude, deliberately, and not on the standard meridian of
 * its UTC offset. Civil time zones wander a long way from their meridians: Lisbon sits at 9 degrees
 * west and keeps UTC+1, whose meridian is 15 degrees east, so a meridian band drew itself most of a
 * screen to the right of Portugal and highlighted the sea. Spain, France and the whole of China are
 * worse. A band under the pin is always true and always visible; the exact offset is stated in
 * words by the label instead, where it cannot be misread.
 *
 * Drawn inside the map transform so it stays locked to the geography, and before the terminator so
 * night still falls across it.
 */
private fun DrawScope.drawZoneBand(land: LandShape, cityLongitude: Double, dark: Boolean, scale: Float) {
    val pxPerDegree = land.width / 360f
    val centreX = ((cityLongitude + 180.0) * pxPerDegree).toFloat()
    val halfWidth = 7.5f * pxPerDegree
    val fill = if (dark) Color(0xFFBFD6FF).copy(alpha = 0.17f) else Color.White.copy(alpha = 0.52f)
    val edge = if (dark) Color(0xFFD9E8FF).copy(alpha = 0.40f) else Color(0xFF17304F).copy(alpha = 0.30f)
    val hairline = 1.dp.toPx() / scale
    // The band wraps: a zone near the date line is split across both edges of an equirectangular map.
    for (shift in listOf(-land.width, 0f, land.width)) {
        val left = centreX - halfWidth + shift
        drawRect(fill, topLeft = Offset(left, 0f), size = Size(halfWidth * 2f, land.height))
        drawLine(edge, Offset(left, 0f), Offset(left, land.height), strokeWidth = hairline)
        val right = left + halfWidth * 2f
        drawLine(edge, Offset(right, 0f), Offset(right, land.height), strokeWidth = hairline)
    }
}

/** The reference city named on the backdrop, so the mark is never an unexplained ring. */
private fun DrawScope.drawHomeLabel(measurer: TextMeasurer, label: String, focal: Offset, dark: Boolean) {
    val layout = measurer.measure(
        text = label,
        style = TextStyle(
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.8.sp,
            color = if (dark) Color(0xFFE8F0FF) else Color(0xFF17304F),
        ),
    )
    val margin = 8.dp.toPx()
    // Above the mark, because below it is where the first city card starts.
    val topLeft = Offset(
        x = (focal.x - layout.size.width / 2f).coerceIn(margin, (size.width - layout.size.width - margin).coerceAtLeast(margin)),
        y = focal.y - 30.dp.toPx() - layout.size.height,
    )
    drawText(layout, topLeft = topLeft, alpha = if (dark) 0.80f else 0.72f)
}

/**
 * Your city: a glow, rings to find it by, and a pin lit by whether its own sun is up.
 *
 * On the light theme the glow is a pale cream rather than the pin's amber. Saturated warm over the
 * cool blue-grey wash mixes straight to khaki, which looked like dirt on the screen; a near-white
 * warm reads as light falling on the map instead of paint added to it. The dark theme has no such
 * problem and keeps the saturated colour.
 */
private fun DrawScope.drawHomeMark(focal: Offset, isDay: Boolean, dark: Boolean) {
    val pin = if (isDay) Color(0xFFF2C14E) else Color(0xFF8DB1F7)
    val glow = when {
        dark && isDay -> Color(0xFFF2C14E).copy(alpha = 0.22f)
        dark -> Color(0xFF8DB1F7).copy(alpha = 0.20f)
        isDay -> Color(0xFFFFF4DA).copy(alpha = 0.55f)
        else -> Color(0xFFE4ECFD).copy(alpha = 0.50f)
    }
    val glowRadius = max(size.width, size.height) * 0.20f
    drawCircle(
        brush = Brush.radialGradient(
            0f to glow,
            1f to glow.copy(alpha = 0f),
            center = focal,
            radius = glowRadius,
        ),
        radius = glowRadius,
        center = focal,
    )
    val ring = if (dark) Color(0xFFECF3FF) else Color(0xFF182848)
    drawCircle(ring.copy(alpha = 0.80f), radius = 11.dp.toPx(), center = focal, style = Stroke(width = 1.8.dp.toPx()))
    drawCircle(ring.copy(alpha = 0.34f), radius = 21.dp.toPx(), center = focal, style = Stroke(width = 1.4.dp.toPx()))
    drawCircle(pin.copy(alpha = 0.30f), radius = 32.dp.toPx(), center = focal, style = Stroke(width = 1.2.dp.toPx()))
    // A disc inside a contrasting collar, so the pin cannot vanish into a coastline behind it.
    drawCircle(ring.copy(alpha = 0.60f), radius = 6.4.dp.toPx(), center = focal)
    drawCircle(pin.copy(alpha = 1f), radius = 4.4.dp.toPx(), center = focal)
}

/**
 * Stars, once the reference city's own sun is properly down. Seeded so they never shimmer between
 * frames: the same 130 stars occupy the same places for the life of the install.
 */
private fun DrawScope.drawStars(altitude: Double, dark: Boolean) {
    val nightness = ((-altitude - 2.0) / 12.0).coerceIn(0.0, 1.0).toFloat()
    if (nightness <= 0.01f) return
    val random = Random(20261013)
    val tint = if (dark) Color(0xFFE2ECFF) else Color.White
    repeat(130) {
        val x = random.nextFloat() * size.width
        val y = random.nextFloat() * size.height * 0.85f
        val magnitude = random.nextFloat()
        val alpha = nightness * (0.16f + magnitude * 0.66f) * (if (dark) 0.90f else 0.50f)
        drawCircle(tint.copy(alpha = alpha), radius = 0.5f + magnitude * 1.1f, center = Offset(x, y))
    }
}

/** "UTC+1", "UTC-3:30". The minutes only show on the zones that actually have them. */
private fun utcLabel(offsetMinutes: Int): String {
    val sign = if (offsetMinutes < 0) "-" else "+"
    val hours = abs(offsetMinutes) / 60
    val minutes = abs(offsetMinutes) % 60
    return if (minutes == 0) "UTC" + sign + hours
    else "UTC" + sign + hours + ":" + minutes.toString().padStart(2, '0')
}

