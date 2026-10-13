package io.joao.worldclock

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.joao.worldclock.core.AppLanguage
import io.joao.worldclock.data.SettingsRepository
import io.joao.worldclock.i18n.AppStrings
import io.joao.worldclock.ui.widgets.WidgetGalleryTag
import io.joao.worldclock.ui.widgets.widgetCardTag
import io.joao.worldclock.widget.DuoWidgetProvider
import io.joao.worldclock.widget.ConfigureBottomBarTag
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.WidgetConfigureActivity
import io.joao.worldclock.widget.WidgetKind
import io.joao.worldclock.widget.WidgetStore
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The Compose half of the paid boundary.
 *
 * The provider level pin gate is covered elsewhere. What these two cases protect is what a
 * person actually sees and can do: that a premium widget is offered honestly rather than
 * silently placed, and that losing access never strands someone with a widget whose cities
 * they can no longer change.
 *
 * Nothing here grants or fakes entitlement. A test build has no Play connection, so access is
 * genuinely absent, which is exactly the state under test.
 */
@RunWith(AndroidJUnit4::class)
class PremiumGatingUiTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private fun strings() = AppStrings(context, AppLanguage.EN)

    private var host: AppWidgetHost? = null
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private var originalLanguage = AppLanguage.SYSTEM

    /** Assertions are scoped to one card, or they would happily pass on a neighbour's buttons. */
    private fun inCard(kind: WidgetKind) = hasAnyAncestor(hasTestTag(widgetCardTag(kind)))

    /**
     * The commit bar, not the whole screen. The customizer above may legitimately keep offering
     * Unlock for a locked look, so only the bar can say whether saving is refused or allowed.
     */
    private val inBottomBar get() = hasAnyAncestor(hasTestTag(ConfigureBottomBarTag))

    @Before fun pinLanguage() {
        val repository = SettingsRepository(context)
        originalLanguage = repository.settings.value.language
        instrumentation.runOnMainSync { repository.setLanguage(AppLanguage.EN) }
    }

    @After fun releaseTestWidget() {
        // Only ever the id this test allocated, through this test's own host.
        if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            WidgetStore(context).delete(intArrayOf(widgetId))
            runCatching { host?.deleteAppWidgetId(widgetId) }
            widgetId = AppWidgetManager.INVALID_APPWIDGET_ID
        }
        instrumentation.runOnMainSync { SettingsRepository(context).setLanguage(originalLanguage) }
    }

    /** A real id bound to a real premium provider, so the activity sees the kind it would in a launcher. */
    private fun bindPremiumWidget(): Int {
        val manager = AppWidgetManager.getInstance(context)
        val provider = ComponentName(context, DuoWidgetProvider::class.java)
        host = AppWidgetHost(context, TEST_HOST_ID)
        // Recorded before the bind is asserted, so a failed bind still gets cleaned up in @After.
        widgetId = host!!.allocateAppWidgetId()
        // Binding needs a system permission. Borrow it for the bind and give it straight back.
        instrumentation.uiAutomation.adoptShellPermissionIdentity(android.Manifest.permission.BIND_APPWIDGET)
        val bound = try {
            manager.bindAppWidgetIdIfAllowed(widgetId, provider)
        } finally {
            instrumentation.uiAutomation.dropShellPermissionIdentity()
        }
        assertTrue("Could not bind a test widget id to $provider", bound)
        return widgetId
    }

    private fun launchConfigure(id: Int): ActivityScenario<WidgetConfigureActivity> =
        ActivityScenario.launch(
            Intent(context, WidgetConfigureActivity::class.java)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )

    @Test fun galleryOffersUnlockRatherThanAddForAPremiumKindWithoutAccess() {
        val t = strings()
        val add = t.get(R.string.widgets_add)
        val unlock = t.get(R.string.supporter_unlock)

        ActivityScenario.launch<MainActivity>(
            Intent(Intent.ACTION_VIEW, Uri.parse("worldclock://widgets"), context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ).use {
            compose.waitForIdle()

            // The free kind is placeable exactly as it always was.
            compose.onNodeWithTag(WidgetGalleryTag).performScrollToNode(hasText(t.get(WidgetKind.SINGLE.titleRes)))
            compose.waitForIdle()
            compose.onAllNodesWithText(add).filterToOne(inCard(WidgetKind.SINGLE)).assertIsDisplayed()
            compose.onAllNodesWithText(unlock).filter(inCard(WidgetKind.SINGLE)).assertCountEquals(0)

            val duo = t.get(WidgetKind.DUO.titleRes)
            compose.onNodeWithTag(WidgetGalleryTag).performScrollToNode(hasText(duo))
            compose.waitForIdle()

            // Premium without access: offer the pack, and do not offer to place it.
            compose.onAllNodesWithText(unlock).filterToOne(inCard(WidgetKind.DUO)).assertIsDisplayed()
            compose.onAllNodesWithText(add).filter(inCard(WidgetKind.DUO)).assertCountEquals(0)
            compose.onAllNodesWithText(t.get(R.string.wc_locked_note, duo))
                .filterToOne(inCard(WidgetKind.DUO)).assertIsDisplayed()
            // Browsing stays open: the card still customises and still previews.
            compose.onAllNodesWithText(t.get(R.string.widgets_customize))
                .filterToOne(inCard(WidgetKind.DUO)).assertIsDisplayed()
        }
    }

    @Test fun configureBlocksFirstPremiumSetupButKeepsEditingAnExistingWidgetAfterExpiry() {
        val t = strings()
        val id = bindPremiumWidget()
        val store = WidgetStore(context)
        assertFalse("A freshly allocated id must not look configured", store.isConfigured(id))

        // First placement, no access: saving is refused and the pack is offered instead.
        launchConfigure(id).use {
            compose.waitForIdle()
            compose.onAllNodesWithText(t.get(R.string.supporter_unlock)).filterToOne(inBottomBar).assertIsDisplayed()
            compose.onAllNodesWithText(t.get(R.string.wc_save)).filter(inBottomBar).assertCountEquals(0)
            compose.onAllNodesWithText(t.get(R.string.wc_locked_note, t.get(WidgetKind.DUO.titleRes)))
                .filterToOne(inBottomBar).assertIsDisplayed()
        }

        // The same widget, already on a home screen and wearing a paid look, as it would be
        // when access lapses.
        store.save(id, WidgetConfig(zones = listOf("Europe/Lisbon", "Asia/Tokyo"), themeId = "paper", faceId = "serif"))
        assertTrue(store.isConfigured(id))

        launchConfigure(id).use {
            compose.waitForIdle()
            // Still no access, but an existing widget must stay editable or its owner is stranded.
            compose.onAllNodesWithText(t.get(R.string.supporter_unlock)).filter(inBottomBar).assertCountEquals(0)

            // Actually change something: following the clock list clears the pinned cities.
            compose.onNodeWithText(t.get(R.string.wc_follow)).performScrollTo().performClick()
            compose.waitForIdle()
            // Save lives in the Scaffold bottom bar, outside the scrolling content.
            compose.onAllNodesWithText(t.get(R.string.wc_save)).filterToOne(inBottomBar)
                .assertIsDisplayed().performClick()
            compose.waitForIdle()
        }

        val saved = store.load(id)
        assertTrue("The city edit made after expiry must persist", saved.zones.isEmpty())
        // The paid look is kept untouched rather than stripped on the way through.
        assertEquals("paper", saved.themeId)
        assertEquals("serif", saved.faceId)
    }

    private companion object { const val TEST_HOST_ID = 0x7C10 }
}
