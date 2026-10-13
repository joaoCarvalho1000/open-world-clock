package io.joao.worldclock.data

import android.content.Context
import io.joao.worldclock.core.City
import org.json.JSONObject
import java.text.Normalizer
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

class CityCatalog(context: Context) {
    private val catalog = synchronized(CityCatalog::class.java) {
        cached ?: CatalogIndex(JSONObject(context.assets.open("zones.json").bufferedReader().use { it.readText() })).also { cached = it }
    }
    val cities: List<City> get() = catalog.cities
    fun cities(locale: Locale): List<City> = catalog.cities(locale)
    fun find(id: String, locale: Locale = Locale.getDefault()): City = catalog.find(id, locale)
    fun search(query: String, locale: Locale = Locale.getDefault()): List<City> = catalog.search(query, locale = locale)
    companion object { private var cached: CatalogIndex? = null }
}

/** Platform-free index, shared by search and catalog tests. */
class CatalogIndex(private val data: JSONObject) {
    private val legacy = data.optJSONObject("legacy") ?: JSONObject()
    private val meta = data.getJSONObject("meta")
    private val coords = data.optJSONObject("coords") ?: JSONObject()
    private val abbreviations = data.optJSONObject("abbreviations") ?: JSONObject()
    private val cityNames = data.optJSONObject("cityNames") ?: JSONObject()
    private val countryNames = data.optJSONObject("countryNames") ?: JSONObject()
    private val countryCodes = data.optJSONObject("countryCodes") ?: JSONObject()
    fun canonical(id: String): String = legacy.optString(id, id)
    val cities: List<City> = (ZoneId.getAvailableZoneIds() + meta.keys().asSequence().toList())
        .map(::canonical).distinct().filter { runCatching { ZoneId.of(it) }.isSuccess }
        .filter { !it.startsWith("SystemV/") && !it.startsWith("Etc/") && (it.contains('/') || it == "UTC") }
        .map { id ->
            val m = meta.optJSONObject(id)
            val xy = coords.optJSONArray(id)
            City(id, m?.optString("city")?.takeIf { it.isNotBlank() } ?: id.substringAfterLast('/').replace('_', ' '),
                m?.optString("country") ?: "", m?.optDouble("lat", xy?.optDouble(0) ?: 0.0) ?: xy?.optDouble(0) ?: 0.0,
                m?.optDouble("lng", xy?.optDouble(1) ?: 0.0) ?: xy?.optDouble(1) ?: 0.0, m?.optString("alias") ?: "")
        }.sortedBy { it.name }
    private val byId = cities.associateBy { it.id }
    private fun localized(city: City, locale: Locale): City {
        val name = cityNames.optJSONObject(locale.language)?.optString(city.id).orEmpty().ifBlank { city.name }
        val country = countryNames.optJSONObject(locale.language)?.optString(countryCodes.optString(city.id)).orEmpty().ifBlank { city.country }
        return city.copy(name = name, country = country)
    }
    private val searchTerms = cities.associate { city -> city.id to normalize(
        listOf(Locale.ENGLISH, Locale.forLanguageTag("pt-BR"), Locale.forLanguageTag("es-419"))
            .joinToString(" ") { localized(city, it).let { translated -> "${translated.name} ${translated.country}" } } +
            " ${city.country} ${city.aliases} ${city.id}"
    ) }
    fun cities(locale: Locale): List<City> = cities.map { localized(it, locale) }.sortedBy { it.name }
    fun find(id: String, locale: Locale = Locale.ENGLISH): City {
        val canonical = canonical(id)
        return localized(byId[canonical] ?: City(canonical, canonical.substringAfterLast('/').replace('_', ' ')), locale)
    }
    fun search(query: String, instant: Instant = Instant.now(), locale: Locale = Locale.ENGLISH): List<City> {
        val q = normalize(query.trim())
        if (q.isBlank()) return cities(locale)
        val offset = parseOffset(q)
        val abbreviation = abbreviations.optJSONArray(query.trim().lowercase(Locale.ROOT))
        val abbrIds = if (abbreviation == null) emptySet() else (0 until abbreviation.length()).map { canonical(abbreviation.getString(it)) }.toSet()
        return cities.filter { city ->
            if (offset != null) ZoneId.of(city.id).rules.getOffset(instant).totalSeconds / 60 == offset
            else city.id in abbrIds || searchTerms.getValue(city.id).contains(q)
        }.map { localized(it, locale) }.sortedWith(compareBy<City> { if (normalize(it.name) == q) 0 else if (normalize(it.name).startsWith(q)) 1 else 2 }.thenBy { it.name })
    }
    private fun normalize(value: String) = Normalizer.normalize(value, Normalizer.Form.NFD).replace(Regex("\\p{M}"), "").lowercase(Locale.ROOT)
    private fun parseOffset(query: String): Int? {
        val match = Regex("^(?:utc|gmt)?([+-])(\\d{1,2})(?::?(\\d{2}))?$").matchEntire(query) ?: return if (query == "utc" || query == "gmt") 0 else null
        val hours = match.groupValues[2].toInt()
        val minutes = match.groupValues[3].ifBlank { "0" }.toInt()
        if (hours > 14 || minutes > 59 || hours == 14 && minutes != 0) return null
        return (hours * 60 + minutes) * if (match.groupValues[1] == "-") -1 else 1
    }
}
