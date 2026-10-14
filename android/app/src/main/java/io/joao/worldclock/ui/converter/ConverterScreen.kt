package io.joao.worldclock.ui.converter

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarToday
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LocationCity
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.joao.worldclock.R
import io.joao.worldclock.core.ClockEngine
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.core.homeZoneId
import io.joao.worldclock.engagement.MeetingShare
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.clocks.CitySearchSheet
import io.joao.worldclock.ui.components.DayNightIcon
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.ScreenTitle
import io.joao.worldclock.ui.components.SectionHeader
import io.joao.worldclock.ui.theme.daylight
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ConverterScreen(settings: ClockSettings, requestedZone: String?, requestedInstant: Long?, request: Int) {
    val t = LocalStrings.current
    val locale = t.locale
    val services = LocalServices.current
    // Measure from the reference city, the same "here" the clocks and widgets use. It defaulted to
    // the first saved city, so the converter kept its own idea of here and disagreed with them.
    val defaultZone = requestedZone ?: settings.homeZoneId().id
    val initialTime = remember(defaultZone) { Instant.now().truncatedTo(ChronoUnit.MINUTES).atZone(ZoneId.of(defaultZone)) }
    // Keyed on the reference city so changing it resets the base, rather than leaving a stale pick.
    var zone by rememberSaveable(settings.homeZone) { mutableStateOf(defaultZone) }
    var dateText by rememberSaveable { mutableStateOf(initialTime.toLocalDate().toString()) }
    var timeText by rememberSaveable { mutableStateOf(initialTime.toLocalTime().toString()) }
    var later by rememberSaveable { mutableStateOf(isSecondOccurrence(initialTime)) }
    var handled by rememberSaveable { mutableStateOf(0) }
    var pickCity by rememberSaveable { mutableStateOf(false) }
    var pickDate by rememberSaveable { mutableStateOf(false) }
    var pickTime by rememberSaveable { mutableStateOf(false) }

    // Shows a real instant, keeping track of which occurrence it is when clocks fall back,
    // so stepping through a repeated hour never jumps backwards.
    fun showInstant(z: String, instant: Instant) {
        val at = instant.truncatedTo(ChronoUnit.MINUTES).atZone(ZoneId.of(z))
        zone = z
        dateText = at.toLocalDate().toString()
        timeText = at.toLocalTime().toString()
        later = isSecondOccurrence(at)
    }
    fun resetToNow(z: String) = showInstant(z, Instant.now())

    LaunchedEffect(request) {
        if (request != handled && requestedZone != null) {
            showInstant(requestedZone, requestedInstant?.let(Instant::ofEpochMilli) ?: Instant.now())
            handled = request
        }
    }

    val date = LocalDate.parse(dateText)
    val time = LocalTime.parse(timeText)
    val conversion = ClockEngine.convert(date, time, zone, later)
    val source = services.catalog.find(zone, locale)
    val use24 = settings.use24Hour
    val timeFmt = DateTimeFormatter.ofPattern(if (use24) "HH:mm" else "h:mm a", locale)
    val dateFmt = DateTimeFormatter.ofPattern("EEE d MMM yyyy", locale)
    val shown = conversion.instant.atZone(ZoneId.of(zone))

    fun nudge(minutes: Long) {
        showInstant(zone, conversion.instant.plus(minutes, ChronoUnit.MINUTES))
    }

    val targets: List<SavedCity> = settings.cities.filter { it.zoneId != zone }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item { ScreenTitle(t.get(R.string.convert_title)) }
        item {
            Surface(shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { pickCity = true }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Rounded.LocationCity, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                        Text(t.get(R.string.convert_source, source.name), modifier = Modifier.weight(1f), maxLines = 2)
                        Text(ClockEngine.offsetLabel(shown.offset.totalSeconds / 60), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            shown.format(timeFmt),
                            style = MaterialTheme.typography.displayLarge,
                            modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
                        )
                        IconButton(onClick = {
                            // Share what is on screen, including the source city even when it is not saved.
                            val listed = if (settings.cities.any { it.zoneId == zone }) settings
                            else settings.copy(cities = listOf(SavedCity(zone)) + settings.cities)
                            services.engagement.shareText(
                                MeetingShare.text(conversion.instant, listed, services.catalog, locale),
                                t.get(R.string.action_share),
                            )
                        }) { Icon(Icons.Rounded.Share, t.get(R.string.action_share)) }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AssistChip(onClick = { pickDate = true }, label = { Text(shown.format(dateFmt)) },
                            leadingIcon = { Icon(Icons.Rounded.CalendarToday, null, Modifier.size(18.dp)) })
                        AssistChip(onClick = { pickTime = true }, label = { Text(t.get(R.string.convert_set_time)) },
                            leadingIcon = { Icon(Icons.Rounded.Schedule, null, Modifier.size(18.dp)) })
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                        NudgeButton(t.get(R.string.convert_minus_hour), t.get(R.string.convert_minus_hour_a11y)) { nudge(-60) }
                        NudgeButton(t.get(R.string.convert_minus_quarter), t.get(R.string.convert_minus_quarter_a11y)) { nudge(-15) }
                        NudgeButton(t.get(R.string.convert_plus_quarter), t.get(R.string.convert_plus_quarter_a11y)) { nudge(15) }
                        NudgeButton(t.get(R.string.convert_plus_hour), t.get(R.string.convert_plus_hour_a11y)) { nudge(60) }
                        TextButton(onClick = { resetToNow(zone) }) {
                            Icon(Icons.Rounded.Restore, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(t.get(R.string.convert_now))
                        }
                    }
                    if (conversion.adjustedForGap) {
                        DstNotice(t.get(R.string.convert_gap, time.format(timeFmt), source.name, shown.format(timeFmt)))
                    } else if (conversion.ambiguous) {
                        DstNotice(t.get(R.string.convert_fold, time.format(timeFmt), source.name))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val early = ClockEngine.convert(date, time, zone, false).instant.atZone(ZoneId.of(zone)).offset
                            val late = ClockEngine.convert(date, time, zone, true).instant.atZone(ZoneId.of(zone)).offset
                            FilterChip(selected = !later, onClick = { later = false }, label = { Text(t.get(R.string.convert_first, label(early))) })
                            FilterChip(selected = later, onClick = { later = true }, label = { Text(t.get(R.string.convert_second, label(late))) })
                        }
                    }
                }
            }
        }
        item { SectionHeader(t.get(if (targets.isEmpty()) R.string.convert_targets_empty else R.string.convert_targets)) }
        items(targets, key = { it.zoneId }) { saved ->
            val reading = ClockEngine.reading(services.catalog.find(saved.zoneId, locale), saved, conversion.instant, use24, ZoneId.of(zone), locale)
            val colors = daylight(reading.isDay)
            val dayNote = when (reading.dayDifference) {
                0 -> ""
                1 -> t.get(R.string.day_next)
                -1 -> t.get(R.string.day_previous)
                else -> t.get(if (reading.dayDifference > 0) R.string.day_plus else R.string.day_minus, reading.dayDifference)
            }
            Surface(shape = RoundedCornerShape(20.dp), color = colors.container, contentColor = colors.ink, modifier = Modifier.fillMaxWidth()) {
                Row(
                    Modifier.padding(horizontal = 18.dp, vertical = 14.dp).semantics(mergeDescendants = true) {
                        contentDescription = t.get(
                            R.string.convert_card_a11y,
                            reading.label,
                            "${reading.time} ${reading.period}".trim(),
                            listOf(reading.date, dayNote).filter { it.isNotEmpty() }.joinToString(", "),
                            listOf(
                                t.get(if (reading.isWorking) R.string.work_status_working else R.string.work_status_off),
                                t.get(if (reading.isDay) R.string.day_phase_daytime else R.string.day_phase_night),
                            ).joinToString(", "),
                        )
                    },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DayNightIcon(reading.isDay, colors.ink2, Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(reading.label, style = MaterialTheme.typography.titleMedium)
                        Text(
                            listOf(reading.date, dayNote, t.get(if (reading.isWorking) R.string.work_status_working else R.string.work_status_off))
                                .filter { it.isNotEmpty() }.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall, color = colors.ink2,
                        )
                    }
                    Text(reading.time, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.widthIn(min = 72.dp))
                    if (reading.period.isNotBlank()) Text(" ${reading.period}", style = MaterialTheme.typography.labelLarge, color = colors.ink2)
                }
            }
        }
    }

    if (pickCity) {
        CitySearchSheet(t.get(R.string.convert_pick_city), setOf(zone), onPick = { zone = it.id; later = false; pickCity = false }, onDismiss = { pickCity = false })
    }
    if (pickDate) {
        val state = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { dateText = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString(); later = false }
                    pickDate = false
                }) { Text(t.get(R.string.action_ok)) }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text(t.get(R.string.action_cancel)) } },
        ) { DatePicker(state) }
    }
    if (pickTime) {
        val state = rememberTimePickerState(time.hour, time.minute, use24)
        AlertDialog(
            onDismissRequest = { pickTime = false },
            title = { Text(t.get(R.string.convert_time_in, source.name)) },
            text = { TimePicker(state) },
            confirmButton = {
                TextButton(onClick = { timeText = LocalTime.of(state.hour, state.minute).toString(); later = false; pickTime = false }) { Text(t.get(R.string.action_ok)) }
            },
            dismissButton = { TextButton(onClick = { pickTime = false }) { Text(t.get(R.string.action_cancel)) } },
        )
    }
}

private fun isSecondOccurrence(at: java.time.ZonedDateTime): Boolean {
    val offsets = at.zone.rules.getValidOffsets(at.toLocalDateTime())
    return offsets.size > 1 && at.offset == offsets.last()
}

private fun label(offset: ZoneOffset) = ClockEngine.offsetLabel(offset.totalSeconds / 60)

@Composable
private fun NudgeButton(text: String, description: String, onClick: () -> Unit) {
    TextButton(onClick = onClick, contentPadding = PaddingValues(horizontal = 8.dp), modifier = Modifier.semantics { contentDescription = description }) {
        Text(text)
    }
}

@Composable
private fun DstNotice(text: String) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.tertiaryContainer, contentColor = MaterialTheme.colorScheme.onTertiaryContainer) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Icon(Icons.Rounded.Info, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
