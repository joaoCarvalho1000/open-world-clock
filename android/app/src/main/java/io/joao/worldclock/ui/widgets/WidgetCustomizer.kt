package io.joao.worldclock.ui.widgets

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.BookmarkAdd
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.ui.clocks.CitySearchSheet
import io.joao.worldclock.R
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.supporter.FaceChip
import io.joao.worldclock.ui.supporter.LookSwatch
import io.joao.worldclock.ui.supporter.LooksCatalogSheet
import io.joao.worldclock.ui.supporter.freeSwatch
import io.joao.worldclock.ui.supporter.SupporterLockNote
import io.joao.worldclock.ui.supporter.SupporterSheet
import io.joao.worldclock.widget.AppearanceCodec
import io.joao.worldclock.widget.PremiumCatalog
import io.joao.worldclock.widget.AppearancePreset
import io.joao.worldclock.widget.AppearanceStore
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.WidgetKind
import io.joao.worldclock.widget.WidgetStyle
import io.joao.worldclock.widget.matches
import io.joao.worldclock.widget.withLook
import java.util.UUID

/** City and look controls for one widget instance. Shared by the gallery and the launcher configure screen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WidgetCustomizer(kind: WidgetKind, config: WidgetConfig, settings: ClockSettings, onChange: (WidgetConfig) -> Unit) {
    val t = LocalStrings.current
    val locale = t.locale
    val services = LocalServices.current
    val catalog = services.catalog
    val supporter by services.supporter.state.collectAsStateWithLifecycle()
    val hasAccess = supporter.hasAccess
    var searching by rememberSaveable { mutableStateOf(false) }
    var unlocking by rememberSaveable { mutableStateOf(false) }
    var browsing by rememberSaveable { mutableStateOf(false) }
    if (unlocking) SupporterSheet(settings) { unlocking = false }
    val saved = settings.cities.map { it.zoneId }
    val follow = config.zones.isEmpty()
    fun name(zone: String) = settings.cities.firstOrNull { it.zoneId == zone }?.label?.ifBlank { null } ?: catalog.find(zone, locale).name

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(t.get(if (kind == WidgetKind.SINGLE) R.string.wc_city else R.string.wc_cities), style = MaterialTheme.typography.titleSmall)
        if (kind == WidgetKind.SINGLE) {
            val current = config.cities(kind, settings).first().zoneId
            (saved + listOfNotNull(current.takeIf { it !in saved })).forEach { zone ->
                Row(
                    Modifier.fillMaxWidth().selectable(zone == current, role = Role.RadioButton) { onChange(config.copy(zones = listOf(zone))) }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = zone == current, onClick = null)
                    Spacer(Modifier.width(12.dp))
                    Text(name(zone), style = MaterialTheme.typography.bodyLarge)
                }
            }
        } else {
            Row(
                Modifier.fillMaxWidth().toggleable(follow, role = Role.Switch) { on ->
                    onChange(config.copy(zones = if (on) emptyList() else saved.take(kind.maxCities)))
                }.padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(t.get(R.string.wc_follow), style = MaterialTheme.typography.bodyLarge)
                    Text(t.get(R.string.wc_follow_body, kind.maxCities),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = follow, onCheckedChange = null)
            }
            if (!follow) {
                val chosen = config.zones
                (saved + chosen.filter { it !in saved }).forEach { zone ->
                    val on = zone in chosen
                    val full = !on && chosen.size >= kind.maxCities
                    Row(
                        Modifier.fillMaxWidth().toggleable(on, enabled = !full, role = Role.Checkbox) { checked ->
                            val next = if (checked) chosen + zone else chosen - zone
                            if (next.isNotEmpty()) onChange(config.copy(zones = next))
                        }.padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(checked = on, onCheckedChange = null, enabled = !full)
                        Spacer(Modifier.width(12.dp))
                        Text(name(zone), style = MaterialTheme.typography.bodyLarge,
                            color = if (full) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                    }
                }
                Text(t.get(R.string.wc_selected, chosen.size, kind.maxCities),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (kind == WidgetKind.SINGLE || !follow) {
            TextButton(onClick = { searching = true }) {
                Icon(Icons.Rounded.Search, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(t.get(R.string.wc_pick))
            }
        }

        Text(t.get(R.string.wc_looks), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
        val look = config.look()
        val lookName = PremiumCatalog.lookFor(look.palette?.id, look.face.id)?.let { t.get(it.labelRes) }
            ?: look.palette?.let { t.get(it.labelRes) }
            ?: t.get(freeStyleLabel(config.style))
        // One row instead of a wall of chips: what this widget wears now, and the way in to
        // everything else. Twenty seven looks as chips would be a wall to read, not a choice.
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp)
                .clickable(onClickLabel = t.get(R.string.wc_looks_browse)) { browsing = true },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val palette = look.palette
            if (palette != null) {
                LookSwatch(Color(palette.bg), Color(palette.ink), null)
            } else {
                val (container, ink, night) = freeSwatch(config.style)
                LookSwatch(container, ink, night)
            }
            Spacer(Modifier.width(12.dp))
            Text(lookName, style = MaterialTheme.typography.bodyLarge, maxLines = 1, modifier = Modifier.weight(1f))
            Text(t.get(R.string.wc_looks_browse), style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary)
        }
        Text(
            when {
                config.theme != null -> t.get(R.string.wc_theme_note_premium)
                config.style != WidgetStyle.AUTO ->
                    t.get(R.string.wc_style_note_fixed, t.get(freeStyleLabel(config.style)).lowercase(locale))
                kind == WidgetKind.MEETING -> t.get(R.string.wc_style_note_system)
                kind == WidgetKind.SINGLE -> t.get(R.string.wc_style_note_single)
                // Only these three paint a palette per row or per tile. Everything else is drawn
                // from one subject city, so the per row promise was false for eleven of thirteen.
                kind == WidgetKind.WORLD || kind == WidgetKind.DUO || kind == WidgetKind.BOARD ->
                    t.get(R.string.wc_style_note_rows)
                // Clock change leads with whichever city changes next, not the first in the list.
                kind == WidgetKind.CHANGE -> t.get(R.string.wc_style_note_change)
                else -> t.get(R.string.wc_style_note_first)
            },
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Text(t.get(R.string.wc_font), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
        // The face is the one thing worth tuning after a look is chosen, so it stays in reach.
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PremiumCatalog.faces.forEach { face ->
                FaceChip(t.get(face.labelRes), look.face.id == face.id, face, locked = face.premium && !hasAccess) {
                    onChange(config.applyLook(look.copy(face = face)))
                }
            }
        }

        val lockedName = when {
            hasAccess -> null
            look.palette != null -> t.get(look.palette.labelRes)
            look.face.premium -> t.get(look.face.labelRes)
            else -> null
        }
        if (lockedName != null) {
            SupporterLockNote(lockedName, savingNote = true, onUnlock = { unlocking = true }, modifier = Modifier.padding(top = 12.dp))
        }

        SavedLooks(
            config = config,
            hasAccess = hasAccess,
            onApply = { preset -> onChange(config.withLook(preset)) },
            onUnlock = { unlocking = true },
        )
    }

    if (browsing) {
        LooksCatalogSheet(
            kind = kind,
            config = config,
            settings = settings,
            applied = config.look(),
            hasAccess = hasAccess,
            onApply = { onChange(config.applyLook(it)) },
            onUnlock = { browsing = false; unlocking = true },
            onDismiss = { browsing = false },
        )
    }

    if (searching) {
        CitySearchSheet(
            title = t.get(R.string.wc_choose_city),
            selected = config.zones.toSet(),
            onPick = { city ->
                searching = false
                val next = when {
                    kind == WidgetKind.SINGLE -> listOf(city.id)
                    city.id in config.zones -> config.zones
                    config.zones.size >= kind.maxCities -> config.zones.dropLast(1) + city.id
                    else -> config.zones + city.id
                }
                onChange(config.copy(zones = next))
            },
            onDismiss = { searching = false },
        )
    }
}

/**
 * Saved looks: a name, a theme and a face, reusable on any widget. They never carry cities,
 * and they survive losing Supporter access, so coming back finds them where they were.
 */
@Composable
private fun SavedLooks(
    config: WidgetConfig,
    hasAccess: Boolean,
    onApply: (AppearancePreset) -> Unit,
    onUnlock: () -> Unit,
) {
    val t = LocalStrings.current
    val context = LocalContext.current
    val store = remember(context) { AppearanceStore(context) }
    var presets by remember { mutableStateOf(store.presets()) }
    var naming by rememberSaveable { mutableStateOf(false) }
    val full = presets.size >= AppearanceCodec.MAX_PRESETS

    Text(t.get(R.string.wc_presets), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))
    if (presets.isEmpty()) {
        Text(t.get(if (hasAccess) R.string.wc_preset_empty else R.string.wc_presets_locked),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    presets.forEach { preset ->
        val applied = config.matches(preset)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp)
                .clickable(enabled = hasAccess, onClickLabel = t.get(R.string.wc_preset_apply_a11y, preset.name)) { onApply(preset) },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(preset.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1,
                color = if (hasAccess) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f))
            if (applied) Icon(Icons.Rounded.Check, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
            IconButton(onClick = { store.delete(preset.id); presets = store.presets() }) {
                Icon(Icons.Rounded.DeleteOutline, t.get(R.string.wc_preset_delete, preset.name))
            }
        }
    }
    if (!hasAccess) {
        if (presets.isNotEmpty()) {
            Text(t.get(R.string.wc_presets_locked), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        TextButton(onClick = onUnlock) { Text(t.get(R.string.supporter_unlock)) }
        return
    }
    if (full) {
        Text(t.get(R.string.wc_preset_full, AppearanceCodec.MAX_PRESETS), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    TextButton(onClick = { naming = true }, enabled = !full) {
        Icon(Icons.Rounded.BookmarkAdd, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
        Text(t.get(R.string.wc_preset_save))
    }

    if (naming) {
        NamePresetDialog(
            suggestion = defaultPresetName(t, config),
            onDismiss = { naming = false },
            onSave = { name ->
                naming = false
                store.save(AppearancePreset(UUID.randomUUID().toString(), name, config.style, config.themeId, config.faceId))
                presets = store.presets()
            },
        )
    }
}

/** "Newsprint", or "Paper · Serif" when the pair is not a look the catalog already names. */
@Composable
private fun defaultPresetName(t: io.joao.worldclock.i18n.AppStrings, config: WidgetConfig): String {
    PremiumCatalog.lookFor(config.themeId, config.faceId)?.let { return t.get(it.labelRes) }
    val look = config.theme?.let { t.get(it.labelRes) } ?: t.get(freeStyleLabel(config.style))
    return if (!config.font.premium) look else look + " · " + t.get(config.font.labelRes)
}

@Composable
private fun NamePresetDialog(suggestion: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    val t = LocalStrings.current
    var name by rememberSaveable(suggestion) { mutableStateOf(suggestion) }
    val clean = name.trim().take(AppearanceCodec.MAX_NAME)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t.get(R.string.wc_preset_save)) },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(AppearanceCodec.MAX_NAME) },
                    label = { Text(t.get(R.string.wc_preset_name)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(t.get(R.string.wc_preset_hint), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            }
        },
        confirmButton = { TextButton(onClick = { onSave(clean) }, enabled = clean.isNotBlank()) { Text(t.get(R.string.action_save)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t.get(R.string.action_cancel)) } },
    )
}
