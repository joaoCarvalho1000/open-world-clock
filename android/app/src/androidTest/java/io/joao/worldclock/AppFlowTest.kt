package io.joao.worldclock

import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.*
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.joao.worldclock.data.SettingsRepository
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.core.AppLanguage
import io.joao.worldclock.i18n.AppStrings
import org.junit.Assert.*
import org.junit.Before
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private lateinit var launchedActivity: MainActivity
    private lateinit var launchIntent: Intent
    private var originalLanguage = AppLanguage.SYSTEM

    @Before fun rememberScenarioLaunch() {
        launchedActivity = compose.activity
        launchIntent = Intent(launchedActivity.intent)
        val repository = SettingsRepository(launchedActivity)
        originalLanguage = repository.settings.value.language
        compose.runOnUiThread { repository.setLanguage(AppLanguage.EN) }
        compose.waitForIdle()
    }

    @After fun restoreScenarioTracking() {
        // ActivityScenario matches lifecycle events by Intent.filterEquals. Real deep links
        // change the activity's intent; restore the launch filter only after exercising them.
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().runOnMainSync {
            if (!launchedActivity.isDestroyed) launchedActivity.intent = launchIntent
            SettingsRepository(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().targetContext).setLanguage(originalLanguage)
        }
    }

    @Test fun plannerUsesReferenceCityOutsideSavedCities() {
        val repository = SettingsRepository(compose.activity)
        val original = repository.settings.value
        val reference = listOf("Asia/Kathmandu", "Pacific/Chatham", "Africa/Nairobi")
            .first { zone -> original.cities.none { it.zoneId == zone } }
        val name = CityCatalog(compose.activity).find(reference, java.util.Locale.US).name
        try {
            compose.runOnUiThread {
                repository.setHomeZone(reference)
            }
            compose.waitForIdle()
            compose.onNodeWithText("Plan", useUnmergedTree = true).performClick()
            compose.onNode(hasScrollToIndexAction()).performScrollToNode(
                hasContentDescription("Meeting hour in $name")
            )
            compose.onNodeWithContentDescription("Meeting hour in $name").assertExists()
        } finally {
            compose.runOnUiThread { repository.setHomeZone(original.homeZone) }
        }
    }

    @Test fun addRenameAndRemoveCityPersistsAcrossActivityRecreation() {
        compose.runOnUiThread { SettingsRepository(compose.activity).removeCity("Asia/Kathmandu") }
        compose.onNodeWithText("Add city", useUnmergedTree = true).performClick()
        compose.onNode(hasSetTextAction()).performTextInput("Kathmandu")
        compose.onNode(hasText("Kathmandu") and hasAnyAncestor(hasScrollToIndexAction()), useUnmergedTree = true).performClick()
        compose.waitUntil(5000) { SettingsRepository(compose.activity).settings.value.cities.any { it.zoneId == "Asia/Kathmandu" } }
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("Options for Kathmandu"))
        compose.onNodeWithContentDescription("Options for Kathmandu", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Edit name and hours", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Display name").performTextReplacement("Nepal team")
        compose.onNodeWithText("Display name").assertTextContains("Nepal team")
        compose.onNodeWithText("Save", useUnmergedTree = true).performScrollTo().performClick()
        compose.waitUntil(5000) { SettingsRepository(compose.activity).settings.value.cities.any { it.label == "Nepal team" } }
        compose.activityRule.scenario.recreate()
        compose.waitUntil(5000) { SettingsRepository(compose.activity).settings.value.cities.any { it.label == "Nepal team" } }
        compose.onNode(hasScrollToIndexAction()).performScrollToNode(hasContentDescription("Options for Nepal team"))
        compose.onNodeWithContentDescription("Options for Nepal team", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Remove", substring = false, useUnmergedTree = true).performClick()
        compose.runOnIdle { assertFalse(SettingsRepository(compose.activity).settings.value.cities.any { it.zoneId == "Asia/Kathmandu" }) }
    }

    @Test fun deepLinksOpenConverterAndRejectHostileZone() {
        openLink("worldclock://convert?zone=Asia%2FTokyo")
        compose.onNodeWithText("In Tokyo", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("+1h", useUnmergedTree = true).performClick()
        compose.onNodeWithText("Now", substring = false, useUnmergedTree = true).performClick()
        openLink("worldclock://convert?zone=Invalid%2FZone")
        compose.onNodeWithText("In Tokyo", useUnmergedTree = true).assertIsDisplayed()
        openLink("worldclock://widgets")
        compose.onAllNodesWithText("Widgets", useUnmergedTree = true).assertCountEquals(2)
    }

    @Test fun languageChangesCopyAndPersistsAcrossRecreation() {
        val repository = SettingsRepository(compose.activity)
        compose.onNodeWithText("Settings", useUnmergedTree = true).performClick()
        for (language in listOf(AppLanguage.PT, AppLanguage.ES, AppLanguage.EN)) {
            val strings = AppStrings(compose.activity, language)
            val label = strings.get(when (language) {
                AppLanguage.PT -> R.string.language_pt
                AppLanguage.ES -> R.string.language_es
                else -> R.string.language_en
            })
            compose.onNodeWithText(label, useUnmergedTree = true).performScrollTo().performClick()
            compose.waitUntil(5000) { repository.settings.value.language == language }
            compose.onAllNodesWithText(strings.get(R.string.settings_title), useUnmergedTree = true).onFirst().assertIsDisplayed()
            compose.onNodeWithText(strings.get(R.string.settings_language), useUnmergedTree = true).assertExists()
            compose.activityRule.scenario.recreate()
            launchedActivity = compose.activity
            assertEquals(language, SettingsRepository(compose.activity).settings.value.language)
            compose.onAllNodesWithText(strings.get(R.string.settings_title), useUnmergedTree = true).onFirst().assertIsDisplayed()
        }
    }

    @Test fun longPressDragReordersCitiesAndPersists() {
        val repository = SettingsRepository(compose.activity)
        val original = repository.settings.value.cities.map { it.zoneId }
        assertTrue("The initial city list supports reordering", original.size >= 2)
        val catalog = CityCatalog(compose.activity)
        val first = repository.settings.value.cities[0]
        val second = repository.settings.value.cities[1]
        fun cardName(city: io.joao.worldclock.core.SavedCity) =
            city.label.ifBlank { catalog.find(city.zoneId, AppLanguage.EN.locale()).name } + "."
        fun cityCard(city: io.joao.worldclock.core.SavedCity) = SemanticsMatcher("City card for ${city.zoneId}") { node ->
            node.config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.ContentDescription)
                ?.any { it.startsWith(cardName(city)) } == true
        }
        val firstCard = compose.onNode(cityCard(first))
        val secondCard = compose.onNode(cityCard(second))
        try {
            val delta = secondCard.fetchSemanticsNode().boundsInRoot.center - firstCard.fetchSemanticsNode().boundsInRoot.center
            firstCard.performTouchInput {
                down(center)
                advanceEventTime(700)
                val origin = center
                for (step in 1..12) moveTo(origin + delta * (step / 12f), 32)
                up()
            }
            compose.waitUntil(5000) { repository.settings.value.cities[1].zoneId == first.zoneId }
            assertEquals(second.zoneId, repository.settings.value.cities[0].zoneId)
            compose.activityRule.scenario.recreate()
            launchedActivity = compose.activity
            assertEquals(first.zoneId, SettingsRepository(compose.activity).settings.value.cities[1].zoneId)
        } finally {
            compose.runOnUiThread {
                original.forEachIndexed { index, zone ->
                    val current = repository.settings.value.cities.indexOfFirst { it.zoneId == zone }
                    if (current >= 0) repository.moveCity(zone, index - current)
                }
            }
        }
    }

    private fun openLink(uri: String) {
        compose.runOnUiThread {
            launchedActivity = compose.activity
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri), compose.activity, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            // Keep ActivityScenario's launch bookkeeping when MainActivity replaces its intent.
            compose.activity.intent.extras?.let(intent::putExtras)
            compose.activity.startActivity(intent)
        }
        compose.waitForIdle()
    }
}
