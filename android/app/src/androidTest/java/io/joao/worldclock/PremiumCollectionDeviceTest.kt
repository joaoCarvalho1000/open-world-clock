package io.joao.worldclock

import android.appwidget.AppWidgetManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Bundle
import android.os.Parcel
import android.view.View
import android.widget.FrameLayout
import android.widget.RemoteViews
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.joao.worldclock.core.*
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.widget.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class PremiumCollectionDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val cities = listOf(SavedCity("Asia/Kathmandu"), SavedCity("Europe/Lisbon"), SavedCity("America/New_York"), SavedCity("Asia/Tokyo"))
    private fun size(kind: WidgetKind): Pair<Int, Int> {
        val info = AppWidgetManager.getInstance(context).installedProviders.single { it.provider.className == kind.providerClass.name }
        val density = context.resources.displayMetrics.density
        return kotlin.math.ceil(info.minWidth / density).toInt() to kotlin.math.ceil(info.minHeight / density).toInt()
    }
    private fun options(w: Int, h: Int) = Bundle().apply {
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, w); putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, w)
        putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, h); putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, h)
    }
    private fun parcel(views: RemoteViews): RemoteViews = Parcel.obtain().let { data ->
        try { views.writeToParcel(data, 0); data.setDataPosition(0); RemoteViews.CREATOR.createFromParcel(data) }
        finally { data.recycle() }
    }

    @Test fun allTenKindsParcelRenderLocalizeResizeAndRecoverFromExpiry() {
        val capture = InstrumentationRegistry.getArguments().getString("capturePremium") == "true"
        val renderedAt = if (capture) Instant.now() else Instant.parse("2026-10-11T18:15:00Z")
        for (language in listOf(AppLanguage.EN, AppLanguage.PT, AppLanguage.ES)) {
            for (scale in listOf(1f, 1.5f)) {
                instrumentation.runOnMainSync {
                    val config = Configuration(context.resources.configuration).apply { fontScale = scale }
                    val themed = context.createConfigurationContext(config)
                    val catalog = CityCatalog(themed)
                    val settings = ClockSettings(cities, use24Hour = language != AppLanguage.PT, language = language)
                    WidgetKind.entries.filter { it.premium }.forEach { kind ->
                        for (large in listOf(false, true)) {
                            val (w, h) = if (large) 380 to 320 else size(kind)
                            val saved = WidgetConfig(themeId = if (scale == 1f) "paper" else "midnight", faceId = "system")
                            fun remote(access: Boolean) = parcel(WidgetRenderer.build(themed, kind, 9500, saved, settings, catalog,
                                options(w, h), access, renderedAt))
                            val views = remote(true)
                            val view = views.apply(themed, FrameLayout(themed))
                            val density = themed.resources.displayMetrics.density
                            // Autosizing can request a second layout, as a real ViewRoot performs.
                            repeat(2) {
                            view.measure(View.MeasureSpec.makeMeasureSpec((w * density).toInt(), View.MeasureSpec.EXACTLY),
                                View.MeasureSpec.makeMeasureSpec((h * density).toInt(), View.MeasureSpec.EXACTLY))
                            view.layout(0, 0, view.measuredWidth, view.measuredHeight)
                            }
                            assertTrue(view.width > 0 && view.height > 0)
                            views.reapply(themed, view)
                            val fallback = remote(false).apply(themed, FrameLayout(themed))
                            val clockId = if (kind.forAccess(false) == WidgetKind.WORLD) R.id.time0 else R.id.single_time
                            assertNotNull("$kind free fallback", fallback.findViewById<View>(clockId))
                            assertEquals("paper".takeIf { scale == 1f } ?: "midnight", saved.themeId)
                            if (capture && (language == AppLanguage.EN || !large)) {
                                val image = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
                                view.draw(Canvas(image))
                                File(context.getExternalFilesDir(null), "premium-${kind.name}-${language.name}-$scale-${if (large) "large" else "min"}.png")
                                    .outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
                                image.recycle()
                            }
                            // Essential answers must remain visible, not merely inflate successfully.
                            val answers = listOf(R.id.px_summary, R.id.px_detail, R.id.wd_next) +
                                if (kind == WidgetKind.DATELINE) listOf(R.id.px_meta0, R.id.px_meta1, R.id.px_meta2) else emptyList()
                            for (textId in answers) {
                                val answer = view.findViewById<TextView>(textId) ?: continue
                                if (answer.visibility != View.VISIBLE || answer.text.isNullOrBlank()) continue
                                val layout = answer.layout
                                assertNotNull("$kind $language $scale answer layout", layout)
                                assertTrue("$kind $language $scale answer height: ${layout.height} in ${answer.height}, text=${answer.text}", layout.height <= answer.height + 1)
                                for (line in 0 until layout.lineCount) assertEquals(
                                    "$kind $language $scale clipped answer: ${answer.text}", 0, layout.getEllipsisCount(line))
                                val rect = android.graphics.Rect(0, 0, answer.width, answer.height)
                                (view as android.view.ViewGroup).offsetDescendantRectToMyCoords(answer, rect)
                                assertTrue("$kind $language $scale answer below widget", rect.bottom <= view.height)
                            }
                        }
                    }
                }
            }
        }
    }

    @Test fun polarAndNoOverlapStatesDoNotFabricateEvents() {
        instrumentation.runOnMainSync {
            val catalog = CityCatalog(context)
            val settings = ClockSettings(listOf(SavedCity("UTC", workDays = emptySet())), language = AppLanguage.EN)
            val next = WidgetRenderer.build(context, WidgetKind.NEXT, 9501, WidgetConfig(), settings, catalog, options(240, 200), true)
                .apply(context, FrameLayout(context))
            assertTrue(next.findViewById<TextView>(R.id.px_summary).text.toString().contains("No overlap"))
            val change = WidgetRenderer.build(context, WidgetKind.CHANGE, 9502, WidgetConfig(), settings, catalog, options(300, 150), true)
                .apply(context, FrameLayout(context))
            assertTrue(change.findViewById<TextView>(R.id.px_summary).text.toString().contains("No clock change"))
            for ((date, key) in listOf("2026-06-21T12:00:00Z" to R.string.widget_solar_polar_day,
                "2026-12-21T12:00:00Z" to R.string.widget_solar_polar_night)) {
                val polar = WidgetRenderer.build(context, WidgetKind.DAYLIGHT, 9503, WidgetConfig(),
                    settings.copy(cities = listOf(SavedCity("Arctic/Longyearbyen"))), catalog, options(240, 240),
                    true, Instant.parse(date)).apply(context, FrameLayout(context))
                assertEquals(context.getString(key), polar.findViewById<TextView>(R.id.px_summary).text.toString())
            }
        }
    }
}
