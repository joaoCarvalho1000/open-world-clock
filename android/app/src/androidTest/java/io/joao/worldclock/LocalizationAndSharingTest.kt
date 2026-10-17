package io.joao.worldclock

import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.joao.worldclock.core.*
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.engagement.Engagement
import io.joao.worldclock.i18n.AppStrings
import io.joao.worldclock.widget.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LocalizationAndSharingTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    @Test fun widgetsUseAppLanguageEvenWhenDeviceUsesEnglish() {
        instrumentation.runOnMainSync {
            for (language in listOf(AppLanguage.EN, AppLanguage.PT, AppLanguage.ES)) {
                val strings = AppStrings(context, language)
                assertEquals(language.locale().language, strings.context.resources.configuration.locales[0].language)
                val settings = ClockSettings(listOf(SavedCity("Europe/Lisbon")), language = language)
                for (kind in WidgetKind.entries) {
                    val view = WidgetRenderer.build(context, kind, 42, WidgetConfig(), settings, CityCatalog(context), null, hasAccess = true)
                        .apply(context, FrameLayout(context))
                    val displayed = text(view)
                    val expected = if (kind == WidgetKind.WEEK) strings.get(R.string.widget_week_label)
                        else if (language == AppLanguage.EN) "Lisbon" else "Lisboa"
                    assertTrue("$kind / $language: $displayed", displayed.contains(expected))
                }
            }
        }
    }

    @Test fun shareAndFeedbackPrepareCorrectExternalIntentsWithoutSending() {
        val recording = RecordingContext(context)
        val engagement = Engagement(recording)
        assertFalse("Development installs must not request Play reviews", engagement.canReview)
        engagement.sendFeedback(AppLanguage.PT.locale())
        assertEquals(Intent.ACTION_SENDTO, recording.last.action)
        assertTrue(recording.last.data.toString().startsWith("mailto:support@openworldclock.com"))
        for (language in listOf(AppLanguage.EN, AppLanguage.PT, AppLanguage.ES)) {
            engagement.shareApp(language.locale())
            assertEquals(Intent.ACTION_CHOOSER, recording.last.action)
            @Suppress("DEPRECATION") val send = recording.last.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
            assertEquals(Intent.ACTION_SEND, send.action)
            assertEquals("text/plain", send.type)
            val text = send.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
            val path = if (language == AppLanguage.EN) "" else "${language.locale().language}/"
            assertTrue(text.contains("https://openworldclock.com/$path"))
        }
    }

    private fun text(view: View): String = buildString {
        if (view is TextView) append(view.text).append(' ')
        if (view is ViewGroup) for (i in 0 until view.childCount) append(text(view.getChildAt(i)))
    }

    private class RecordingContext(base: Context) : ContextWrapper(base) {
        lateinit var last: Intent
        override fun startActivity(intent: Intent) { last = intent }
    }
}
