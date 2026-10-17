package io.joao.worldclock.ui.map

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.layout.Column
import io.joao.worldclock.R
import io.joao.worldclock.core.ClockEngine
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.DayNightIcon
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.ScreenTitle
import io.joao.worldclock.ui.components.rememberNow
import io.joao.worldclock.ui.theme.Brand
import io.joao.worldclock.ui.theme.LocalIsDark
import io.joao.worldclock.ui.theme.daylight
import java.time.Instant
import kotlin.math.hypot

@Composable
fun MapScreen(settings: ClockSettings, onBack: () -> Unit, onOpenConverter: (String) -> Unit) {
    val t = LocalStrings.current
    val locale = t.locale
    val context = LocalContext.current
    val services = LocalServices.current
    val land = remember { loadLand(context) }
    val now by rememberNow()
    val minute = now.epochSecond / 60
    val dark = LocalIsDark.current
    val north = land?.north ?: 75.0
    val south = land?.south ?: -58.0
    val shade = remember(minute) { nightBitmap(Instant.ofEpochSecond(minute * 60), north, south, 0.55f) }
    val pins = settings.cities.map { saved ->
        val city = services.catalog.find(saved.zoneId, locale)
        Triple(saved, city, ClockEngine.reading(city, saved, now, settings.use24Hour, locale = locale))
    }

    val ocean = if (dark) Color(0xFF1A2A4A) else Color(0xFFDCE7F5)
    val landColor = if (dark) Color(0xFF4B5D80) else Color(0xFFFCFDFF)
    val coast = if (dark) Color.White.copy(alpha = 0.14f) else Brand.DayInk.copy(alpha = 0.18f)
    val ring = MaterialTheme.colorScheme.surface
    val daySummary = pins.count { it.third.isDay }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, t.get(R.string.map_back)) }
                ScreenTitle(t.get(R.string.map_title), t.get(R.string.map_subtitle))
            }
        }
        item {
            val description = if (pins.isEmpty()) t.get(R.string.map_a11y_empty) else
                t.get(R.string.map_a11y, daySummary, pins.size) + " " + pins.joinToString {
                    it.third.label + " " + t.get(if (it.third.isDay) R.string.day_phase_daytime else R.string.day_phase_night)
                }
            Surface(shape = RoundedCornerShape(24.dp), color = ocean, modifier = Modifier.fillMaxWidth()) {
                Canvas(
                    Modifier.fillMaxWidth().aspectRatio(3600f / 1330f).clipToBounds()
                        .semantics { contentDescription = description }
                        .pointerInput(pins) {
                            detectTapGestures { tap ->
                                val hit = pins.minByOrNull { (_, city, _) ->
                                    val x = ((city.longitude + 180) / 360 * size.width).toFloat()
                                    val y = ((north - city.latitude) / (north - south) * size.height).toFloat()
                                    hypot(x - tap.x, y - tap.y)
                                }
                                if (hit != null) {
                                    val x = ((hit.second.longitude + 180) / 360 * size.width).toFloat()
                                    val y = ((north - hit.second.latitude) / (north - south) * size.height).toFloat()
                                    if (hypot(x - tap.x, y - tap.y) < 32.dp.toPx()) onOpenConverter(hit.first.zoneId)
                                }
                            }
                        },
                ) {
                    if (land != null) {
                        scale(size.width / land.width, size.height / land.height, pivot = Offset.Zero) {
                            drawPath(land.path, landColor)
                            drawPath(land.path, coast, style = Stroke(width = 1.5f))
                        }
                    }
                    // One bilinearly scaled bitmap: smooth terminator, no seams between overlapping cells.
                    drawImage(shade, dstSize = IntSize(size.width.toInt(), size.height.toInt()), filterQuality = FilterQuality.Low)
                    pins.forEach { (_, city, reading) ->
                        val x = ((city.longitude + 180) / 360 * size.width).toFloat()
                        val y = ((north - city.latitude) / (north - south) * size.height).toFloat()
                        translate(x, y) {
                            drawCircle(ring, 6.dp.toPx(), Offset.Zero)
                            drawCircle(if (reading.isDay) Brand.Sun else Brand.AccentNight, 4.dp.toPx(), Offset.Zero)
                        }
                    }
                }
            }
        }
        if (land == null) {
            item {
                Text(t.get(R.string.map_unavailable), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(pins, key = { it.first.zoneId }) { (saved, _, reading) ->
            val colors = daylight(reading.isDay)
            Surface(
                onClick = { onOpenConverter(saved.zoneId) },
                shape = RoundedCornerShape(20.dp), color = colors.container, contentColor = colors.ink,
                modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {
                    contentDescription = t.get(
                        R.string.map_row_a11y,
                        reading.label,
                        "${reading.time} ${reading.period}".trim(),
                        listOfNotNull(
                            t.get(if (reading.isDay) R.string.day_phase_daytime else R.string.day_phase_night),
                            reading.phase.takeIf { it.isNotBlank() },
                        ).joinToString(", "),
                    )
                },
            ) {
                val phase = reading.phase.ifBlank { reading.difference }
                val time = "${reading.time} ${reading.period}".trim()
                if (LocalDensity.current.fontScale >= 1.3f) {
                    // Large text: city gets its own line, phase and time share the next.
                    Column(Modifier.padding(horizontal = 18.dp, vertical = 14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            DayNightIcon(reading.isDay, colors.ink2, Modifier.size(18.dp))
                            Spacer(Modifier.width(12.dp))
                            Text(reading.label, style = MaterialTheme.typography.titleMedium)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(phase, style = MaterialTheme.typography.labelMedium, color = colors.ink2, modifier = Modifier.weight(1f))
                            Spacer(Modifier.width(12.dp))
                            Text(time, style = MaterialTheme.typography.titleLarge, maxLines = 1)
                        }
                    }
                } else {
                    Row(Modifier.padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        DayNightIcon(reading.isDay, colors.ink2, Modifier.size(18.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(reading.label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Text(phase, style = MaterialTheme.typography.labelMedium, color = colors.ink2, maxLines = 1)
                        Spacer(Modifier.width(12.dp))
                        Text(time, style = MaterialTheme.typography.titleLarge, maxLines = 1)
                    }
                }
            }
        }
    }
}
