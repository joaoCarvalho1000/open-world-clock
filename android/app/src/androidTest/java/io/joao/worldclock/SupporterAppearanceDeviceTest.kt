package io.joao.worldclock

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Bundle
import android.os.Parcel
import android.text.Spanned
import android.text.style.TypefaceSpan
import android.view.View
import android.widget.FrameLayout
import android.widget.RemoteViews
import android.widget.TextClock
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.widget.AppearanceCodec
import io.joao.worldclock.widget.AppearancePreset
import io.joao.worldclock.widget.AppearanceStore
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.ClockFace
import io.joao.worldclock.widget.PremiumCatalog
import io.joao.worldclock.widget.WidgetKind
import io.joao.worldclock.widget.WidgetRenderer
import io.joao.worldclock.widget.WidgetStore
import io.joao.worldclock.widget.WidgetStyle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * The Supporter looks have to survive the only path that matters: built here, parceled to a
 * launcher, inflated there, with the clock digits still ticking on their own.
 */
@RunWith(AndroidJUnit4::class)
class SupporterAppearanceDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context get() = instrumentation.targetContext
    private val settings = ClockSettings(
        listOf(SavedCity("Asia/Kathmandu"), SavedCity("America/New_York"), SavedCity("Asia/Tokyo"), SavedCity("Europe/Lisbon")),
    )
    private val twelveHour = settings.copy(use24Hour = false)

    /** The smallest size each widget declares it can be resized to, plus a roomy one. */
    private fun sizes(kind: WidgetKind) = when (kind) {
        WidgetKind.SINGLE -> listOf(100 to 80, 320 to 280)
        WidgetKind.WORLD -> listOf(180 to 80, 380 to 200)
        WidgetKind.MEETING -> listOf(220 to 140, 380 to 300)
        else -> {
            val info = AppWidgetManager.getInstance(context).installedProviders.single { it.provider.className == kind.providerClass.name }
            val density = context.resources.displayMetrics.density
            listOf(kotlin.math.ceil(info.minWidth / density).toInt() to kotlin.math.ceil(info.minHeight / density).toInt(), 380 to 360)
        }
    }

    private fun px(dp: Int) = (dp * context.resources.displayMetrics.density).toInt()

    private fun options(width: Int, height: Int) = Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, width)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, width)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, height)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, height)
    }

    /** Round trips the views through a Parcel, which is what reaches the launcher. */
    private fun parceled(views: RemoteViews): RemoteViews {
        val parcel = Parcel.obtain()
        return try {
            views.writeToParcel(parcel, 0)
            parcel.setDataPosition(0)
            RemoteViews.CREATOR.createFromParcel(parcel)
        } finally {
            parcel.recycle()
        }
    }

    private fun clockId(kind: WidgetKind) = when (kind) {
        WidgetKind.SINGLE -> R.id.single_time
        WidgetKind.WORLD -> R.id.time0
        WidgetKind.MEETING -> R.id.mtime0
        WidgetKind.DUO, WidgetKind.BOARD -> R.id.tile_time0
        WidgetKind.WORKDAY -> R.id.wd_time
        WidgetKind.DAYLIGHT -> R.id.px_clock
        WidgetKind.MAP -> R.id.px_time0
        else -> error("This kind has no live clock")
    }

    /** Walks up to [root] so a clipped row shows as a view that runs past the widget's edge. */
    private fun rightEdgeIn(view: View, root: View): Int {
        var right = view.width
        var current: View = view
        while (current !== root) {
            right += current.left
            current = current.parent as View
        }
        return right
    }

    /** The digits have to be whole: one line, no wider than the view, inside the widget. */
    private fun assertDigitsFit(label: String, clock: TextClock, root: View) {
        val layout = clock.layout
        assertNotNull("$label was never laid out", layout)
        assertEquals("$label digits must stay on one line", 1, layout.lineCount)
        val textWidth = layout.getLineWidth(0) + clock.paddingStart + clock.paddingEnd
        assertTrue("$label digits clipped: ${textWidth.toInt()} in ${clock.width}", textWidth <= clock.width + 1f)
        assertTrue("$label digits overflow the widget", rightEdgeIn(clock, root) <= root.width)
        assertTrue("$label digits have no height", clock.height > 0)
    }

    private fun assertFace(label: String, clock: TextClock, font: ClockFace) {
        val text = clock.text
        assertFalse("$label must keep live digits", text.isNullOrEmpty())
        val family = (text as? Spanned)?.getSpans(0, text.length, TypefaceSpan::class.java)?.firstOrNull()
        if (font.family == null) {
            assertNull("The free face must not carry a span", family)
        } else {
            assertEquals("$label face", font.family, family?.family)
            assertEquals(0, (text as Spanned).getSpanStart(family))
            assertEquals(text.length, text.getSpanEnd(family))
        }
    }

    @Test fun everyThemeAndFaceInflatesAndKeepsTickingAtEverySize() {
        instrumentation.runOnMainSync {
            val catalog = CityCatalog(context)
            WidgetKind.entries.filter { it in listOf(WidgetKind.SINGLE, WidgetKind.WORLD, WidgetKind.MEETING,
                WidgetKind.DUO, WidgetKind.BOARD, WidgetKind.WORKDAY, WidgetKind.DAYLIGHT, WidgetKind.MAP) }.forEach { kind ->
                PremiumCatalog.themes.forEach { theme ->
                    PremiumCatalog.faces.forEach { font ->
                        // 12 hour time is the tight case: longer digits plus an AM or PM.
                        val cases = sizes(kind).flatMap { listOf(settings to it, twelveHour to it) }
                        cases.forEach { (clockSettings, size) ->
                            val (width, height) = size
                            val config = WidgetConfig(style = WidgetStyle.AUTO, themeId = theme.id, faceId = font.id)
                            val remote = parceled(
                                WidgetRenderer.build(context, kind, 77, config, clockSettings, catalog, options(width, height), hasAccess = true),
                            )
                            val view = remote.apply(context, FrameLayout(context))
                            fun layOut() {
                                // Measured at this device's real density, which is what decides
                                // whether a wider face still fits the cell it was given.
                                view.measure(
                                    View.MeasureSpec.makeMeasureSpec(px(width), View.MeasureSpec.EXACTLY),
                                    View.MeasureSpec.makeMeasureSpec(px(height), View.MeasureSpec.EXACTLY),
                                )
                                view.layout(0, 0, view.measuredWidth, view.measuredHeight)
                            }
                            layOut()
                            val label = "$kind/$theme/$font/${if (clockSettings.use24Hour) "24h" else "12h"}/${width}x$height"
                            val clock = view.findViewById<TextClock>(clockId(kind))
                            assertNotNull("$label clock", clock)
                            assertEquals("Asia/Kathmandu", clock.timeZone)
                            assertEquals(if (clockSettings.use24Hour) "HH:mm" else if ((kind == WidgetKind.MEETING || kind.premium)) "h:mm a" else "h:mm",
                                clock.format24Hour.toString())
                            assertFace(label, clock, font)
                            assertDigitsFit(label, clock, view)
                            // A launcher reapplies the same views on its own schedule.
                            remote.reapply(context, view)
                            layOut()
                            assertFace("$label reapplied", clock, font)
                            assertDigitsFit("$label reapplied", clock, view)
                            if (clockSettings.use24Hour && (font == PremiumCatalog.face("serif") ||
                                (kind == WidgetKind.SINGLE && theme.id == "paper" && font.id in listOf("light", "medium"))) &&
                                InstrumentationRegistry.getArguments().getString("captureSupporter") == "true") {
                                val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
                                view.draw(Canvas(bitmap))
                                File(context.getExternalFilesDir(null), "widget-$kind-${theme.id}-${font.id}-${width}x$height.png")
                                    .outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                                bitmap.recycle()
                            }
                        }
                    }
                }
            }
        }
    }

    @Test fun losingAccessRepaintsAnExistingMeetingWidgetInBothSystemThemes() {
        instrumentation.runOnMainSync {
            listOf(Configuration.UI_MODE_NIGHT_NO, Configuration.UI_MODE_NIGHT_YES).forEach { mode ->
                val config = Configuration(context.resources.configuration).apply {
                    uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or mode
                }
                val themed = context.createConfigurationContext(config)
                val catalog = CityCatalog(themed)
                val look = WidgetConfig(themeId = "paper", faceId = "serif")
                fun render(access: Boolean) = parceled(WidgetRenderer.build(themed, WidgetKind.MEETING,
                    79, look, settings, catalog, options(380, 300), hasAccess = access))
                val paid = render(true).apply(themed, FrameLayout(themed))
                val free = render(false)
                free.reapply(themed, paid)
                val expected = free.apply(themed, FrameLayout(themed))
                listOf(R.id.meet_summary, R.id.meet_title, R.id.axis0, R.id.mname0, R.id.mtime0).forEach { id ->
                    assertEquals("Reused view must reset its color in system theme $mode",
                        expected.findViewById<TextView>(id).currentTextColor, paid.findViewById<TextView>(id).currentTextColor)
                }
                assertFace("Reused meeting clock", paid.findViewById(R.id.mtime0), PremiumCatalog.face("system"))
            }
        }
    }

    @Test fun aThemeRepaintsTheWidgetAndLosingAccessPutsTheFreeLookBack() {
        instrumentation.runOnMainSync {
            val catalog = CityCatalog(context)
            val config = WidgetConfig(listOf("Asia/Tokyo"), WidgetStyle.AUTO, "paper", "serif")
            fun render(hasAccess: Boolean): View {
                val remote = parceled(
                    WidgetRenderer.build(context, WidgetKind.SINGLE, 78, config, settings, catalog, options(320, 280), hasAccess = hasAccess),
                )
                return remote.apply(context, FrameLayout(context))
            }

            val paper = render(true)
            val paperInk = context.getColor(R.color.wc_paper_ink)
            assertEquals("A bought theme must actually repaint the widget", paperInk,
                paper.findViewById<TextView>(R.id.single_name).currentTextColor)

            val free = render(false)
            assertNotEquals("Without access the widget goes back to its free look", paperInk,
                free.findViewById<TextView>(R.id.single_name).currentTextColor)
            val text = free.findViewById<TextClock>(R.id.single_time).text
            assertFalse("The free widget still ticks", text.isNullOrEmpty())
            assertTrue(
                "Without access no paid face is drawn",
                (text as? Spanned)?.getSpans(0, text.length, TypefaceSpan::class.java).isNullOrEmpty(),
            )
        }
    }

    @Test fun savedLooksOutliveTheProcessAndTheWidgetsThatUsedThem() {
        val store = AppearanceStore(context)
        val mine = store.presets().map { it.id }.toSet()
        val first = AppearancePreset("test-paper", "Paper serif", WidgetStyle.LIGHT, "paper", "serif")
        val second = AppearancePreset("test-ink", "Ink mono", WidgetStyle.DARK, "ink", "mono")
        try {
            assertTrue(store.save(first))
            assertTrue(store.save(second))
            // A fresh store is what the next process gets.
            assertEquals(listOf(first, second), AppearanceStore(context).presets().filterNot { it.id in mine })

            val widgets = WidgetStore(context)
            widgets.save(9101, WidgetConfig(listOf("Asia/Tokyo"), WidgetStyle.AUTO, "ink", "mono"))
            assertEquals(PremiumCatalog.theme("ink"), WidgetStore(context).load(9101).theme)
            widgets.delete(intArrayOf(9101))
            assertEquals("Deleting a widget must not take saved looks with it", 2,
                AppearanceStore(context).presets().count { it.id !in mine })

            store.delete(first.id)
            assertEquals(listOf(second), AppearanceStore(context).presets().filterNot { it.id in mine })
        } finally {
            store.delete(first.id)
            store.delete(second.id)
            WidgetStore(context).delete(intArrayOf(9101))
        }
        assertTrue(AppearanceStore(context).presets().none { it.id.startsWith("test-") })
        assertTrue(AppearanceCodec.MAX_PRESETS >= 6)
    }

    @Test fun aWidgetStoredBeforeTheSupporterPackStillLoads() {
        val prefs = context.getSharedPreferences("widget_instances", Context.MODE_PRIVATE)
        try {
            // Exactly what the old build wrote: cities and a free style, nothing else.
            prefs.edit().putString("9102.zones", "Asia/Tokyo").putString("9102.style", "DARK").commit()
            val loaded = WidgetStore(context).load(9102)
            assertEquals(WidgetStyle.DARK, loaded.style)
            assertNull(loaded.theme)
            assertEquals(PremiumCatalog.face("system"), loaded.font)
            assertEquals(listOf("Asia/Tokyo"), loaded.zones)
            assertTrue(WidgetStore(context).isConfigured(9102))
        } finally {
            WidgetStore(context).delete(intArrayOf(9102))
        }
    }
}
