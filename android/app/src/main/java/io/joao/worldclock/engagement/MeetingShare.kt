package io.joao.worldclock.engagement

import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.data.CityCatalog
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

object MeetingShare {
    /** UTC is deliberate: the website can recover the exact minute even during a repeated local hour. */
    fun url(instant: Instant, zones: List<String>, locale: Locale): String {
        val language = locale.language.takeIf { it in setOf("pt", "es") } ?: "en"
        val path = if (language == "en") "/" else "/$language/"
        val cities = zones.distinct().take(50).joinToString(",") { URLEncoder.encode(it, "UTF-8").replace("%2F", "/") }
        val time = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm", Locale.ROOT).withZone(ZoneOffset.UTC).format(instant)
        return "https://openworldclock.com$path#lang=$language&c=$cities&t=$time&z=UTC"
    }

    fun text(instant: Instant, settings: ClockSettings, catalog: CityCatalog, locale: Locale): String {
        val format = DateTimeFormatter.ofPattern(if (settings.use24Hour) "EEE d MMM, HH:mm" else "EEE d MMM, h:mm a", locale)
        val rows = settings.cities.map { saved ->
            val city = catalog.find(saved.zoneId, locale)
            "${saved.label.ifBlank { city.name }}: ${instant.atZone(java.time.ZoneId.of(saved.zoneId)).format(format)}"
        }
        return (rows + "" + url(instant, settings.cities.map { it.zoneId }, locale)).joinToString("\n")
    }
}
