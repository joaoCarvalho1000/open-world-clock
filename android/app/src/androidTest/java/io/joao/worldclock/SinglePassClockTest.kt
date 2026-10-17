package io.joao.worldclock

import android.appwidget.AppWidgetManager
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextClock
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.WidgetKind
import io.joao.worldclock.widget.WidgetRenderer
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

/**
 * The widget gallery inflates the real RemoteViews and lays them out once, where a launcher and
 * the existing device test both measure twice. An autosizing clock that only resolves on the
 * second pass therefore renders blank in the gallery, which is the first thing anyone sees.
 *
 * Board's four clocks disappeared exactly that way while Duo's survived, so the single pass is
 * the case worth pinning down.
 */
@RunWith(AndroidJUnit4::class)
class SinglePassClockTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val settings = ClockSettings(
        listOf(SavedCity("America/Sao_Paulo"), SavedCity("Europe/Lisbon"),
            SavedCity("America/New_York"), SavedCity("Asia/Tokyo")),
    )

    private fun bounds(kind: WidgetKind): Pair<Int, Int> {
        val info = AppWidgetManager.getInstance(context).installedProviders
            .single { it.provider.className == kind.providerClass.name }
        val density = context.resources.displayMetrics.density
        return kotlin.math.ceil(info.minWidth / density).toInt() to
            kotlin.math.ceil(info.minHeight / density).toInt()
    }

    private fun options(w: Int, h: Int) = Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, w)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, w)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, h)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, h)
    }

    private fun texts(view: View): List<TextView> = if (view is ViewGroup)
        (0 until view.childCount).flatMap { texts(view.getChildAt(it)) } else listOfNotNull(view as? TextView)

    @Test fun clocksSurviveTheGallerysSingleLayoutPass() {
        val report = StringBuilder()
        var broken = 0
        instrumentation.runOnMainSync {
            val catalog = CityCatalog(context)
            val combos = listOf(WidgetKind.DUO, WidgetKind.BOARD, WidgetKind.WORKDAY, WidgetKind.SINGLE)
                .flatMap { k -> listOf(true, false).map { k to it } }
            combos.forEach { (kind, use24) ->
                val (w, h) = bounds(kind)
                val remote = WidgetRenderer.build(
                    context, kind, 9400, WidgetConfig(), settings.copy(use24Hour = use24), catalog, options(w, h),
                    hasAccess = true, now = Instant.parse("2026-10-12T11:08:00Z"),
                )
                val view = remote.apply(context, FrameLayout(context))
                val density = context.resources.displayMetrics.density
                // Exactly one pass, which is what the gallery gives it.
                view.measure(
                    View.MeasureSpec.makeMeasureSpec((w * density).toInt(), View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec((h * density).toInt(), View.MeasureSpec.EXACTLY),
                )
                view.layout(0, 0, view.measuredWidth, view.measuredHeight)

                texts(view).filterIsInstance<TextClock>()
                    // A period marker is legitimately gone in 24 hour mode; only what the widget
                    // actually shows has to be legible.
                    .filter { it.visibility == View.VISIBLE }
                    .forEachIndexed { i, clock ->
                    val lines = clock.layout?.lineCount ?: -1
                    val drawn = clock.layout?.getLineWidth(0) ?: 0f
                    report.append(
                        "$kind ${if (use24) "24h" else "12h"}[$i] box=${clock.width}x${clock.height} textSize=${clock.textSize} " +
                            "lines=$lines drawnWidth=$drawn text='${clock.text}'\n",
                    )
                    // A box shorter than the text pushes the digits outside their own bounds,
                    // and with bottom gravity they are clipped away completely. That is how
                    // Board and Workday lost their clocks while every other check still passed.
                    val textHeight = clock.layout?.height ?: 0
                    val overflows = textHeight > clock.height + 1
                    if (clock.text.isNullOrBlank() || clock.height == 0 || drawn <= 0f || overflows) broken++
                }
            }
        }
        println(report)
        assertFalse("no clocks were found at all", report.isEmpty())
        assertTrue("clocks blank or collapsed after one pass:\n$report", broken == 0)
    }
}
