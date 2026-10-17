package io.joao.worldclock.ui.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.AddToHomeScreen
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.joao.worldclock.R
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.SectionHeader
import io.joao.worldclock.ui.supporter.SupporterSheet
import io.joao.worldclock.ui.components.rememberNow
import io.joao.worldclock.widget.BaseWidgetProvider
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.WidgetConfigureActivity
import io.joao.worldclock.widget.PremiumCatalog
import io.joao.worldclock.widget.WidgetKind
import io.joao.worldclock.widget.WidgetStore
import io.joao.worldclock.widget.WidgetStyle
import io.joao.worldclock.widget.forAccess

/** Scroll handle for the widget gallery, used by the gating UI test. */
const val WidgetGalleryTag = "widget_gallery"

/** Per card handle, so a test can assert about one widget's actions and not its neighbour's. */
fun widgetCardTag(kind: WidgetKind) = "widget_card_" + kind.name

@Composable
fun WidgetsScreen(settings: ClockSettings) {
    val t = LocalStrings.current
    val locale = t.locale
    val context = LocalContext.current
    val services = LocalServices.current
    val now by rememberNow()
    val canPin = remember { BaseWidgetProvider.canPin(context) }
    var resumeTick by remember { mutableIntStateOf(0) }
    var status by rememberSaveable { mutableStateOf<String?>(null) }
    // The resume the status was written on. A pin message speaks to that moment ("confirm on
    // your home screen"), so once the person has been away and come back it is describing
    // something that has already happened, and it goes instead of sitting there for the rest of
    // the session. Clearing on the next resume rather than on pause leaves it on screen, and in
    // the live region, for as long as the sentence is still true.
    var statusTick by rememberSaveable { mutableIntStateOf(0) }
    LifecycleResumeEffect(Unit) {
        resumeTick++
        if (statusTick != resumeTick) status = null
        onPauseOrDispose { }
    }
    val placed = remember(resumeTick, settings) {
        val manager = AppWidgetManager.getInstance(context)
        WidgetKind.entries.flatMap { kind -> manager.getAppWidgetIds(ComponentName(context, kind.providerClass)).map { kind to it } }
    }
    val supporter by services.supporter.state.collectAsStateWithLifecycle()

    LazyVerticalGrid(
        columns = GridCells.Adaptive(340.dp),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        // Tagged so a test can scroll to a specific widget card; thirteen kinds do not fit one screen.
        modifier = Modifier.fillMaxSize().testTag(WidgetGalleryTag),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(Modifier.padding(top = 8.dp)) {
                Text(t.get(R.string.widgets_title), style = MaterialTheme.typography.headlineMedium)
                Text(
                    t.get(R.string.widgets_intro),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!canPin) {
                    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.padding(top = 12.dp)) {
                        Text(t.get(R.string.widgets_no_pin), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(14.dp))
                    }
                }
                status?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 12.dp).semantics { liveRegion = LiveRegionMode.Polite })
                }
            }
        }
        items(WidgetKind.entries, key = { it.name }) { kind ->
            GalleryCard(kind, settings, now, canPin) { config ->
                // Pinning never carries a look the person has not unlocked, so a preview stays a preview.
                val pinned = BaseWidgetProvider.requestPin(context, kind, config.forAccess(supporter.hasAccess))
                status = t.get(if (pinned) R.string.widgets_pin_confirm else R.string.widgets_pin_failed)
                statusTick = resumeTick
            }
        }
        if (placed.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column {
                    SectionHeader(t.get(R.string.widgets_placed))
                    Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
                        Column {
                            val store = WidgetStore(context)
                            placed.forEachIndexed { i, (kind, id) ->
                                val config = store.load(id)
                                val names = config.cities(kind, settings).joinToString { it.label.ifBlank { services.catalog.find(it.zoneId, locale).name } }
                                ListItem(
                                    headlineContent = { Text(t.get(kind.titleRes)) },
                                    supportingContent = {
                                        Text(if (config.zones.isEmpty() && kind != WidgetKind.SINGLE) t.get(R.string.widgets_following, names) else names)
                                    },
                                    trailingContent = {
                                        TextButton(onClick = {
                                            context.startActivity(Intent(context, WidgetConfigureActivity::class.java)
                                                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
                                        }) { Icon(Icons.Rounded.Edit, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(t.get(R.string.action_edit)) }
                                    },
                                    colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
                                    // One node for the row, so the kind and the cities it follows
                                    // are read as one placed widget instead of two loose lines.
                                    // Edit keeps its own node: a clickable child is not merged in.
                                    modifier = Modifier.semantics(mergeDescendants = true) { },
                                )
                                if (i < placed.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GalleryCard(kind: WidgetKind, settings: ClockSettings, now: java.time.Instant, canPin: Boolean, onPin: (WidgetConfig) -> Unit) {
    val t = LocalStrings.current
    val services = LocalServices.current
    var zones by rememberSaveable(kind) { mutableStateOf(emptyList<String>()) }
    var style by rememberSaveable(kind) { mutableStateOf(WidgetStyle.AUTO) }
    // Catalog ids, not the palette and face themselves: rememberSaveable has to write this
    // through a Bundle, and an id is the one form that survives it.
    var themeId by rememberSaveable(kind) { mutableStateOf<String?>(null) }
    var faceId by rememberSaveable(kind) { mutableStateOf(PremiumCatalog.freeFace.id) }
    var customizing by rememberSaveable(kind) { mutableStateOf(false) }
    var unlocking by rememberSaveable(kind) { mutableStateOf(false) }
    val supporter by services.supporter.state.collectAsStateWithLifecycle()
    // A premium kind is browsable by anyone and placeable only with access. Blocking the pin
    // is kinder than placing one that would immediately fall back to a free kind.
    val locked = kind.premium && !supporter.hasAccess
    val config = WidgetConfig(zones, style, themeId, faceId)
    if (unlocking) SupporterSheet(settings) { unlocking = false }

    Surface(
        shape = RoundedCornerShape(28.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        modifier = Modifier.fillMaxWidth().testTag(widgetCardTag(kind)),
    ) {
        Column(Modifier.padding(20.dp)) {
            // Wallpaper-like stage so light and dark widgets both read clearly.
            Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerHighest, modifier = Modifier.fillMaxWidth()) {
                Box(Modifier.padding(20.dp), contentAlignment = Alignment.Center) {
                    // Thirteen live RemoteViews trees on one tab. Without a description each
                    // would spill its clocks and labels into the reading order, so the preview
                    // is named once, by the same title and blurb the card shows below it.
                    NativeWidgetPreview(
                        kind, config, settings, services.catalog,
                        description = t.get(R.string.widget_preview_a11y, t.get(kind.titleRes), t.get(kind.blurbRes)),
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            // A Row squeezed the title to one word per line at 1.5x, because the footprint
            // label takes its intrinsic width first. FlowRow keeps them on one line when they
            // fit and drops the footprint to its own line when they do not.
            FlowRow(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(t.get(kind.titleRes), style = MaterialTheme.typography.titleLarge)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (kind.premium) {
                        Icon(Icons.Rounded.Lock, t.get(R.string.supporter_title), Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(t.get(R.string.widgets_size, kind.size), style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(t.get(kind.blurbRes), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp))
            if (locked) {
                Text(t.get(R.string.wc_locked_note, t.get(kind.titleRes)), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
            }
            AnimatedVisibility(customizing) {
                Column(Modifier.padding(top = 16.dp)) {
                    WidgetCustomizer(kind, config, settings) { zones = it.zones; style = it.style; themeId = it.themeId; faceId = it.faceId }
                }
            }
            Spacer(Modifier.height(16.dp))
            // Weighted buttons in a Row shrank the primary action to a single letter at 1.5x.
            // These wrap instead, so the label survives at every scale.
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { customizing = !customizing }) {
                    Icon(Icons.Rounded.Tune, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                    Text(t.get(if (customizing) R.string.action_done else R.string.widgets_customize), maxLines = 1)
                }
                if (canPin && locked) {
                    Button(onClick = { unlocking = true }) {
                        Icon(Icons.Rounded.Lock, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                        Text(t.get(R.string.supporter_unlock), maxLines = 1)
                    }
                } else if (canPin) {
                    Button(onClick = { onPin(config) }) {
                        Icon(Icons.AutoMirrored.Rounded.AddToHomeScreen, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                        Text(t.get(R.string.widgets_add), maxLines = 1)
                    }
                }
            }
        }
    }
}
