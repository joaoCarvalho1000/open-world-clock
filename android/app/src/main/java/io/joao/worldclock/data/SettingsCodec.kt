package io.joao.worldclock.data

import io.joao.worldclock.core.*
import org.json.JSONArray
import org.json.JSONObject
import java.time.ZoneId

object SettingsCodec {
    fun validZone(id: String): Boolean = id.length <= 100 && runCatching { ZoneId.of(id) }.isSuccess
    fun sanitize(city: SavedCity): SavedCity = city.copy(label = city.label.trim().filterNot { it.isISOControl() }.take(40), workStart = city.workStart.coerceIn(0, 23), workEnd = city.workEnd.coerceIn(0, 23), workDays = city.workDays.filter { it in 1..7 }.toSet())
    fun decode(raw: String?, fallback: ClockSettings): ClockSettings = runCatching {
        if (raw == null) return fallback
        val json = JSONObject(raw)
        val array = json.optJSONArray("cities")
        val cities = if (array == null) fallback.cities else (0 until array.length()).mapNotNull { i ->
            val item = array.optJSONObject(i) ?: return@mapNotNull null
            val id = item.optString("zoneId")
            if (!validZone(id)) return@mapNotNull null
            val days = item.optJSONArray("workDays")
            sanitize(SavedCity(id, item.optString("label"), item.optInt("workStart", 9), item.optInt("workEnd", 17),
                if (days == null) setOf(1,2,3,4,5) else (0 until days.length()).map { days.optInt(it) }.toSet()))
        }.distinctBy { it.zoneId }.take(50)
        ClockSettings(cities, json.optBoolean("use24Hour", fallback.use24Hour),
            runCatching { AppTheme.valueOf(json.optString("theme")) }.getOrDefault(AppTheme.SYSTEM),
            runCatching { AppLanguage.valueOf(json.optString("language")) }.getOrDefault(AppLanguage.SYSTEM),
            json.optString("homeZone").takeIf(::validZone))
    }.getOrDefault(fallback)
    fun encode(settings: ClockSettings): String = JSONObject().put("version", 1)
        .put("use24Hour", settings.use24Hour).put("theme", settings.theme.name).put("language", settings.language.name)
        .putOpt("homeZone", settings.homeZone)
        .put("cities", JSONArray(settings.cities.map { c -> JSONObject().put("zoneId", c.zoneId).put("label", c.label)
            .put("workStart", c.workStart).put("workEnd", c.workEnd).put("workDays", JSONArray(c.workDays.sorted())) })).toString()
}
