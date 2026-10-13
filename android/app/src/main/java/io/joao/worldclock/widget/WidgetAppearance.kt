package io.joao.worldclock.widget

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/** Accept the original enum names without locale-dependent case conversion. */
fun catalogId(value: String?): String? = value?.trim()?.lowercase(Locale.ROOT)?.takeIf { it.isNotEmpty() }

/** A named theme and font, reusable on any widget. Presets never carry a city list. */
data class AppearancePreset(
    val id: String,
    val name: String,
    val style: WidgetStyle = WidgetStyle.AUTO,
    val themeId: String? = null,
    val faceId: String = "system",
) {
    val theme: ThemePalette? get() = PremiumCatalog.theme(themeId)
    val font: ClockFace get() = PremiumCatalog.face(faceId)
    val premium: Boolean get() = theme != null || font.premium
}

/**
 * Reading and writing presets, kept pure so the rules (bounded list, trimmed names, unknown
 * values ignored) can be tested without a device.
 */
object AppearanceCodec {
    const val MAX_PRESETS = 12
    const val MAX_NAME = 24

    fun sanitize(preset: AppearancePreset): AppearancePreset = preset.copy(
        id = preset.id.trim().filterNot { it.isISOControl() }.take(40),
        name = preset.name.trim().filterNot { it.isISOControl() }.take(MAX_NAME),
    )

    fun bounded(presets: List<AppearancePreset>): List<AppearancePreset> = presets
        .map(::sanitize)
        .filter { it.id.isNotBlank() && it.name.isNotBlank() }
        .distinctBy { it.id }
        .take(MAX_PRESETS)

    fun decode(raw: String?): List<AppearancePreset> = runCatching {
        if (raw.isNullOrBlank()) return emptyList()
        val array = JSONArray(raw)
        bounded((0 until array.length()).mapNotNull { i ->
            val item = array.optJSONObject(i) ?: return@mapNotNull null
            AppearancePreset(
                id = item.optString("id"),
                name = item.optString("name"),
                style = runCatching { WidgetStyle.valueOf(item.optString("style")) }.getOrDefault(WidgetStyle.AUTO),
                themeId = catalogId(item.optString("theme")),
                faceId = catalogId(item.optString("font")) ?: "system",
            )
        })
    }.getOrDefault(emptyList())

    fun encode(presets: List<AppearancePreset>): String = JSONArray(
        bounded(presets).map {
            JSONObject().put("id", it.id).put("name", it.name).put("style", it.style.name)
                .put("theme", it.themeId ?: "").put("font", it.faceId)
        },
    ).toString()
}

/**
 * What a widget may actually render. Without Supporter access the paid fields are ignored but
 * never erased, so the look returns the moment access does.
 */
fun WidgetConfig.forAccess(hasAccess: Boolean): WidgetConfig =
    if (hasAccess || (theme == null && !font.premium)) this
    else copy(themeId = null, faceId = "system")

/** Applying a preset changes the look only. The widget keeps its cities. */
fun WidgetConfig.withLook(preset: AppearancePreset): WidgetConfig =
    copy(style = preset.style, themeId = preset.themeId, faceId = preset.faceId)

fun WidgetConfig.matches(preset: AppearancePreset): Boolean =
    preset.theme == theme && preset.font == font && (theme != null || preset.style == style)
