package io.joao.worldclock

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import android.widget.TextClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.joao.worldclock.core.*
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.widget.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Inflates real RemoteViews through Android's restricted host path, catching unsupported methods. */
@RunWith(AndroidJUnit4::class)
class WidgetRenderingTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context get() = instrumentation.targetContext
    private val settings = ClockSettings(listOf(SavedCity("Asia/Kathmandu"),SavedCity("America/New_York"),SavedCity("Asia/Tokyo"),SavedCity("Europe/Lisbon")))

    @Test fun originalClockDigitsAndPeriodsFitAtLargeText() {
        instrumentation.runOnMainSync {
            val enlarged = context.createConfigurationContext(android.content.res.Configuration(context.resources.configuration).apply { fontScale = 1.5f })
            val utcHour = java.time.Instant.now().atZone(java.time.ZoneOffset.UTC).hour
            val offset = 12 - utcHour
            val zone = if (offset == 0) "UTC" else "GMT" + java.time.ZoneOffset.ofHours(offset).id
            for ((kind, size) in listOf(WidgetKind.SINGLE to (100 to 80), WidgetKind.WORLD to (180 to 80), WidgetKind.MEETING to (220 to 140))) {
                val (w, h) = size
                val options = Bundle().apply {
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, w); putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, w)
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, h); putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, h)
                }
                val view = WidgetRenderer.build(enlarged, kind, 9700, WidgetConfig(),
                    settings.copy(cities = listOf(SavedCity(zone)), use24Hour = false), CityCatalog(enlarged), options, false)
                    .apply(enlarged, FrameLayout(enlarged))
                val density = enlarged.resources.displayMetrics.density
                repeat(2) {
                    view.measure(View.MeasureSpec.makeMeasureSpec((w * density).toInt(), View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec((h * density).toInt(), View.MeasureSpec.EXACTLY))
                    view.layout(0, 0, view.measuredWidth, view.measuredHeight)
                }
                val id = when (kind) { WidgetKind.SINGLE -> R.id.single_time; WidgetKind.WORLD -> R.id.time0; else -> R.id.mtime0 }
                val clock = view.findViewById<TextClock>(id)
                assertEquals("$kind large-text clock wraps: ${clock.text}", 1, clock.layout.lineCount)
                assertTrue("$kind large-text clock clipped", clock.layout.getLineWidth(0) <= clock.width + 1)
                val periodId = if (kind == WidgetKind.SINGLE) R.id.single_ampm else if (kind == WidgetKind.WORLD) R.id.ampm0 else null
                periodId?.let { assertEquals(1, view.findViewById<TextClock>(it).layout.lineCount) }
            }
        }
    }

    @Test fun everyWidgetAndStyleInflatesAtCompactAndLargeSizes() {
        instrumentation.runOnMainSync {
            val catalog = CityCatalog(context)
            WidgetKind.entries.filterNot { it.premium }.forEach { kind ->
                WidgetStyle.entries.forEach { style ->
                    listOf(120 to 110, 320 to 280).forEach { (width,height) ->
                        val options = Bundle().apply {
                            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,width)
                            putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,width)
                            putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,height)
                            putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,height)
                        }
                        val remote = WidgetRenderer.build(context,kind,42,WidgetConfig(style=style),settings,catalog,options)
                        val view = remote.apply(context,FrameLayout(context))
                        view.measure(View.MeasureSpec.makeMeasureSpec(width*3,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height*3,View.MeasureSpec.EXACTLY))
                        view.layout(0,0,view.measuredWidth,view.measuredHeight)
                        val clockId = when(kind) { WidgetKind.SINGLE -> R.id.single_time; WidgetKind.WORLD -> R.id.time0; WidgetKind.MEETING -> R.id.mtime0; else -> error("Free widget expected") }
                        val clock = view.findViewById<TextClock>(clockId)
                        assertNotNull("$kind/$style clock",clock)
                        assertEquals("Asia/Kathmandu",clock.timeZone)
                        assertEquals("HH:mm",clock.format24Hour.toString())
                        assertFalse("$kind/$style live text",clock.text.isNullOrEmpty())
                        if (kind == WidgetKind.MEETING) {
                            assertEquals("Compact planner widgets must keep hour numbers", View.VISIBLE,
                                view.findViewById<View>(R.id.meet_axis).visibility)
                        }
                        remote.reapply(context,view)
                    }
                }
            }
        }
    }

    @Test fun independentInstancesKeepConfigurationAndDeletionIsScoped() {
        val store = WidgetStore(context)
        try {
            store.save(9001,WidgetConfig(listOf("Asia/Tokyo"),WidgetStyle.DARK))
            store.save(9002,WidgetConfig(listOf("America/New_York"),WidgetStyle.LIGHT))
            assertEquals("Asia/Tokyo",WidgetStore(context).load(9001).cities(WidgetKind.SINGLE,settings).single().zoneId)
            assertEquals(WidgetStyle.LIGHT,WidgetStore(context).load(9002).style)
            store.delete(intArrayOf(9001))
            assertFalse(store.isConfigured(9001))
            assertTrue(store.isConfigured(9002))
            assertEquals("America/New_York",store.load(9002).zones.single())
        } finally { store.delete(intArrayOf(9001,9002)) }
    }

    @Test fun defaultWorldWidgetShowsAllFourSelectedCities() {
        instrumentation.runOnMainSync {
            val remote = WidgetRenderer.build(context,WidgetKind.WORLD,42,WidgetConfig(),settings,CityCatalog(context),null)
            val view = remote.apply(context,FrameLayout(context))
            listOf(R.id.row0,R.id.row1,R.id.row2,R.id.row3).forEach {
                assertEquals("Default 4x2 must keep every selected city",View.VISIBLE,view.findViewById<View>(it).visibility)
            }
        }
    }

    @Test fun appManifestLimitsPermissionsToClockAndPlayBilling() {
        val info = context.packageManager.getPackageInfo(context.packageName,android.content.pm.PackageManager.GET_PERMISSIONS)
        val permissions = info.requestedPermissions?.toSet().orEmpty()
        assertEquals(setOf(
            "android.permission.RECEIVE_BOOT_COMPLETED",
            "com.android.vending.BILLING",
            "android.permission.INTERNET",
            "android.permission.ACCESS_NETWORK_STATE",
            "${context.packageName}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
        ), permissions)
        assertFalse("android.permission.ACCESS_FINE_LOCATION" in permissions)
        assertFalse("android.permission.SCHEDULE_EXACT_ALARM" in permissions)
        assertEquals(0,info.applicationInfo!!.flags and android.content.pm.ApplicationInfo.FLAG_ALLOW_BACKUP)
    }
}
