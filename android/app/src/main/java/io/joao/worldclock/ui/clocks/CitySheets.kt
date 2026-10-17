package io.joao.worldclock.ui.clocks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import io.joao.worldclock.core.City
import io.joao.worldclock.core.ClockEngine
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.R
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.hourLabel
import io.joao.worldclock.ui.components.weekdayShort
import java.time.Instant
import java.time.ZoneId
import kotlin.math.roundToInt

/** Searchable city picker shared by the clock list, converter, and widget configuration. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CitySearchSheet(title: String, selected: Set<String>, onPick: (City) -> Unit, onDismiss: () -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        CitySearchContent(title, selected, onPick, Modifier.fillMaxHeight(0.92f))
    }
}

@Composable
fun CitySearchContent(title: String, selected: Set<String>, onPick: (City) -> Unit, modifier: Modifier = Modifier) {
    val t = LocalStrings.current
    val locale = t.locale
    val catalog = LocalServices.current.catalog
    var query by rememberSaveable { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    val results = remember(query, locale) { if (query.isBlank()) catalog.cities(locale).take(60) else catalog.search(query, locale).take(80) }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }

    Column(modifier.imePadding()) {
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 24.dp))
        OutlinedTextField(
            value = query,
            onValueChange = { query = it.take(60) },
            leadingIcon = { Icon(Icons.Rounded.Search, null) },
            trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Rounded.Clear, t.get(R.string.search_clear)) } },
            placeholder = { Text(t.get(R.string.search_hint)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp).focusRequester(focus),
        )
        if (results.isEmpty()) {
            Column(Modifier.padding(24.dp)) {
                Text(t.get(R.string.search_none), style = MaterialTheme.typography.titleSmall)
                Text(t.get(R.string.search_none_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        val now = remember { Instant.now() }
        LazyColumn(Modifier.navigationBarsPadding()) {
            items(results) { city ->
                val added = city.id in selected
                val offset = runCatching {
                    ClockEngine.offsetLabel(ZoneId.of(city.id).rules.getOffset(now).totalSeconds / 60)
                }.getOrDefault("")
                ListItem(
                    headlineContent = { Text(city.name) },
                    supportingContent = { Text(listOf(city.country, offset).filter { it.isNotBlank() }.joinToString(" · ")) },
                    trailingContent = { if (added) Icon(Icons.Rounded.CheckCircle, t.get(R.string.search_added), tint = MaterialTheme.colorScheme.primary) },
                    colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                    modifier = Modifier.clickable(onClickLabel = t.get(R.string.search_choose, city.name)) { onPick(city) },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EditCitySheet(saved: SavedCity, cityName: String, onSave: (SavedCity) -> Unit, onRemove: () -> Unit, onDismiss: () -> Unit) {
    val t = LocalStrings.current
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var label by rememberSaveable { mutableStateOf(saved.label) }
    var start by rememberSaveable { mutableStateOf(saved.workStart) }
    var end by rememberSaveable { mutableStateOf(saved.workEnd) }
    var days by rememberSaveable { mutableStateOf(saved.workDays.toList()) }
    val settings by LocalServices.current.repository.settings.collectAsStateWithLifecycle()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).navigationBarsPadding().imePadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(t.get(R.string.edit_title, cityName), style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                value = label,
                onValueChange = { label = it.take(40) },
                label = { Text(t.get(R.string.edit_display_name)) },
                placeholder = { Text(cityName) },
                supportingText = { Text(t.get(R.string.edit_name_hint, cityName)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            HorizontalDivider()
            Text(t.get(R.string.edit_working_hours), style = MaterialTheme.typography.titleMedium)
            Text(
                t.get(R.string.hours_range, hourLabel(start, settings.use24Hour, t.locale), hourLabel(end, settings.use24Hour, t.locale)),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            HourSlider(t.get(R.string.edit_starts), start, settings.use24Hour) { start = it }
            HourSlider(t.get(R.string.edit_ends), end, settings.use24Hour) { end = it }
            if (end < start) {
                Text(t.get(R.string.edit_overnight), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else if (end == start) {
                Text(t.get(R.string.edit_same_hours), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            Text(t.get(R.string.edit_working_days), style = MaterialTheme.typography.titleMedium)
            val weekdays = weekdayShort(t.locale)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                (1..7).forEach { d ->
                    val on = d in days
                    FilterChip(
                        selected = on,
                        onClick = { days = if (on) days - d else (days + d).sorted() },
                        label = { Text(weekdays[d - 1]) },
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), itemVerticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = onRemove) { Text(t.get(R.string.edit_remove), color = MaterialTheme.colorScheme.error) }
                OutlinedButton(onClick = onDismiss) { Text(t.get(R.string.action_cancel)) }
                Button(onClick = { onSave(saved.copy(label = label.trim(), workStart = start, workEnd = end, workDays = days.toSet())) }) { Text(t.get(R.string.action_save)) }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun HourSlider(label: String, hour: Int, use24: Boolean, onChange: (Int) -> Unit) {
    val t = LocalStrings.current
    Column {
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Slider(
            value = hour.toFloat(),
            onValueChange = { onChange(it.roundToInt().coerceIn(0, 23)) },
            valueRange = 0f..23f,
            steps = 22,
            modifier = Modifier.semantics {
                contentDescription = t.get(R.string.edit_hour_a11y, label)
                stateDescription = hourLabel(hour, use24, t.locale)
            },
        )
    }
}
