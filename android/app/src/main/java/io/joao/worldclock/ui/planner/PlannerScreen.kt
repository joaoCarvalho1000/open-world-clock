package io.joao.worldclock.ui.planner

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.EventAvailable
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import io.joao.worldclock.R
import io.joao.worldclock.core.ClockEngine
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.PlanSlot
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.core.homeZoneId
import io.joao.worldclock.engagement.MeetingShare
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.ScreenTitle
import io.joao.worldclock.ui.components.SectionHeader
import io.joao.worldclock.ui.components.compactHour
import io.joao.worldclock.ui.components.rememberNow
import io.joao.worldclock.ui.theme.Brand
import io.joao.worldclock.ui.theme.LocalIsDark
import io.joao.worldclock.ui.theme.tabular
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

/** Contiguous run of hours sharing the best overlap count. */
data class OverlapWindow(val startIndex: Int, val endIndex: Int, val working: Int, val total: Int)

fun bestWindows(slots: List<PlanSlot>): List<OverlapWindow> {
    val best = slots.maxOfOrNull { it.workingCount } ?: 0
    if (best == 0) return emptyList()
    val runs = mutableListOf<OverlapWindow>()
    var start = -1
    slots.forEachIndexed { i, s ->
        if (s.workingCount == best && start < 0) start = i
        if ((s.workingCount != best || i == slots.lastIndex) && start >= 0) {
            val end = if (s.workingCount == best) i else i - 1
            runs += OverlapWindow(start, end, best, s.totalCount)
            start = -1
        }
    }
    return runs.sortedByDescending { it.endIndex - it.startIndex }
}

@Composable
fun PlannerScreen(settings: ClockSettings, onOpenConverter: (String, java.time.Instant?) -> Unit) {
    val t = LocalStrings.current
    val locale = t.locale
    val services = LocalServices.current
    val now by rememberNow(60_000)
    val cities = settings.cities
    // Anchor on the reference city, the same "here" the clocks and widgets use. It defaulted to the
    // first saved city, so the planner measured from somewhere else. Keyed on the reference city so
    // changing it moves the anchor instead of leaving a stale pick.
    var chosenZone by rememberSaveable(settings.homeZone) { mutableStateOf(settings.homeZoneId().id) }
    // The anchor controls the instant grid; its zone need not be a saved-city column.
    val referenceZone = chosenZone
    val refZone = ZoneId.of(referenceZone)
    var dateText by rememberSaveable { mutableStateOf(LocalDate.now(refZone).toString()) }
    val date = LocalDate.parse(dateText)
    val slots = remember(date, referenceZone, cities) { ClockEngine.plan(date, referenceZone, cities) }
    val windows = remember(slots) { bestWindows(slots) }
    val isToday = date == LocalDate.now(refZone)
    val nowIndex = if (isToday) slots.indexOfLast { !it.instant.isAfter(now) }.coerceAtLeast(0) else -1
    var selected by rememberSaveable { mutableStateOf(-1) }
    val selectedIndex = when {
        selected in slots.indices -> selected
        windows.isNotEmpty() -> windows.first().startIndex
        else -> nowIndex.coerceAtLeast(9)
    }
    val use24 = settings.use24Hour
    val refName = cities.firstOrNull { it.zoneId == referenceZone }?.label?.ifBlank { null }
        ?: services.catalog.find(referenceZone, locale).name
    val timeFmt = DateTimeFormatter.ofPattern(if (use24) "HH:mm" else "h:mm a", locale)
    val shifts = remember(slots, refZone) { dayHasShift(slots, refZone) }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item { ScreenTitle(t.get(R.string.plan_title)) }
        if (cities.size < 2) {
            item {
                Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxWidth()) {
                    Text(t.get(R.string.plan_need_cities), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(20.dp))
                }
            }
            return@LazyColumn
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { dateText = date.minusDays(1).toString(); selected = -1 }) {
                    Icon(Icons.AutoMirrored.Rounded.KeyboardArrowLeft, t.get(R.string.plan_previous_day))
                }
                Text(
                    date.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", locale)),
                    style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f),
                )
                if (!isToday) {
                    TextButton(onClick = { dateText = LocalDate.now(refZone).toString(); selected = -1 }) { Text(t.get(R.string.plan_today)) }
                }
                IconButton(onClick = { dateText = date.plusDays(1).toString(); selected = -1 }) {
                    Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, t.get(R.string.plan_next_day))
                }
            }
        }
        item {
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(t.get(R.string.plan_hours_in), style = MaterialTheme.typography.labelLarge)
                val home = settings.homeZoneId().id
                val anchors = if (cities.any { it.zoneId == home }) cities else listOf(SavedCity(home)) + cities
                anchors.forEach { c ->
                    FilterChip(
                        selected = c.zoneId == referenceZone,
                        onClick = { chosenZone = c.zoneId; selected = -1 },
                        label = { Text(c.label.ifBlank { services.catalog.find(c.zoneId, locale).name }, maxLines = 1) },
                    )
                }
            }
        }
        item {
            val summary = when {
                windows.isEmpty() -> t.get(R.string.plan_none)
                else -> {
                    val w = windows.first()
                    val from = slots[w.startIndex].instant.atZone(refZone).format(timeFmt)
                    val to = slots[w.endIndex].instant.plusSeconds(3600).atZone(refZone).format(timeFmt)
                    if (w.working == w.total) t.get(R.string.plan_all, from, to)
                    else t.get(R.string.plan_partial, from, to, w.working, w.total)
                }
            }
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(Modifier.padding(horizontal = 18.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.EventAvailable, null, Modifier.size(22.dp))
                    Spacer(Modifier.width(12.dp))
                    AnimatedContent(summary, transitionSpec = { fadeIn(tween(180)) togetherWith fadeOut(tween(120)) }, label = "summary") {
                        Text(it, style = MaterialTheme.typography.titleSmall)
                    }
                }
            }
        }
        item {
            val slot = slots[selectedIndex]
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SectionHeader(
                        t.get(R.string.plan_selected, slotLabel(slot, refZone, use24, shifts, locale), refName, slot.workingCount, slot.totalCount),
                        Modifier.weight(1f),
                    )
                    IconButton(onClick = {
                        services.engagement.shareText(
                            MeetingShare.text(slot.instant, settings, services.catalog, locale),
                            t.get(R.string.action_share),
                        )
                    }) { Icon(Icons.Rounded.Share, t.get(R.string.action_share)) }
                }
                OverviewBar(slots, selectedIndex, nowIndex, t.get(R.string.plan_overlap_bar)) { selected = it }
                Slider(
                    value = selectedIndex.toFloat(),
                    onValueChange = { selected = it.roundToInt().coerceIn(0, 23) },
                    valueRange = 0f..23f,
                    steps = 22,
                    modifier = Modifier.semantics {
                        contentDescription = t.get(R.string.plan_slider, refName)
                        stateDescription = t.get(
                            R.string.plan_slider_state,
                            slotLabel(slot, refZone, use24, shifts, locale), slot.workingCount, slot.totalCount,
                        )
                    },
                )
            }
        }
        item {
            HourGrid(
                slots = slots,
                cities = cities,
                referenceZone = referenceZone,
                selected = selectedIndex,
                nowIndex = nowIndex,
                use24 = use24,
                locale = locale,
                timeFmt = timeFmt,
                onSelect = { selected = it },
                onOpen = { zone -> onOpenConverter(zone, slots[selectedIndex].instant) },
            )
        }
        item { Legend() }
    }
}

/** Whole-day overview: one cell per hour, opacity tracking how many cities are at work. */
@Composable
private fun OverviewBar(slots: List<PlanSlot>, selected: Int, nowIndex: Int, description: String, onSelect: (Int) -> Unit) {
    val accent = MaterialTheme.colorScheme.primary
    val track = MaterialTheme.colorScheme.surfaceContainerHighest
    val outline = MaterialTheme.colorScheme.onSurface
    Canvas(
        Modifier.fillMaxWidth().height(24.dp)
            .pointerInput(Unit) { detectTapGestures { onSelect((it.x / size.width * 24).toInt().coerceIn(0, 23)) } }
            .pointerInput(Unit) { detectHorizontalDragGestures { change, _ -> onSelect((change.position.x / size.width * 24).toInt().coerceIn(0, 23)) } }
            .semantics { contentDescription = description },
    ) {
        val cell = size.width / 24f
        slots.forEachIndexed { i, s ->
            val v = if (s.totalCount == 0) 0f else s.workingCount.toFloat() / s.totalCount
            val color = if (v <= 0f) track else accent.copy(alpha = 0.25f + 0.75f * v)
            drawRoundRect(color, Offset(i * cell + 1f, 0f), Size(cell - 2f, size.height), CornerRadius(4.dp.toPx()))
        }
        if (nowIndex >= 0) drawCircle(Brand.Sun, 3.dp.toPx(), Offset(nowIndex * cell + cell / 2, size.height - 5.dp.toPx()))
        drawRoundRect(outline, Offset(selected * cell, 0f), Size(cell, size.height), CornerRadius(5.dp.toPx()), style = Stroke(2.dp.toPx()))
    }
}

/**
 * Every hour of the day, numbered, for every city. The 24 columns never shrink below a legible
 * width: they fill the screen when there is room and scroll together when there is not, so the
 * numbers stay readable on a phone, on a tablet and at large font scales.
 */
@Composable
private fun HourGrid(
    slots: List<PlanSlot>,
    cities: List<SavedCity>,
    referenceZone: String,
    selected: Int,
    nowIndex: Int,
    use24: Boolean,
    locale: Locale,
    timeFmt: DateTimeFormatter,
    onSelect: (Int) -> Unit,
    onOpen: (String) -> Unit,
) {
    val t = LocalStrings.current
    val services = LocalServices.current
    val scroll = rememberScrollState()
    val density = LocalDensity.current
    val fontScale = density.fontScale.coerceIn(1f, 2f)
    // Half and quarter hour zones carry their minutes in the cell, so they need a wider column.
    val fractional = remember(cities, slots) {
        val probe = slots.firstOrNull()?.instant ?: java.time.Instant.now()
        cities.any { ZoneId.of(it.zoneId).rules.getOffset(probe).totalSeconds % 3600 != 0 }
    }
    Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxWidth()) {
        BoxWithConstraints(Modifier.padding(vertical = 8.dp)) {
            val minCell = ((if (fractional) 52f else 40f) * fontScale).dp
            val cell = maxOf(minCell, (maxWidth - 24.dp) / 24)
            // Wide columns on a tablet should not also become tall rows.
            val cellHeight = (36f * fontScale).dp.coerceIn(36.dp, 56.dp)
            Column {
                cities.forEachIndexed { index, city ->
                    val zone = ZoneId.of(city.zoneId)
                    val name = city.label.ifBlank { services.catalog.find(city.zoneId, locale).name }
                    val local = slots[selected].instant.atZone(zone)
                    val working = ClockEngine.isWorking(slots[selected].instant, city)
                    Column(
                        Modifier
                            .clickable(onClickLabel = t.get(R.string.card_convert_from, name)) { onOpen(city.zoneId) }
                            .semantics(mergeDescendants = true) {
                                contentDescription = t.get(
                                    R.string.plan_row_a11y, name, local.format(timeFmt),
                                    t.get(if (working) R.string.work_status_working else R.string.work_status_off),
                                )
                            }
                            .padding(top = if (index == 0) 4.dp else 10.dp, bottom = 4.dp),
                    ) {
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 28.dp).padding(horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                name,
                                style = MaterialTheme.typography.titleSmall,
                                color = if (city.zoneId == referenceZone) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                local.format(timeFmt),
                                style = MaterialTheme.typography.titleMedium.tabular,
                                color = if (working) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        HourStrip(slots, city, zone, scroll, cell, cellHeight, selected, nowIndex, use24, locale, onSelect)
                    }
                }
            }
            // Keep the chosen hour on screen whichever control moved it.
            LaunchedEffect(selected, cell) {
                val cellPx = with(density) { cell.toPx() }
                val viewport = with(density) { (maxWidth - 24.dp).toPx() }
                val start = selected * cellPx
                if (start < scroll.value || start + cellPx > scroll.value + viewport) {
                    scroll.animateScrollTo((start - viewport / 2 + cellPx / 2).roundToInt().coerceAtLeast(0))
                }
            }
        }
    }
}

@Composable
private fun HourStrip(
    slots: List<PlanSlot>,
    city: SavedCity,
    zone: ZoneId,
    scroll: androidx.compose.foundation.ScrollState,
    cell: Dp,
    cellHeight: Dp,
    selected: Int,
    nowIndex: Int,
    use24: Boolean,
    locale: Locale,
    onSelect: (Int) -> Unit,
) {
    val dark = LocalIsDark.current
    val workBg = MaterialTheme.colorScheme.primary
    val workInk = MaterialTheme.colorScheme.onPrimary
    val nightBg = if (dark) Color(0xFF101828) else Color(0xFFD3DAE6)
    val awakeBg = MaterialTheme.colorScheme.surfaceContainerHigh
    val ink = MaterialTheme.colorScheme.onSurface
    val marker = MaterialTheme.colorScheme.onSurface
    val divider = MaterialTheme.colorScheme.outlineVariant

    // One tap target per hour for touch; TalkBack uses the slider and the merged row summary.
    Row(Modifier.clearAndSetSemantics { }.horizontalScroll(scroll).padding(horizontal = 12.dp)) {
        slots.forEachIndexed { i, slot ->
            val at: ZonedDateTime = slot.instant.atZone(zone)
            val working = ClockEngine.isWorking(slot.instant, city)
            val night = at.hour < 7 || at.hour >= 22
            val background = when {
                working -> workBg
                night -> nightBg
                else -> awakeBg
            }
            Box(
                Modifier
                    .padding(horizontal = 1.dp)
                    .width(cell - 2.dp)
                    .height(cellHeight)
                    .drawBehind {
                        // A hairline where the local day turns over, so midnight is visible at a glance.
                        if (at.hour == 0) drawLine(divider, Offset(-1.dp.toPx(), 0f), Offset(-1.dp.toPx(), size.height), 1.dp.toPx())
                    }
                    .clip(RoundedCornerShape(8.dp))
                    .background(background)
                    .then(
                        if (i == selected) Modifier.border(2.dp, marker, RoundedCornerShape(8.dp))
                        else Modifier
                    )
                    .clickable { onSelect(i) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    cellLabel(at, use24, locale),
                    style = MaterialTheme.typography.labelLarge.tabular,
                    color = if (working) workInk else ink,
                    maxLines = 1,
                )
                if (i == nowIndex) {
                    Box(
                        Modifier.align(Alignment.BottomCenter).padding(bottom = 3.dp)
                            .size(4.dp).clip(CircleShape).background(Brand.Sun),
                    )
                }
            }
        }
    }
}

/** The hour number, with the minutes kept as a superscript in half and quarter hour zones. */
private fun cellLabel(at: ZonedDateTime, use24: Boolean, locale: Locale): AnnotatedString {
    val base = compactHour(at.hour, use24, locale)
    if (at.minute == 0) return AnnotatedString(base)
    return buildAnnotatedString {
        append(base)
        withStyle(SpanStyle(fontSize = 0.65.em, baselineShift = BaselineShift.Superscript)) {
            append("%02d".format(locale, at.minute))
        }
    }
}

@Composable
private fun Legend() {
    val t = LocalStrings.current
    val dark = LocalIsDark.current
    Row(Modifier.padding(start = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Swatch(MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(6.dp))
        Text(t.get(R.string.work_status_working), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(14.dp))
        Swatch(if (dark) Color(0xFF101828) else Color(0xFFD3DAE6))
        Spacer(Modifier.width(6.dp))
        Text(t.get(R.string.day_phase_night), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Swatch(color: Color) {
    Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(color))
}

/**
 * Labels taken from the real slot instants, so DST days (23 or 25 real hours) stay correct.
 * When the reference zone changes offset that day, the label carries the UTC offset.
 */
fun slotLabel(slot: PlanSlot, zone: ZoneId, use24: Boolean, dayHasShift: Boolean, locale: Locale = Locale.getDefault(), short: Boolean = false): String {
    val at = slot.instant.atZone(zone)
    val text = if (short) compactHour(at.hour, use24, locale)
    else at.format(DateTimeFormatter.ofPattern(if (use24) "HH:mm" else "h:mm a", locale))
    return if (dayHasShift && !short) "$text (${ClockEngine.offsetLabel(at.offset.totalSeconds / 60)})" else text
}

fun dayHasShift(slots: List<PlanSlot>, zone: ZoneId) = slots.map { zone.rules.getOffset(it.instant) }.distinct().size > 1
