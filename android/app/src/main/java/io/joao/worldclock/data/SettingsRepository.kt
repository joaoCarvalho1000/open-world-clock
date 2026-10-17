package io.joao.worldclock.data

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.text.format.DateFormat
import io.joao.worldclock.core.*
import io.joao.worldclock.widget.WidgetKind
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.ZoneId

class SettingsRepository(context: Context) {
    private val backend = synchronized(SettingsRepository::class.java) {
        shared ?: Backend(context.applicationContext).also { shared = it }
    }
    val settings: StateFlow<ClockSettings> = backend.flow.asStateFlow()
    fun addCity(id: String) {
        if (!SettingsCodec.validZone(id)) return
        backend.update { if (it.cities.any { c -> c.zoneId == id } || it.cities.size >= 50) it else it.copy(cities = it.cities + SavedCity(id)) }
    }
    fun removeCity(id: String) = backend.update { it.copy(cities = it.cities.filterNot { c -> c.zoneId == id }) }
    fun moveCity(id: String, delta: Int) = backend.update {
        val list = it.cities.toMutableList()
        val from = list.indexOfFirst { c -> c.zoneId == id }
        if (from >= 0) { val to = (from + delta).coerceIn(0, list.lastIndex); list.add(to, list.removeAt(from)) }
        it.copy(cities = list)
    }
    fun updateCity(city: SavedCity) = backend.update { it.copy(cities = it.cities.map { c -> if (c.zoneId == city.zoneId) SettingsCodec.sanitize(city) else c }) }
    fun setUse24Hour(value: Boolean) = backend.update { it.copy(use24Hour = value) }
    fun setTheme(value: AppTheme) = backend.update { it.copy(theme = value) }
    fun setLanguage(value: AppLanguage) = backend.update { it.copy(language = value) }
    /** Null restores the device zone. An unknown id is dropped rather than persisted. */
    fun setHomeZone(id: String?) = backend.update { it.copy(homeZone = id?.takeIf(SettingsCodec::validZone)) }
    private class Backend(val context: Context) {
        val prefs = context.getSharedPreferences("world_clock", Context.MODE_PRIVATE)
        private val initial = ClockSettings((listOf(ZoneId.systemDefault().id) + listOf("Europe/Lisbon", "America/New_York", "Asia/Tokyo"))
            .distinct().filter(SettingsCodec::validZone).map(::SavedCity), DateFormat.is24HourFormat(context))
        val flow = MutableStateFlow(SettingsCodec.decode(prefs.getString("settings", null), initial))
        @Synchronized fun update(transform: (ClockSettings) -> ClockSettings) {
            val next = transform(flow.value)
            if (next == flow.value) return
            prefs.edit().putString("settings", SettingsCodec.encode(next)).apply()
            flow.value = next
            val manager = AppWidgetManager.getInstance(context)
            // Every kind, taken from the registry rather than named here. A hardcoded subset stops
            // refreshing the kinds added after it was written, which is how the ten premium widgets
            // came to miss reference city, language and city changes until a periodic refresh.
            // This only asks each provider to redraw; what it then draws stays its own business.
            WidgetKind.entries.forEach { kind ->
                val component = ComponentName(context, kind.providerClass)
                val ids = manager.getAppWidgetIds(component)
                if (ids.isNotEmpty()) context.sendBroadcast(Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).setComponent(component).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids))
            }
        }
    }
    companion object { private var shared: Backend? = null }
}
