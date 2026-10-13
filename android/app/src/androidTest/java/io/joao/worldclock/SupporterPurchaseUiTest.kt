package io.joao.worldclock

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.joao.worldclock.billing.*
import io.joao.worldclock.core.AppLanguage
import io.joao.worldclock.core.AppTheme
import io.joao.worldclock.i18n.AppStrings
import io.joao.worldclock.i18n.LocalizedApp
import io.joao.worldclock.ui.supporter.Purchases
import io.joao.worldclock.ui.supporter.SupporterAction
import io.joao.worldclock.ui.theme.WorldClockTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Isolated presentation fixtures. These callbacks cannot call Play or grant any entitlement. */
@RunWith(AndroidJUnit4::class)
class SupporterPurchaseUiTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val language = mutableStateOf(AppLanguage.EN)
    private val state = mutableStateOf(priced)
    private val actions = mutableListOf<SupporterAction>()
    private fun strings() = AppStrings(compose.activity, language.value)

    private fun mount() {
        compose.setContent {
            LocalizedApp(language.value) {
                CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, 1.5f)) {
                    WorldClockTheme(if (language.value == AppLanguage.PT) AppTheme.LIGHT else AppTheme.DARK) {
                        Box(Modifier.fillMaxSize().safeDrawingPadding(), contentAlignment = Alignment.TopCenter) {
                            Column(Modifier.widthIn(max = 320.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
                                Text("Purchase UI test fixture", style = MaterialTheme.typography.labelMedium)
                                Purchases(state.value, onAction = { actions.add(it) })
                            }
                        }
                    }
                }
            }
        }
    }

    @Test fun localizedPricesAndTermsFitAtLargeTextAndActionsStayDistinct() {
        mount()
        listOf(AppLanguage.EN, AppLanguage.PT, AppLanguage.ES).forEach { selected ->
            compose.runOnIdle { language.value = selected }
            val t = strings()
            val yearly = t.get(R.string.supporter_yearly, priced.yearlyPrice!!)
            val monthly = t.get(R.string.supporter_monthly, priced.monthlyPrice!!)
            assertFits(yearly)
            compose.onNodeWithText(yearly).performClick()
            assertEquals(SupporterAction.YEARLY, actions.last())
            assertFits(t.get(R.string.supporter_yearly_note))
            assertFits(monthly)
            compose.onNodeWithText(monthly).performClick()
            assertEquals(SupporterAction.MONTHLY, actions.last())
            assertFits(t.get(R.string.supporter_monthly_note))
            compose.onNodeWithText(t.get(R.string.supporter_restore)).performScrollTo().performClick()
            assertEquals(SupporterAction.RESTORE, actions.last())
            compose.onNodeWithText(yearly).performScrollTo()
            capture("purchase-${selected.name.lowercase()}-large")
        }
    }

    @Test fun pendingAndBusyPurchasesCannotBeStartedAgain() {
        state.value = priced.copy(status = BillingStatus.PENDING)
        mount()
        val t = strings()
        compose.onNodeWithText(t.get(R.string.supporter_yearly, priced.yearlyPrice!!)).assertIsNotEnabled()
        compose.onNodeWithText(t.get(R.string.supporter_monthly, priced.monthlyPrice!!)).assertIsNotEnabled()
        compose.onNodeWithText(t.get(R.string.supporter_pending)).assertExists()
        compose.onNodeWithText(t.get(R.string.supporter_restore)).assertIsEnabled()
        capture("purchase-pending")
        compose.runOnIdle { state.value = priced.copy(busy = true) }
        compose.onNodeWithText(t.get(R.string.supporter_restore)).assertIsNotEnabled()
        compose.onNodeWithText(t.get(R.string.supporter_yearly, priced.yearlyPrice!!)).assertIsNotEnabled()
    }

    @Test fun existingSupportersGetManagementInsteadOfAnotherSale() {
        state.value = priced.copy(access = SupporterAccess.MONTHLY)
        mount()
        val t = strings()
        compose.onNodeWithText(t.get(R.string.supporter_manage)).performClick()
        assertEquals(listOf(SupporterAction.MANAGE), actions)
        compose.onNodeWithText(t.get(R.string.supporter_yearly, priced.yearlyPrice!!)).assertDoesNotExist()
        compose.onNodeWithText(t.get(R.string.supporter_monthly, priced.monthlyPrice!!)).assertDoesNotExist()
        capture("purchase-owned-monthly")
        compose.runOnIdle { state.value = priced.copy(access = SupporterAccess.YEARLY) }
        compose.onNodeWithText(t.get(R.string.supporter_manage)).performClick()
        assertEquals(listOf(SupporterAction.MANAGE, SupporterAction.MANAGE), actions)
        compose.onNodeWithText(t.get(R.string.supporter_active_yearly)).assertExists()
        compose.onNodeWithText(t.get(R.string.supporter_yearly, priced.yearlyPrice!!)).assertDoesNotExist()
        compose.onNodeWithText(t.get(R.string.supporter_monthly, priced.monthlyPrice!!)).assertDoesNotExist()
        capture("purchase-owned-yearly")
    }

    @Test fun unavailableProductsNeverInventPricesAndRecoveryStaysAvailable() {
        state.value = SupporterState(status = BillingStatus.UNAVAILABLE)
        mount()
        val t = strings()
        compose.onNodeWithText(t.get(R.string.supporter_unavailable)).assertExists()
        compose.onAllNodes(hasText("US$", substring = true)).assertCountEquals(0)
        compose.onNodeWithText(t.get(R.string.supporter_retry)).performClick()
        assertEquals(SupporterAction.RETRY, actions.last())
        compose.onNodeWithText(t.get(R.string.supporter_restore)).performClick()
        assertEquals(SupporterAction.RESTORE, actions.last())
        capture("purchase-unavailable")
        compose.runOnIdle { state.value = SupporterState(status = BillingStatus.ERROR) }
        compose.onNodeWithText(t.get(R.string.supporter_error)).assertExists()
        compose.onNodeWithText(t.get(R.string.supporter_retry)).assertIsEnabled()
        compose.runOnIdle { state.value = SupporterState(status = BillingStatus.NOTHING_TO_RESTORE) }
        compose.onNodeWithText(t.get(R.string.supporter_nothing)).assertExists()
    }

    private fun assertFits(text: String) {
        val node = compose.onNodeWithText(text, useUnmergedTree = true).performScrollTo()
        val results = mutableListOf<TextLayoutResult>()
        val measure = node.fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action!!
        compose.runOnIdle {
            assertTrue(measure.invoke(results))
            assertTrue("Text must be measured", results.isNotEmpty())
            assertTrue("Clipped purchase text: $text " + results.joinToString { "size=${it.size}, paragraph=${it.multiParagraph.width}x${it.multiParagraph.height}, lines=${it.lineCount}, width=${it.didOverflowWidth}, height=${it.didOverflowHeight}" }, results.none { it.hasVisualOverflow })
        }
    }

    private fun capture(name: String) {
        if (InstrumentationRegistry.getArguments().getString("captureSupporter") != "true") return
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val bitmap = instrumentation.uiAutomation.takeScreenshot() ?: return
        val file = File(instrumentation.targetContext.getExternalFilesDir(null), "$name.png")
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    private companion object {
        val priced = SupporterState(yearlyPrice = "US$ 5.00", monthlyPrice = "US$ 1.00", status = BillingStatus.READY)
    }
}
