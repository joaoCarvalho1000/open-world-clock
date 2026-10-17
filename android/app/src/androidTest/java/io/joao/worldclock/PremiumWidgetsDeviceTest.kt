package io.joao.worldclock

import android.appwidget.AppWidgetManager
import android.content.res.Configuration
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
import io.joao.worldclock.widget.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class PremiumWidgetsDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val settings = ClockSettings(listOf(SavedCity("Asia/Kathmandu"), SavedCity("America/New_York"),
        SavedCity("Asia/Tokyo"), SavedCity("Europe/Lisbon")))
    private fun bounds(kind: WidgetKind): Pair<Int, Int> {
        val info = AppWidgetManager.getInstance(context).installedProviders.single { it.provider.className == kind.providerClass.name }
        val density = context.resources.displayMetrics.density
        return kotlin.math.ceil(info.minWidth / density).toInt() to kotlin.math.ceil(info.minHeight / density).toInt()
    }
    private fun options(w: Int, h: Int) = Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, w)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, w)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, h)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, h)
    }
    private fun texts(view: View): List<TextView> = if (view is ViewGroup)
        (0 until view.childCount).flatMap { texts(view.getChildAt(it)) } else listOfNotNull(view as? TextView)

    @Test fun premiumLayoutsKeepClocksDatesAndTimelineReadableAtLargeText() {
        instrumentation.runOnMainSync {
            val config = Configuration(context.resources.configuration).apply { fontScale = 1.5f }
            val enlarged = context.createConfigurationContext(config)
            val catalog = CityCatalog(enlarged)
            WidgetKind.entries.filter { it in listOf(WidgetKind.DUO, WidgetKind.BOARD, WidgetKind.WORKDAY) }.forEach { kind ->
                listOf(true, false).forEach { use24 ->
                    val (w, h) = bounds(kind)
                    val remote = WidgetRenderer.build(enlarged, kind, 9300, WidgetConfig(themeId = "midnight", faceId = "mono"),
                        settings.copy(use24Hour = use24), catalog, options(w, h), hasAccess = true,
                        now = Instant.parse("2026-10-11T18:15:00Z"))
                    val view = remote.apply(enlarged, FrameLayout(enlarged))
                    val density = enlarged.resources.displayMetrics.density
                    // Autosizing can request a second layout, as a real ViewRoot performs.
                    repeat(2) {
                    view.measure(View.MeasureSpec.makeMeasureSpec((w * density).toInt(), View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec((h * density).toInt(), View.MeasureSpec.EXACTLY))
                    view.layout(0, 0, view.measuredWidth, view.measuredHeight)
                    }
                    val clocks = texts(view).filterIsInstance<TextClock>()
                    assertEquals(if (kind == WidgetKind.WORKDAY) 1 else kind.maxCities, clocks.size)
                    clocks.forEach { clock ->
                        val layout = clock.layout
                        assertNotNull("$kind live clock layout", layout)
                        assertEquals("$kind clock must stay on one line", 1, layout.lineCount)
                        assertTrue("$kind clock must fit horizontally", layout.getLineWidth(0) <= clock.width + 1)
                        assertTrue("$kind clock must fit vertically: ${layout.height} in ${clock.height}, text=${clock.text}", layout.height <= clock.height + 1)
                        assertFalse(clock.text.isNullOrBlank())
                    }
                    if (kind == WidgetKind.WORKDAY) {
                        listOf(R.id.wd_axis0, R.id.wd_axis1, R.id.wd_axis2, R.id.wd_axis3, R.id.wd_axis4).forEach { id ->
                            val axis = view.findViewById<TextView>(id)
                            assertEquals(View.VISIBLE, axis.visibility)
                            assertTrue("Workday hour number must be present", axis.text.any { it.isDigit() })
                            assertTrue("Workday hour number must fit", axis.layout.getLineWidth(0) <= axis.width + 1)
                        }
                    } else {
                        assertFalse(view.findViewById<TextView>(R.id.tile_date0).text.isNullOrBlank())
                        assertNotEquals("Midnight in Kathmandu is previous day in New York",
                            view.findViewById<TextView>(R.id.tile_date0).text.toString(),
                            view.findViewById<TextView>(R.id.tile_date1).text.toString())
                    }
                }
            }
        }
    }

    @Test fun expiredPremiumProvidersRenderFreeFallbackAndRecoverWithoutLosingCities() {
        instrumentation.runOnMainSync {
            val catalog = CityCatalog(context)
            WidgetKind.entries.filter { it in listOf(WidgetKind.DUO, WidgetKind.BOARD, WidgetKind.WORKDAY) }.forEach { kind ->
                val saved = WidgetConfig(settings.cities.map { it.zoneId }.take(kind.maxCities), WidgetStyle.DARK, "rust", "serif")
                val (w, h) = bounds(kind)
                fun render(access: Boolean) = WidgetRenderer.build(context, kind, 9301, saved, settings, catalog, options(w, h), access)
                    .apply(context, FrameLayout(context))
                val expired = render(false)
                val fallbackClock = if (kind == WidgetKind.WORKDAY) R.id.single_time else R.id.time0
                assertEquals("Asia/Kathmandu", expired.findViewById<TextClock>(fallbackClock).timeZone)
                val restored = render(true)
                val clock = if (kind == WidgetKind.WORKDAY) R.id.wd_time else R.id.tile_time0
                assertEquals("Asia/Kathmandu", restored.findViewById<TextClock>(clock).timeZone)
                assertEquals("rust", saved.themeId)
                assertEquals(kind.maxCities, saved.zones.size)
            }
        }
    }

    @Test fun premiumProvidersAreRegisteredAndPinRequiresRealOwnership() {
        val manager = AppWidgetManager.getInstance(context)
        val providers = manager.installedProviders.filter { it.provider.packageName == context.packageName }
        assertEquals(13, providers.size)
        WidgetKind.entries.filter { it.premium }.forEach { kind ->
            assertTrue(providers.any { it.provider.className == kind.providerClass.name })
            // This fixture has no signed Play receipt. A render preview is never an activation.
            assertFalse(BaseWidgetProvider.requestPin(context, kind, WidgetConfig()))
        }
    }
}
