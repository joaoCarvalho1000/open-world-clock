package io.joao.worldclock.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import io.joao.worldclock.R
import io.joao.worldclock.core.Sky
import java.time.Instant

/**
 * The widget background as a slice of sky.
 *
 * `widget_bg_day` and `widget_bg_night` are a single `<solid>` fill, which is why a widget reads
 * flat next to anything else on a home screen. The layouts already carry a full bleed
 * `widget_bg_layer` image for the paid palettes, so the gradient goes there and needs no layout
 * change and no new `RemoteViews` call beyond the `setImageViewBitmap` the premium widgets use.
 *
 * The corners are drawn into the bitmap because `widget_bg_layer` is `scaleType="fitXY"` and
 * nothing in `RemoteViews` can clip a child to a rounded parent. That is also why the bitmap keeps
 * the widget's real aspect ratio: a square bitmap stretched across a 4x2 widget would turn its
 * corner radius into an ellipse.
 */
object SkySurface {

    /** Enough pixels for a smooth ramp and a clean corner, few enough to stay cheap to build. */
    private const val MAX_EDGE = 480f

    /** The stops for one city at one moment, or null when there is no sun to follow. */
    fun stops(now: Instant, latitude: Double, longitude: Double, dark: Boolean): Pair<Int, Int> {
        val altitude = io.joao.worldclock.core.Sun.altitude(now, latitude, longitude)
        return Sky.gradient(altitude, Sky.rising(now, latitude, longitude, altitude), dark)
    }

    /**
     * [widthDp] and [heightDp] are the widget's own size, used for the aspect ratio and to keep the
     * corner radius circular once the launcher stretches the bitmap back up.
     */
    fun bitmap(context: Context, widthDp: Float, heightDp: Float, top: Int, bottom: Int): Bitmap {
        val density = context.resources.displayMetrics.density
        val wPx = (widthDp.coerceAtLeast(1f) * density)
        val hPx = (heightDp.coerceAtLeast(1f) * density)
        val scale = (MAX_EDGE / maxOf(wPx, hPx)).coerceAtMost(1f)
        val width = (wPx * scale).toInt().coerceIn(8, MAX_EDGE.toInt())
        val height = (hPx * scale).toInt().coerceIn(8, MAX_EDGE.toInt())
        val radius = context.resources.getDimensionPixelSize(R.dimen.widget_radius) * scale

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = LinearGradient(0f, 0f, 0f, height.toFloat(), top, bottom, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(RectF(0f, 0f, width.toFloat(), height.toFloat()), radius, radius, paint)
        return bitmap
    }
}
