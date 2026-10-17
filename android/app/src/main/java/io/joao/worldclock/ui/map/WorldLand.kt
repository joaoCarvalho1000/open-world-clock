package io.joao.worldclock.ui.map

import android.content.Context
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.PathParser
import io.joao.worldclock.core.Sun
import org.json.JSONObject
import java.time.Instant

/**
 * The bundled world outline and the day/night terminator, shared by the Map screen and the Clocks
 * backdrop. Both used to live privately inside `MapScreen`; the backdrop needs the same two things,
 * and a second copy of a parsed 18KB path and a solar grid is not worth having.
 *
 * Equirectangular, from `shared/world-land.json`: x = (lng + 180) * 10, y = (north - lat) * 10.
 */
class LandShape(val path: Path, val width: Float, val height: Float, val north: Double, val south: Double)

private var cached: LandShape? = null

/**
 * Parsed once per process rather than once per composition. The asset never changes, and
 * [PathParser] over 18KB of path data is the single most expensive thing either screen does.
 */
fun loadLand(context: Context): LandShape? = synchronized(LandShape::class.java) {
    cached ?: runCatching {
        val json = JSONObject(context.assets.open("world-land.json").bufferedReader().use { it.readText() })
        LandShape(
            PathParser().parsePathString(json.getString("d")).toPath(),
            json.getDouble("width").toFloat(),
            json.getDouble("height").toFloat(),
            json.getDouble("north"),
            json.getDouble("south"),
        )
    }.getOrNull()?.also { cached = it }
}

const val GridCols = 144
const val GridRows = 54

/** Night opacity per grid cell: 0 in daylight, ramping through civil to astronomical twilight. */
fun nightGrid(instant: Instant, north: Double, south: Double): FloatArray {
    val out = FloatArray(GridCols * GridRows)
    for (r in 0 until GridRows) {
        val lat = north - (r + 0.5) * (north - south) / GridRows
        for (c in 0 until GridCols) {
            val lng = -180 + (c + 0.5) * 360.0 / GridCols
            val alt = Sun.altitude(instant, lat, lng)
            out[r * GridCols + c] = when {
                alt > 0 -> 0f
                alt < -12 -> 1f
                else -> (-alt / 12).toFloat()
            }
        }
    }
    return out
}

/**
 * The terminator as one small bitmap. Callers scale it bilinearly, which is what keeps the shadow
 * edge smooth and seamless instead of showing the grid it was computed on.
 */
fun nightBitmap(instant: Instant, north: Double, south: Double, strength: Float): ImageBitmap {
    val grid = nightGrid(instant, north, south)
    val pixels = IntArray(grid.size) {
        ((strength * grid[it] * 255f).toInt().coerceIn(0, 255) shl 24) or 0x0B1224
    }
    return android.graphics.Bitmap
        .createBitmap(pixels, GridCols, GridRows, android.graphics.Bitmap.Config.ARGB_8888)
        .asImageBitmap()
}
