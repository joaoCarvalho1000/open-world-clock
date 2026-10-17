package io.joao.worldclock.widget

import android.content.Context
import androidx.annotation.StringRes
import io.joao.worldclock.R
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.data.SettingsCodec
import java.time.ZoneId

/** Titles and blurbs are string resources so every surface, app or launcher, names a widget the same way. */
enum class WidgetKind(
    @StringRes val titleRes: Int,
    @StringRes val blurbRes: Int,
    val size: String,
    val maxCities: Int,
    val providerClass: Class<*>,
    val premium: Boolean = false,
) {
    SINGLE(R.string.widget_single_label, R.string.widget_single_blurb, "2×2", 1, SingleClockWidgetProvider::class.java),
    WORLD(R.string.widget_world_label, R.string.widget_world_blurb, "4×2", 4, WorldClockWidgetProvider::class.java),
    MEETING(R.string.widget_meeting_label, R.string.widget_meeting_blurb, "4×3", 4, MeetingWidgetProvider::class.java),
    DUO(R.string.widget_duo_label, R.string.widget_duo_blurb, "4×2", 2, DuoWidgetProvider::class.java, true),
    BOARD(R.string.widget_board_label, R.string.widget_board_blurb, "4×3", 4, WorldBoardWidgetProvider::class.java, true),
    WORKDAY(R.string.widget_workday_label, R.string.widget_workday_blurb, "4×2", 1, WorkdayWidgetProvider::class.java, true),
    MAP(R.string.widget_map_label, R.string.widget_map_blurb, "4×3", 3, MapWidgetProvider::class.java, true),
    DAYLIGHT(R.string.widget_daylight_label, R.string.widget_daylight_blurb, "4×2", 1, DaylightWidgetProvider::class.java, true),
    NEXT(R.string.widget_next_label, R.string.widget_next_blurb, "4×2", 4, NextWidgetProvider::class.java, true),
    WEEK(R.string.widget_week_label, R.string.widget_week_blurb, "4×3", 4, WeekWidgetProvider::class.java, true),
    RULER(R.string.widget_ruler_label, R.string.widget_ruler_blurb, "4×2", 3, RulerWidgetProvider::class.java, true),
    DATELINE(R.string.widget_dateline_label, R.string.widget_dateline_blurb, "4×3", 4, DateLineWidgetProvider::class.java, true),
    CHANGE(R.string.widget_change_label, R.string.widget_change_blurb, "4×2", 4, ChangeWidgetProvider::class.java, true);

    fun forAccess(hasAccess: Boolean): WidgetKind = if (hasAccess) this else when (this) {
        DUO, BOARD, MAP, WEEK, RULER, DATELINE -> WORLD
        WORKDAY, DAYLIGHT, NEXT, CHANGE -> SINGLE
        else -> this
    }

    companion object {
        fun forProvider(className: String?): WidgetKind? = entries.firstOrNull { it.providerClass.name == className }
    }
}

/**
 * AUTO follows real daylight where it carries meaning (the single city card, each world row)
 * and the system theme elsewhere. LIGHT and DARK pin the widget to one look.
 */
enum class WidgetStyle { AUTO, LIGHT, DARK }

/**
 * Per-instance widget settings. An empty zone list means "follow my clock list".
 * [style] is the free look and is always kept, even while a Supporter [theme] is chosen,
 * so a widget can fall back to it without losing what the person picked.
 */
data class WidgetConfig(
    val zones: List<String> = emptyList(),
    val style: WidgetStyle = WidgetStyle.AUTO,
    val themeId: String? = null,
    val faceId: String = "system",
) {
    val theme: ThemePalette? get() = PremiumCatalog.theme(themeId)
    val font: ClockFace get() = PremiumCatalog.face(faceId)

    fun cities(kind: WidgetKind, settings: ClockSettings): List<SavedCity> {
        val chosen = zones.filter(SettingsCodec::validZone).distinct().take(kind.maxCities)
        val list = if (chosen.isNotEmpty()) chosen.map { z -> settings.cities.firstOrNull { it.zoneId == z } ?: SavedCity(z) }
        else settings.cities.take(kind.maxCities)
        return list.ifEmpty { listOf(SavedCity(ZoneId.systemDefault().id)) }
    }
}

/**
 * The stored form of one widget. Kept pure so migration, which is what a widget placed
 * before the Supporter Pack goes through on every update, can be tested without a device.
 */
object WidgetConfigCodec {
    /** A widget saved before themes existed has no theme or font keys and keeps its free look. */
    fun decode(zones: String?, style: String?, theme: String?, font: String?) = WidgetConfig(
        zones = zones.orEmpty().split(',').filter { it.isNotBlank() },
        style = runCatching { WidgetStyle.valueOf(style ?: "AUTO") }.getOrDefault(WidgetStyle.AUTO),
        themeId = catalogId(theme),
        faceId = catalogId(font) ?: "system",
    )

    fun encodeZones(config: WidgetConfig): String =
        config.zones.filter(SettingsCodec::validZone).joinToString(",")
}

/** SharedPreferences store keyed by appWidgetId, so every placed widget is independent. */
class WidgetStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("widget_instances", Context.MODE_PRIVATE)

    fun load(id: Int): WidgetConfig = WidgetConfigCodec.decode(
        prefs.getString("$id.zones", ""),
        prefs.getString("$id.style", null),
        prefs.getString("$id.theme", null),
        prefs.getString("$id.font", null),
    )

    fun isConfigured(id: Int) = prefs.contains("$id.style")

    fun save(id: Int, config: WidgetConfig) {
        prefs.edit()
            .putString("$id.zones", WidgetConfigCodec.encodeZones(config))
            .putString("$id.style", config.style.name)
            .putString("$id.theme", config.themeId ?: "")
            .putString("$id.font", config.faceId)
            .apply()
    }

    fun delete(ids: IntArray) {
        val edit = prefs.edit()
        ids.forEach { edit.remove("$it.zones").remove("$it.style").remove("$it.theme").remove("$it.font") }
        edit.apply()
    }
}

/**
 * Saved looks, shared by every widget. Bounded and independent of the widget instances, so
 * deleting a widget never takes a saved look with it and losing access never deletes one.
 */
class AppearanceStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("widget_appearance", Context.MODE_PRIVATE)

    fun presets(): List<AppearancePreset> = AppearanceCodec.decode(prefs.getString(KEY, null))

    /** Returns false when the list is full, so the UI can say so instead of silently dropping one. */
    fun save(preset: AppearancePreset): Boolean {
        val current = presets()
        val kept = current.filterNot { it.id == preset.id }
        if (kept.size >= AppearanceCodec.MAX_PRESETS) return false
        prefs.edit().putString(KEY, AppearanceCodec.encode(kept + preset)).apply()
        return true
    }

    fun delete(id: String) {
        prefs.edit().putString(KEY, AppearanceCodec.encode(presets().filterNot { it.id == id })).apply()
    }

    private companion object { const val KEY = "presets" }
}
