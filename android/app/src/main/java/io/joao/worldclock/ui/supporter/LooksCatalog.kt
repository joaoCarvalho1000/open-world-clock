package io.joao.worldclock.ui.supporter

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.joao.worldclock.R
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.Sun
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.rememberNow
import io.joao.worldclock.ui.theme.tabular
import io.joao.worldclock.ui.widgets.LookSpec
import io.joao.worldclock.ui.widgets.NativeWidgetPreview
import io.joao.worldclock.ui.widgets.applyLook
import io.joao.worldclock.ui.widgets.composeFamily
import io.joao.worldclock.ui.widgets.freeStyleLabel
import io.joao.worldclock.ui.widgets.lookColors
import io.joao.worldclock.ui.widgets.spec
import io.joao.worldclock.widget.CatalogLook
import io.joao.worldclock.widget.PremiumCatalog
import io.joao.worldclock.widget.ThemeGroup
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.WidgetKind
import io.joao.worldclock.widget.WidgetStyle
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * The looks catalog.
 *
 * One job, in one place: find a look, see it on your own cities, apply it. The shelves are
 * the only division (the three free styles, then light, dark and vivid palettes), because a
 * filter row on top of named sections is one control more than the task needs. Every card is
 * the look itself rather than a colour chip, so browsing is reading, not decoding.
 *
 * Locked looks are fully browsable on purpose. Trying one is how you find out whether it is
 * worth anything to you, and the card and the bar below both say plainly that it is a preview.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LooksCatalogSheet(
    kind: WidgetKind,
    config: WidgetConfig,
    settings: ClockSettings,
    applied: LookSpec,
    hasAccess: Boolean,
    onApply: (LookSpec) -> Unit,
    onUnlock: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            CatalogBody(kind, config, settings, applied, hasAccess, onApply, onUnlock, onDismiss,
                Modifier.widthIn(max = 640.dp).padding(horizontal = 20.dp))
        }
    }
}

@Composable
private fun CatalogBody(
    kind: WidgetKind,
    config: WidgetConfig,
    settings: ClockSettings,
    applied: LookSpec,
    hasAccess: Boolean,
    onApply: (LookSpec) -> Unit,
    onUnlock: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalStrings.current
    val services = LocalServices.current
    val now by rememberNow()
    // What the preview shows. Nothing is written until Apply, so browsing never changes a widget.
    var picked by remember { mutableStateOf(applied) }
    // Resolved once: every card draws the same city, and Daylight shows its real surface now.
    val first = config.cities(WidgetKind.SINGLE, settings).first()
    val firstCity = services.catalog.find(first.zoneId, t.locale)
    val cityName = first.label.ifBlank { firstCity.name }
    val isDay = Sun.isDay(now, firstCity.latitude, firstCity.longitude)
    val pickedLook = PremiumCatalog.lookFor(picked.palette?.id, picked.face.id)
    val canApply = !picked.premium || hasAccess

    Column(modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t.get(R.string.wc_looks), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            IconButton(onClick = onDismiss) { Icon(Icons.Rounded.Close, t.get(R.string.action_close)) }
        }

        // The look on your own cities, at the size you will actually place.
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHighest,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        ) {
            Box(Modifier.padding(16.dp), contentAlignment = Alignment.Center) {
                // The real RemoteViews, not a drawing of them: the catalog sells this look,
                // so it shows the look itself, ticking.
                NativeWidgetPreview(kind, config.applyLook(picked), settings, services.catalog)
            }
        }

        if (!hasAccess) {
            Text(t.get(R.string.wc_looks_locked_note), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        }

        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 132.dp),
            modifier = Modifier.weight(1f).padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            // Without this the apply bar slices the last row's names through the middle.
            contentPadding = PaddingValues(bottom = 12.dp),
        ) {
            shelf(t.get(R.string.wc_group_free), FreeLooks.size)
            items(FreeLooks, key = { "free-" + it.name }) { style ->
                val spec = LookSpec(null, style, PremiumCatalog.freeFace)
                LookCard(
                    label = t.get(freeStyleLabel(style)),
                    spec = spec,
                    now = now,
                    cityName = cityName,
                    isDay = isDay,
                    selected = picked.palette == null && picked.style == style && !picked.face.premium,
                    applied = applied.palette == null && applied.style == style && applied.face.id == spec.face.id,
                    locked = false,
                    onClick = { picked = spec },
                )
            }
            // Said once, under the shelf it belongs to, rather than repeated on three cards.
            item(span = { GridItemSpan(maxLineSpan) }, key = "free-note") {
                Text(
                    t.get(R.string.wc_looks_free_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            ThemeGroup.entries.forEach { group ->
                val looks = PremiumCatalog.looks(group)
                shelf(t.get(group.labelRes), looks.size)
                items(looks, key = { it.id }) { look ->
                    val spec = look.spec()
                    LookCard(
                        label = t.get(look.labelRes),
                        spec = spec,
                        now = now,
                        cityName = cityName,
                        isDay = isDay,
                        selected = pickedLook?.id == look.id,
                        applied = PremiumCatalog.lookFor(applied.palette?.id, applied.face.id)?.id == look.id,
                        locked = !hasAccess,
                        onClick = { picked = spec },
                    )
                }
            }
        }

        ApplyBar(
            name = pickedLook?.let { t.get(it.labelRes) } ?: t.get(freeStyleLabel(picked.style)),
            canApply = canApply,
            locked = picked.premium && !hasAccess,
            onApply = { onApply(picked); onDismiss() },
            onUnlock = onUnlock,
        )
    }
}

/** A shelf heading, spanning the grid so the sections read as sections. */
private fun androidx.compose.foundation.lazy.grid.LazyGridScope.shelf(title: String, count: Int) {
    item(span = { GridItemSpan(maxLineSpan) }, key = "shelf-$title") {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Bottom) {
            Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Text(
                LocalStrings.current.get(R.string.wc_looks_count, count),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private val FreeLooks = listOf(WidgetStyle.AUTO, WidgetStyle.LIGHT, WidgetStyle.DARK)

/**
 * One look as a card: the surface, its ink, its accent and its digits, drawn small. A colour
 * chip would need decoding; this is simply the thing itself at a glance.
 */
@Composable
private fun LookCard(
    label: String,
    spec: LookSpec,
    now: Instant,
    cityName: String,
    isDay: Boolean,
    selected: Boolean,
    applied: Boolean,
    locked: Boolean,
    onClick: () -> Unit,
) {
    val t = LocalStrings.current
    val state = when {
        applied -> t.get(R.string.wc_looks_applied)
        locked -> t.get(R.string.wc_preview_only)
        else -> null
    }
    val described = if (state == null) label else t.get(R.string.wc_looks_a11y, label, state)
    val border = if (selected) MaterialTheme.colorScheme.primary else Color.Transparent

    Column(
        Modifier
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .semantics { contentDescription = described }
            .padding(2.dp),
    ) {
        // The miniature holds real text, so it has to grow with the text. At a fixed height the
        // digits clip at 1.5x font scale, which is exactly where a preview stops being one.
        val tileHeight = 78.dp * LocalDensity.current.fontScale.coerceIn(1f, 1.6f)
        Box(
            Modifier
                .fillMaxWidth()
                .height(tileHeight)
                .clip(RoundedCornerShape(16.dp))
                .background(border)
                .padding(if (selected) 2.dp else 0.dp),
        ) {
            LookTile(spec, now, cityName, isDay, Modifier.fillMaxSize().clip(RoundedCornerShape(15.dp)))
            if (locked) {
                Icon(
                    Icons.Rounded.Lock, null,
                    Modifier.align(Alignment.TopEnd).padding(6.dp).size(14.dp),
                    tint = tileInk(spec, isDay).copy(alpha = 0.75f),
                )
            }
            if (applied) {
                Icon(
                    Icons.Rounded.Check, null,
                    Modifier.align(Alignment.TopEnd).padding(6.dp).size(14.dp),
                    tint = tileInk(spec, isDay),
                )
            }
        }
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 6.dp, start = 2.dp),
        )
    }
}

/** The ink a card's own surface writes in, so badges stay legible on every palette. */
@Composable
private fun tileInk(spec: LookSpec, isDay: Boolean): Color = lookColors(spec, isDay).ink

/**
 * A miniature of the city clock widget: name, live time in the look's own face, and the
 * accent. Small enough for a grid, true enough to choose from.
 */
@Composable
private fun LookTile(spec: LookSpec, now: Instant, cityName: String, isDay: Boolean, modifier: Modifier = Modifier) {
    val t = LocalStrings.current
    val colors = lookColors(spec, isDay)
    val container = colors.container
    val ink = colors.ink
    val ink2 = colors.ink2
    val accent = colors.accent
    val time = remember(now, t.locale) {
        now.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm", t.locale))
    }

    // The tile repeats what the card already says, so it is decoration to a screen reader.
    Column(modifier.background(container).padding(horizontal = 10.dp, vertical = 8.dp).clearAndSetSemantics {}) {
        Text(cityName, color = ink, fontSize = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.weight(1f))
        Text(
            time,
            color = ink,
            fontSize = 22.sp * spec.face.widthScale,
            fontWeight = FontWeight.Light,
            fontFamily = spec.face.composeFamily(),
            maxLines = 1,
            style = MaterialTheme.typography.bodyLarge.tabular,
        )
        Spacer(Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(5.dp).clip(RoundedCornerShape(3.dp)).background(accent))
            Spacer(Modifier.width(4.dp))
            Box(Modifier.width(26.dp).height(3.dp).clip(RoundedCornerShape(2.dp)).background(ink2.copy(alpha = 0.5f)))
        }
    }
}

/**
 * What tapping Apply will do, said before you do it. A locked look explains the result rather
 * than refusing silently, and the widget's current look is never changed by browsing.
 */
@Composable
private fun ApplyBar(
    name: String,
    canApply: Boolean,
    locked: Boolean,
    onApply: () -> Unit,
    onUnlock: () -> Unit,
) {
    val t = LocalStrings.current
    Column(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 20.dp)) {
        if (locked) {
            Text(t.get(R.string.wc_locked_note, name), style = MaterialTheme.typography.bodyMedium)
            Text(t.get(R.string.wc_locked_save), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = onUnlock, modifier = Modifier.fillMaxWidth().padding(top = 10.dp).heightIn(min = 48.dp)) {
                Text(t.get(R.string.supporter_unlock), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            }
            return
        }
        Button(onClick = onApply, enabled = canApply,
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 48.dp)) {
            Text(t.get(R.string.wc_looks_apply, name), modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
        }
    }
}
