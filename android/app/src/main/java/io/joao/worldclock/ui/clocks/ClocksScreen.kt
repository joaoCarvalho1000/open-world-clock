package io.joao.worldclock.ui.clocks

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.SwapVert
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Widgets
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.zIndex
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import io.joao.worldclock.R
import io.joao.worldclock.core.ClockEngine
import io.joao.worldclock.core.ClockReading
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.homeZoneId
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.DayNightIcon
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.rememberHomePoint
import io.joao.worldclock.ui.components.rememberNow
import io.joao.worldclock.ui.theme.daylight
import io.joao.worldclock.ui.theme.daylightStops
import io.joao.worldclock.ui.theme.tabular
import io.joao.worldclock.widget.WidgetKind
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun ClocksScreen(settings: ClockSettings, onOpenConverter: (String) -> Unit, onOpenWidgets: () -> Unit, onOpenMap: () -> Unit) {
    val t = LocalStrings.current
    val locale = t.locale
    val context = LocalContext.current
    val services = LocalServices.current
    val now by rememberNow()
    var reordering by rememberSaveable { mutableStateOf(false) }
    var showSearch by rememberSaveable { mutableStateOf(false) }
    var showHomePicker by rememberSaveable { mutableStateOf(false) }
    var editing by rememberSaveable { mutableStateOf<String?>(null) }
    // "Here" is the chosen reference city, falling back to the device zone. rememberHomePoint
    // resolves it once and also carries the coordinates the backdrop is centred on.
    val homePoint = rememberHomePoint(settings, locale)
    val home = remember(settings.homeZone) { settings.homeZoneId() }

    // The widget hint earns its place only until there is a widget on the home screen.
    var resumeTick by remember { mutableStateOf(0) }
    LifecycleResumeEffect(Unit) { resumeTick++; onPauseOrDispose { } }
    val hasWidgets = remember(resumeTick) {
        val manager = AppWidgetManager.getInstance(context)
        WidgetKind.entries.any { manager.getAppWidgetIds(ComponentName(context, it.providerClass)).isNotEmpty() }
    }

    val readings = settings.cities.map { saved ->
        saved to ClockEngine.reading(services.catalog.find(saved.zoneId, locale), saved, now, settings.use24Hour, home, locale)
    }

    val grid = rememberLazyGridState()
    val expanded by remember { derivedStateOf { grid.firstVisibleItemIndex == 0 && grid.firstVisibleItemScrollOffset < 120 } }

    // Long press lifts a card and the list reflows under it. Reorder mode and the TalkBack
    // custom actions stay, because dragging is not available to every input method.
    val haptics = LocalHapticFeedback.current
    var liftedZone by remember { mutableStateOf<String?>(null) }
    var lift by remember { mutableStateOf(Offset.Zero) }
    val zoneKeys = settings.cities.map { it.zoneId }.toSet()

    LaunchedEffect(liftedZone) {
        // Drag past the edge and the grid follows, so a long list can be reordered end to end.
        val zone = liftedZone ?: return@LaunchedEffect
        while (true) {
            val info = grid.layoutInfo
            val item = info.visibleItemsInfo.firstOrNull { it.key == zone }
            if (item == null) { withFrameNanos { }; continue }
            val top = item.offset.y + lift.y
            val bottom = top + item.size.height
            val edge = 96f
            val step = when {
                top < info.viewportStartOffset + edge -> -24f
                bottom > info.viewportEndOffset - edge -> 24f
                else -> 0f
            }
            if (step != 0f) {
                val moved = grid.scrollBy(step)
                lift = lift.copy(y = lift.y + moved)
            }
            withFrameNanos { }
        }
    }

    Box(Modifier.fillMaxSize()) {
        LazyVerticalGrid(
            state = grid,
            columns = GridCells.Adaptive(minSize = 300.dp),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                // The catalog's own label, not the zone id: splitting "America/Sao_Paulo" drops the tilde and
                // never translates, so the header read "Sao Paulo" while the card right below it read
                // "São Paulo".
                HomeHeader(now = now, home = home, place = homePoint.city.name,
                    use24 = settings.use24Hour, reordering = reordering,
                    canReorder = settings.cities.size > 1, onToggleReorder = { reordering = !reordering },
                    onOpenMap = onOpenMap, onChangeHome = { showHomePicker = true })
            }
            if (readings.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) { EmptyClocks(onAdd = { showSearch = true }) }
            }
            items(readings, key = { it.first.zoneId }) { (saved, reading) ->
                val index = settings.cities.indexOf(saved)
                val lifted = liftedZone == saved.zoneId
                CityCard(
                    reading = reading,
                    reordering = reordering,
                    lifted = lifted,
                    canMoveUp = index > 0,
                    canMoveDown = index < settings.cities.lastIndex,
                    onOpen = { onOpenConverter(saved.zoneId) },
                    onEdit = { editing = saved.zoneId },
                    onRemove = { services.removeCity(saved.zoneId) },
                    onMove = { delta -> services.moveCity(saved.zoneId, delta) },
                    modifier = Modifier
                        // The finger owns the lifted card's position; only its neighbours animate placement.
                        .animateItem(placementSpec = if (lifted) null else spring(stiffness = Spring.StiffnessMediumLow))
                        .zIndex(if (lifted) 1f else 0f)
                        .graphicsLayer {
                            if (!lifted) return@graphicsLayer
                            translationX = lift.x
                            translationY = lift.y
                            scaleX = 1.03f
                            scaleY = 1.03f
                            shadowElevation = 16.dp.toPx()
                            shape = RoundedCornerShape(24.dp)
                            clip = false
                        }
                        .pointerInput(saved.zoneId, reordering, zoneKeys) {
                            if (reordering) return@pointerInput
                            detectDragGesturesAfterLongPress(
                                onDragStart = {
                                    liftedZone = saved.zoneId
                                    lift = Offset.Zero
                                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                },
                                onDragEnd = { liftedZone = null; lift = Offset.Zero },
                                onDragCancel = { liftedZone = null; lift = Offset.Zero },
                                onDrag = { change, amount ->
                                    change.consume()
                                    lift += amount
                                    val info = grid.layoutInfo
                                    val from = info.visibleItemsInfo.firstOrNull { it.key == saved.zoneId }
                                        ?: return@detectDragGesturesAfterLongPress
                                    val centre = Offset(
                                        from.offset.x + from.size.width / 2f + lift.x,
                                        from.offset.y + from.size.height / 2f + lift.y,
                                    )
                                    val over = info.visibleItemsInfo.firstOrNull { other ->
                                        other.key in zoneKeys && other.key != saved.zoneId &&
                                            centre.x >= other.offset.x && centre.x <= other.offset.x + other.size.width &&
                                            centre.y >= other.offset.y && centre.y <= other.offset.y + other.size.height
                                    } ?: return@detectDragGesturesAfterLongPress
                                    // Read the live list: this gesture outlives several reorders.
                                    val order = services.repository.settings.value.cities
                                    val here = order.indexOfFirst { it.zoneId == saved.zoneId }
                                    val target = order.indexOfFirst { it.zoneId == over.key }
                                    if (target < 0 || here < 0 || target == here) return@detectDragGesturesAfterLongPress
                                    services.moveCity(saved.zoneId, target - here)
                                    // The card jumps to its new slot; cancel that jump so it stays under the finger.
                                    lift -= Offset(
                                        (over.offset.x - from.offset.x).toFloat(),
                                        (over.offset.y - from.offset.y).toFloat(),
                                    )
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                },
                            )
                        },
                )
            }
            if (readings.isNotEmpty() && !reordering && !hasWidgets) {
                item(span = { GridItemSpan(maxLineSpan) }) { WidgetNudge(onOpenWidgets) }
            }
        }
        if (!reordering) {
            ExtendedFloatingActionButton(
                onClick = { showSearch = true },
                expanded = expanded,
                icon = { Icon(Icons.Rounded.Add, contentDescription = if (expanded) null else t.get(R.string.clocks_add)) },
                text = { Text(t.get(R.string.clocks_add)) },
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            )
        }
    }

    if (showHomePicker) {
        CitySearchSheet(
            title = t.get(R.string.clocks_home_title),
            selected = setOf(homePoint.zoneId),
            onPick = { city -> services.setHomeZone(city.id); showHomePicker = false },
            onDismiss = { showHomePicker = false },
        )
    }
    if (showSearch) {
        CitySearchSheet(
            title = t.get(R.string.clocks_add_title),
            selected = settings.cities.map { it.zoneId }.toSet(),
            onPick = { city -> services.addCity(city.id); showSearch = false },
            onDismiss = { showSearch = false },
        )
    }
    val editTarget = settings.cities.firstOrNull { it.zoneId == editing }
    if (editTarget != null) {
        EditCitySheet(
            saved = editTarget,
            cityName = services.catalog.find(editTarget.zoneId, locale).name,
            onSave = { services.updateCity(it); editing = null },
            onRemove = { services.removeCity(editTarget.zoneId); editing = null },
            onDismiss = { editing = null },
        )
    }
}

@Composable
private fun HomeHeader(now: java.time.Instant, home: ZoneId, place: String, use24: Boolean, reordering: Boolean, canReorder: Boolean, onToggleReorder: () -> Unit, onOpenMap: () -> Unit, onChangeHome: () -> Unit) {
    val t = LocalStrings.current
    val locale = t.locale
    val local = now.atZone(home)
    val time = local.format(DateTimeFormatter.ofPattern(if (use24) "HH:mm" else "h:mm", locale))
    val seconds = local.format(DateTimeFormatter.ofPattern("ss", locale))
    val period = if (use24) "" else local.format(DateTimeFormatter.ofPattern("a", locale))
    val date = local.format(DateTimeFormatter.ofPattern("EEEE, d MMMM", locale))
    Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f).semantics(mergeDescendants = true) {
            contentDescription = t.get(R.string.clocks_here_a11y, place, "$time $period".trim(), date)
        }) {
            // Changing where "here" is belongs on the word "here", not buried in Settings. The row
            // is the tap target so the chevron and the label are one control, not two.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clip(RoundedCornerShape(50)).clickable(onClick = onChangeHome)
                    .semantics { contentDescription = t.get(R.string.clocks_home_change, place) }
                    .padding(end = 6.dp),
            ) {
                Text(t.get(R.string.clocks_here, place), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(2.dp))
                Icon(Icons.Rounded.KeyboardArrowDown, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Text(time, style = MaterialTheme.typography.displayLarge)
                Text(":$seconds", style = MaterialTheme.typography.headlineMedium.tabular,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 2.dp, bottom = 10.dp))
                if (period.isNotEmpty()) Text(" $period", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 12.dp))
            }
            Text(date, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!reordering) {
            IconButton(onClick = onOpenMap) { Icon(Icons.Rounded.Public, contentDescription = t.get(R.string.clocks_map)) }
        }
        if (canReorder || reordering) {
            if (reordering) {
                FilledTonalButton(onClick = onToggleReorder) {
                    Icon(Icons.Rounded.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(t.get(R.string.action_done))
                }
            } else {
                IconButton(onClick = onToggleReorder) { Icon(Icons.Rounded.SwapVert, contentDescription = t.get(R.string.clocks_reorder)) }
            }
        }
    }
}

@Composable
private fun CityCard(
    reading: ClockReading,
    reordering: Boolean,
    lifted: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onOpen: () -> Unit,
    onEdit: () -> Unit,
    onRemove: () -> Unit,
    onMove: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalStrings.current
    val colors = daylight(reading.isDay)
    // The card is a slice of that city's sky, sky above and horizon below, from the same six
    // phase ladder the widgets use. Both stops cross fade on the existing 600ms, so a card drifts
    // through the day rather than flipping once at sunrise and once at sunset.
    val stops = daylightStops(reading.altitude, reading.rising)
    val skyTop by animateColorAsState(stops.first, tween(600), label = "sky top")
    val skyBottom by animateColorAsState(stops.second, tween(600), label = "sky bottom")
    var menu by remember { mutableStateOf(false) }
    val spoken = buildString {
        append(reading.label).append(". ").append(reading.time).append(' ').append(reading.period).append(". ")
        append(reading.date).append(". ").append(reading.difference).append(". ")
        append(t.get(if (reading.isDay) R.string.day_phase_daytime else R.string.day_phase_night))
        if (reading.phase.isNotBlank()) append(", ").append(reading.phase)
        if (reading.isWorking) append(". ").append(t.get(R.string.work_status_working))
    }
    // The date only earns a line when this city is not on the same day as "Here".
    val meta = listOfNotNull(
        reading.difference.takeIf { it.isNotBlank() },
        reading.date.takeIf { reading.dayDifference != 0 },
    ).joinToString(" · ")
    Surface(
        color = Color.Transparent,
        contentColor = colors.ink,
        shape = RoundedCornerShape(24.dp),
        tonalElevation = 0.dp,
        shadowElevation = if (reading.isDay) 1.dp else 0.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier
                .background(Brush.verticalGradient(listOf(skyTop, skyBottom)))
                .clickable(enabled = !reordering, onClick = onOpen,
                    onClickLabel = t.get(R.string.card_convert_from, reading.label))
                .semantics(mergeDescendants = true) {
                    contentDescription = spoken
                    if (lifted) stateDescription = t.get(R.string.clocks_lifted)
                    customActions = listOf(
                        CustomAccessibilityAction(t.get(R.string.action_edit)) { onEdit(); true },
                        CustomAccessibilityAction(t.get(R.string.action_remove)) { onRemove(); true },
                    ) + (if (canMoveUp) listOf(CustomAccessibilityAction(t.get(R.string.card_move_up)) { onMove(-1); true }) else emptyList()) +
                        (if (canMoveDown) listOf(CustomAccessibilityAction(t.get(R.string.card_move_down)) { onMove(1); true }) else emptyList())
                }
                .padding(start = 20.dp, end = 8.dp, top = 16.dp, bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // At large font scales the time moves under the city so names and dates keep their full width.
            val stacked = LocalDensity.current.fontScale >= 1.3f
            val lines = if (stacked) 3 else 1
            val info: @Composable (Modifier) -> Unit = {
                Column(it) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DayNightIcon(reading.isDay, colors.ink2, Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(reading.label, style = MaterialTheme.typography.titleMedium, maxLines = lines, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(2.dp))
                    Text(meta, style = MaterialTheme.typography.bodyMedium, color = colors.ink2, maxLines = lines, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (reading.isWorking) {
                            Surface(color = colors.accent.copy(alpha = 0.14f), contentColor = colors.accent, shape = RoundedCornerShape(50)) {
                                Text(t.get(R.string.work_status_working), style = MaterialTheme.typography.labelMedium,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                            }
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(reading.phase.ifBlank { reading.offset }, style = MaterialTheme.typography.labelMedium, color = colors.ink2, maxLines = 1)
                    }
                }
            }
            val clock: @Composable () -> Unit = {
                Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.clearAndSetSemantics { }) {
                    Text(reading.time, style = MaterialTheme.typography.displaySmall)
                    if (reading.period.isNotBlank()) {
                        Text(reading.period, style = MaterialTheme.typography.labelLarge, color = colors.ink2, modifier = Modifier.padding(start = 3.dp, bottom = 6.dp))
                    }
                }
            }
            if (stacked) {
                Column(Modifier.weight(1f)) { info(Modifier); Spacer(Modifier.height(4.dp)); clock() }
            } else {
                info(Modifier.weight(1f)); clock()
            }
            if (reordering) {
                Column {
                    IconButton(onClick = { onMove(-1) }, enabled = canMoveUp) {
                        Icon(Icons.Rounded.KeyboardArrowUp, t.get(R.string.card_move_up_of, reading.label))
                    }
                    IconButton(onClick = { onMove(1) }, enabled = canMoveDown) {
                        Icon(Icons.Rounded.KeyboardArrowDown, t.get(R.string.card_move_down_of, reading.label))
                    }
                }
            } else {
                Box {
                    IconButton(onClick = { menu = true }) {
                        Icon(Icons.Rounded.MoreVert, t.get(R.string.card_options, reading.label), tint = colors.ink2)
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text(t.get(R.string.menu_convert)) }, leadingIcon = { Icon(Icons.Rounded.SwapHoriz, null) }, onClick = { menu = false; onOpen() })
                        DropdownMenuItem(text = { Text(t.get(R.string.menu_edit)) }, leadingIcon = { Icon(Icons.Rounded.Edit, null) }, onClick = { menu = false; onEdit() })
                        if (canMoveUp) DropdownMenuItem(text = { Text(t.get(R.string.card_move_up)) }, leadingIcon = { Icon(Icons.Rounded.KeyboardArrowUp, null) }, onClick = { menu = false; onMove(-1) })
                        if (canMoveDown) DropdownMenuItem(text = { Text(t.get(R.string.card_move_down)) }, leadingIcon = { Icon(Icons.Rounded.KeyboardArrowDown, null) }, onClick = { menu = false; onMove(1) })
                        DropdownMenuItem(text = { Text(t.get(R.string.action_remove)) }, leadingIcon = { Icon(Icons.Rounded.Delete, null) }, onClick = { menu = false; onRemove() })
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyClocks(onAdd: () -> Unit) {
    val t = LocalStrings.current
    Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t.get(R.string.clocks_empty_title), style = MaterialTheme.typography.titleLarge)
            Text(t.get(R.string.clocks_empty_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FilledTonalButton(onClick = onAdd) { Text(t.get(R.string.clocks_add)) }
        }
    }
}

@Composable
private fun WidgetNudge(onOpenWidgets: () -> Unit) {
    val t = LocalStrings.current
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Widgets, null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            Spacer(Modifier.width(12.dp))
            Text(t.get(R.string.clocks_widget_nudge), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.weight(1f))
            TextButton(onClick = onOpenWidgets) { Text(t.get(R.string.nav_widgets)) }
        }
    }
}
