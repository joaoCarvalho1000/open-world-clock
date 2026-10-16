package io.joao.worldclock.ui.supporter

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.joao.worldclock.R
import io.joao.worldclock.billing.BillingStatus
import io.joao.worldclock.billing.SupporterAccess
import io.joao.worldclock.billing.SupporterPlan
import io.joao.worldclock.billing.SupporterState
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.rememberNow
import io.joao.worldclock.ui.widgets.NativeWidgetPreview
import io.joao.worldclock.ui.widgets.applyLook
import io.joao.worldclock.ui.widgets.spec
import io.joao.worldclock.widget.PremiumCatalog
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.WidgetKind

/**
 * What the Supporter Pack is, shown as the thing itself: a real widget drawn from your own
 * cities that changes while you try the themes and faces. Prices are whatever Google Play
 * reports for this account and country, and nothing is claimed that is not already here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupporterSheet(settings: ClockSettings, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        // Centered and bounded, so the panel keeps its measure on a tablet.
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            SupporterPanel(settings, onDismiss, Modifier.widthIn(max = 560.dp).padding(horizontal = 24.dp).padding(bottom = 24.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SupporterPanel(settings: ClockSettings, onClose: () -> Unit, modifier: Modifier = Modifier) {
    val t = LocalStrings.current
    val services = LocalServices.current
    val billing = services.supporter
    val activity = LocalActivity.current
    val state by billing.state.collectAsStateWithLifecycle()
    val now by rememberNow()
    // A few looks that show the range, not the whole catalog: this is the offer, not the browser.
    val highlights = remember { Highlights.mapNotNull(PremiumCatalog::look) }
    var picked by remember { mutableStateOf(highlights.first().spec()) }
    // The ten widgets are the largest part of the pack and the sheet used to never mention them,
    // let alone show one. Previewing the real provider is the honest version of a sales pitch.
    var kind by remember { mutableStateOf(Showcase.first()) }

    LaunchedEffect(Unit) { billing.refresh() }

    Column(modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        // An offer must be as easy to leave as to read, without relying on a drag or Back.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t.get(R.string.supporter_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            IconButton(onClick = onClose) { Icon(Icons.Rounded.Close, t.get(R.string.action_close)) }
        }
        Text(t.get(R.string.supporter_pitch), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(t.get(R.string.supporter_free_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHighest,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) {
            Box(Modifier.padding(20.dp), contentAlignment = Alignment.Center) {
                NativeWidgetPreview(kind, WidgetConfig().applyLook(picked), settings, services.catalog)
            }
        }
        // Counted from the registry, so adding a kind cannot leave this claim behind.
        Text(
            t.get(R.string.supporter_included_widgets, WidgetKind.entries.count { it.premium }),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp),
        )
        Text(t.get(R.string.supporter_try_widget), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
            Showcase.forEach { candidate ->
                LookChip(
                    label = t.get(candidate.titleRes),
                    selected = kind == candidate,
                    onClick = { kind = candidate },
                )
            }
        }
        Text(t.get(R.string.supporter_try), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
            highlights.forEach { look ->
                val spec = look.spec()
                LookChip(
                    label = t.get(look.labelRes),
                    selected = picked.palette?.id == spec.palette?.id && picked.face.id == spec.face.id,
                    palette = spec.palette,
                    onClick = { picked = spec },
                )
            }
        }
        Text(
            t.get(R.string.supporter_included_looks, PremiumCatalog.looks.size, PremiumCatalog.faces.size - 1),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp),
        )
        Text(t.get(R.string.supporter_included_presets), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))

        Purchases(state, Modifier.padding(top = 16.dp)) { action ->
            when (action) {
                SupporterAction.YEARLY -> activity?.let { billing.purchase(it, SupporterPlan.YEARLY) }
                SupporterAction.MONTHLY -> activity?.let { billing.purchase(it, SupporterPlan.MONTHLY) }
                SupporterAction.MANAGE -> activity?.let { billing.manage(it) }
                SupporterAction.RESTORE -> billing.restore()
                SupporterAction.RETRY -> billing.refresh()
            }
        }
    }
}

/** Eight looks spanning light, dark and vivid, so the sheet shows range rather than a list. */
private val Highlights = listOf("newsprint", "mist", "chalk", "ink", "forest", "midnight", "ember", "cobalt")

/**
 * Four of the ten paid widgets, chosen because they look nothing like each other: a map, a week
 * grid, a date board and a daylight arc. Enough to show the pack is widgets and not just colours.
 */
private val Showcase = listOf(WidgetKind.MAP, WidgetKind.WEEK, WidgetKind.DATELINE, WidgetKind.DAYLIGHT)

enum class SupporterAction { YEARLY, MONTHLY, MANAGE, RESTORE, RETRY }

/**
 * Buying, and everything that can stand in its way. A price is only ever Google Play's own
 * formatted price, so a sideloaded build says it cannot sell rather than inventing a number.
 */
@Composable
fun Purchases(state: SupporterState, modifier: Modifier = Modifier, onAction: (SupporterAction) -> Unit) {
    val t = LocalStrings.current
    val enabled = !state.busy
    // A payment Google Play is still confirming must not be started a second time.
    val canBuy = enabled && state.status != BillingStatus.PENDING

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        when (state.access) {
            SupporterAccess.YEARLY, SupporterAccess.MONTHLY -> {
                Text(t.get(if (state.access == SupporterAccess.YEARLY) R.string.supporter_active_yearly else R.string.supporter_active_monthly),
                    style = MaterialTheme.typography.titleMedium)
                // Either plan includes the same pack. Manage the existing subscription instead
                // of offering another checkout that could charge for overlapping access.
                OutlinedButton(onClick = { onAction(SupporterAction.MANAGE) }, enabled = enabled,
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    Text(t.get(R.string.supporter_manage), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                }
            }
            SupporterAccess.FREE -> {
                if (state.yearlyPrice != null) {
                    Button(onClick = { onAction(SupporterAction.YEARLY) }, enabled = canBuy, modifier = Modifier.fillMaxWidth()) {
                        // Long local prices and large font scales wrap rather than truncate.
                        Text(t.get(R.string.supporter_yearly, state.yearlyPrice), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                    }
                    // Only when Play quoted both plans in one currency and yearly really is cheaper.
                    state.yearlySavingPercent?.let { percent ->
                        Text(t.get(R.string.supporter_yearly_saving, percent), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(t.get(R.string.supporter_yearly_note), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (state.monthlyPrice != null) {
                    OutlinedButton(onClick = { onAction(SupporterAction.MONTHLY) }, enabled = canBuy,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
                        Text(t.get(R.string.supporter_monthly, state.monthlyPrice), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                    }
                    Text(t.get(R.string.supporter_monthly_note), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        statusLine(t, state)?.let { line ->
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (state.busy) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(10.dp))
                }
                Text(line, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite })
            }
        }
        if (state.status == BillingStatus.UNAVAILABLE || state.status == BillingStatus.ERROR) {
            TextButton(onClick = { onAction(SupporterAction.RETRY) }, enabled = enabled) { Text(t.get(R.string.supporter_retry)) }
        }
        // Someone reinstalling, or on a second device, needs this whether or not Play is healthy.
        TextButton(onClick = { onAction(SupporterAction.RESTORE) }, enabled = enabled,
            modifier = Modifier.heightIn(min = 48.dp)) { Text(t.get(R.string.supporter_restore)) }
    }
}

internal fun statusLine(t: io.joao.worldclock.i18n.AppStrings, state: SupporterState): String? = when {
    state.busy -> t.get(R.string.supporter_loading)
    state.status == BillingStatus.LOADING -> t.get(R.string.supporter_loading)
    state.status == BillingStatus.UNAVAILABLE -> t.get(R.string.supporter_unavailable)
    state.status == BillingStatus.ERROR -> t.get(R.string.supporter_error)
    state.status == BillingStatus.PENDING -> t.get(R.string.supporter_pending)
    state.status == BillingStatus.RESTORED -> t.get(R.string.supporter_restored)
    state.status == BillingStatus.NOTHING_TO_RESTORE -> t.get(R.string.supporter_nothing)
    state.access == SupporterAccess.FREE && state.yearlyPrice == null && state.monthlyPrice == null ->
        t.get(R.string.supporter_unavailable)
    else -> null
}
