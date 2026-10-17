package io.joao.worldclock.ui

import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Widgets
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.annotation.StringRes
import io.joao.worldclock.R
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.homeZoneId
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.backdrop.WorldBackdrop
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.rememberHomePoint
import io.joao.worldclock.ui.components.rememberNow
import io.joao.worldclock.ui.clocks.ClocksScreen
import io.joao.worldclock.ui.converter.ConverterScreen
import io.joao.worldclock.ui.planner.PlannerScreen
import io.joao.worldclock.ui.settings.SettingsScreen
import io.joao.worldclock.ui.widgets.WidgetsScreen
import io.joao.worldclock.ui.map.MapScreen
import androidx.activity.compose.BackHandler
import androidx.compose.material.icons.rounded.Public
import java.time.Instant
import java.time.ZoneId

enum class AppDestination(@StringRes val label: Int, val icon: ImageVector, val primary: Boolean = true) {
    Clocks(R.string.nav_clocks, Icons.Rounded.Schedule),
    Convert(R.string.nav_convert, Icons.Rounded.SwapHoriz),
    Plan(R.string.nav_plan, Icons.Rounded.CalendarMonth),
    Widgets(R.string.nav_widgets, Icons.Rounded.Widgets),
    Settings(R.string.nav_settings, Icons.Rounded.Settings),
    // Secondary screen reached from the Clocks header and worldclock://map; keeps the bar at five tabs.
    Map(R.string.nav_map, Icons.Rounded.Public, primary = false),
}

/** A validated in-app destination parsed from a `worldclock://` URI. Unknown input is dropped. */
data class DeepLink(val destination: AppDestination, val zone: String? = null) {
    companion object {
        fun parse(uri: Uri?): DeepLink? {
            if (uri == null || uri.scheme != "worldclock") return null
            return when (uri.host) {
                "convert" -> DeepLink(AppDestination.Convert, validZone(uri.getQueryParameter("zone")))
                "planner" -> DeepLink(AppDestination.Plan)
                "widgets" -> DeepLink(AppDestination.Widgets)
                "settings" -> DeepLink(AppDestination.Settings)
                "clocks" -> DeepLink(AppDestination.Clocks)
                "map" -> DeepLink(AppDestination.Map)
                else -> null
            }
        }

        fun validZone(raw: String?): String? {
            if (raw.isNullOrBlank() || raw.length > 64) return null
            if (!raw.matches(Regex("[A-Za-z0-9_+\\-/]+"))) return null
            return raw.takeIf { it in ZoneId.getAvailableZoneIds() }
        }
    }
}

@Composable
fun WorldClockApp(settings: ClockSettings, deepLink: DeepLink?, onDeepLinkConsumed: () -> Unit) {
    val t = LocalStrings.current
    var destination by rememberSaveable { mutableStateOf(AppDestination.Clocks) }
    var converterZone by rememberSaveable { mutableStateOf<String?>(null) }
    // Bumped whenever an external request asks the converter to reset to "now" for a zone.
    var converterRequest by rememberSaveable { mutableStateOf(0) }
    // Epoch millis to convert, or null for "now" in the requested zone.
    var converterInstant by rememberSaveable { mutableStateOf<Long?>(null) }

    LaunchedEffect(deepLink) {
        if (deepLink != null) {
            destination = deepLink.destination
            if (deepLink.zone != null) {
                converterZone = deepLink.zone
                converterInstant = null
                converterRequest++
            }
            onDeepLinkConsumed()
        }
    }

    val openConverterAt: (String, Instant?) -> Unit = { zone, instant ->
        converterZone = zone
        converterInstant = instant?.toEpochMilli()
        converterRequest++
        destination = AppDestination.Convert
    }
    val openConverter: (String) -> Unit = { openConverterAt(it, null) }
    BackHandler(enabled = destination == AppDestination.Map) { destination = AppDestination.Clocks }

    val stateHolder = rememberSaveableStateHolder()
    // The backdrop only needs minutes: the terminator cannot visibly move faster, and this keeps
    // an 18KB path and a 144x54 solar grid off the once-a-second recomposition the clocks run on.
    val backdropNow by rememberNow(60_000)
    val home = rememberHomePoint(settings, t.locale)
    BoxWithConstraints(Modifier.fillMaxSize()) {
        WorldBackdrop(home.latitude, home.longitude, home.city.name, settings.homeZoneId(), backdropNow, Modifier.fillMaxSize())
        val wide = maxWidth >= 600.dp
        // Large font scales wrap five bar labels into single letters; go icon-only and speak the label instead.
        val iconOnly = LocalDensity.current.fontScale >= 1.3f
        val content: @Composable (Modifier) -> Unit = { modifier ->
            Box(modifier) {
                stateHolder.SaveableStateProvider(destination.name) {
                when (destination) {
                    AppDestination.Clocks -> ClocksScreen(settings, onOpenConverter = openConverter, onOpenWidgets = { destination = AppDestination.Widgets },
                        onOpenMap = { destination = AppDestination.Map })
                    AppDestination.Convert -> ConverterScreen(settings, converterZone, converterInstant, converterRequest)
                    AppDestination.Plan -> PlannerScreen(settings, onOpenConverter = openConverterAt)
                    AppDestination.Widgets -> WidgetsScreen(settings)
                    AppDestination.Settings -> SettingsScreen(settings)
                    AppDestination.Map -> MapScreen(settings, onBack = { destination = AppDestination.Clocks }, onOpenConverter = openConverter)
                }
                }
            }
        }
        if (wide) {
            Row(Modifier.fillMaxSize()) {
                NavigationRail(containerColor = Color.Transparent, modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Start + WindowInsetsSides.Vertical))) {
                    AppDestination.entries.filter { it.primary }.forEach { d ->
                        NavigationRailItem(
                            selected = d == destination || (d == AppDestination.Clocks && destination == AppDestination.Map),
                            onClick = { destination = d },
                            icon = { Icon(d.icon, contentDescription = null) },
                            label = { Text(t.get(d.label)) },
                        )
                    }
                }
                Scaffold(Modifier.weight(1f), containerColor = Color.Transparent) { padding -> content(Modifier.padding(padding)) }
            }
        } else {
            Scaffold(
                containerColor = Color.Transparent,
                bottomBar = {
                    // Translucent so the sky and the terminator run to the bottom edge of the screen
                    // instead of stopping at a bar. Still a solid tint, so labels keep their contrast.
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.82f)) {
                        AppDestination.entries.filter { it.primary }.forEach { d ->
                            NavigationBarItem(
                                selected = d == destination || (d == AppDestination.Clocks && destination == AppDestination.Map),
                                onClick = { destination = d },
                                icon = { Icon(d.icon, contentDescription = if (iconOnly) t.get(d.label) else null) },
                                label = if (iconOnly) null else { { Text(t.get(d.label)) } },
                            )
                        }
                    }
                },
            ) { padding -> content(Modifier.padding(padding)) }
        }
    }
}
