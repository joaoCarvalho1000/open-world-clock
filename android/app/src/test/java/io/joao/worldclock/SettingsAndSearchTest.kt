package io.joao.worldclock

import io.joao.worldclock.core.*
import io.joao.worldclock.data.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.util.Locale

class SettingsAndSearchTest {
    private val fallback = ClockSettings(listOf(SavedCity("Europe/Lisbon")),false)
    private val catalog = CatalogIndex(JSONObject(javaClass.getResource("/zones.json")!!.readText()))
    @Test fun settingsRoundTripIncludesEmptyListAndOvernightShift() {
        val settings = ClockSettings(listOf(SavedCity("Asia/Kathmandu","Team",22,6,setOf(5,6))),false,AppTheme.DARK)
        assertEquals(settings,SettingsCodec.decode(SettingsCodec.encode(settings),fallback))
        val empty = settings.copy(cities=emptyList())
        assertEquals(empty,SettingsCodec.decode(SettingsCodec.encode(empty),fallback))
    }
    @Test fun corruptAndHostileSettingsRecoverWithoutInvalidZones() {
        assertEquals(fallback,SettingsCodec.decode("{broken",fallback))
        val clean = SettingsCodec.decode("""{"cities":[{"zoneId":"Invalid/Zone"},{"zoneId":"UTC","label":"  Office  ","workStart":-20,"workEnd":99,"workDays":[-1,1,9]},{"zoneId":"UTC"}],"theme":"invalid"}""",fallback)
        assertEquals(listOf(SavedCity("UTC","Office",0,23,setOf(1))),clean.cities)
        assertEquals(AppTheme.SYSTEM,clean.theme)
    }
    @Test fun searchSupportsAccentsCountryAliasesAndOffsets() {
        assertTrue(catalog.search("sao paulo").any { it.id == "America/Sao_Paulo" })
        assertTrue(catalog.search("Japan").any { it.id == "Asia/Tokyo" })
        assertTrue(catalog.search("Porto").any { it.id == "Europe/Lisbon" })
        assertTrue(catalog.search("EST").any { it.id == "America/New_York" })
        assertTrue(catalog.search("UTC+5:45",Instant.parse("2026-01-01T00:00:00Z")).any { it.id == "Asia/Kathmandu" })
        assertTrue(catalog.search("UTC+5:99").isEmpty())
        assertEquals("Asia/Tokyo",catalog.search("Tokyo").first().id)
        assertEquals("Europe/Kyiv",catalog.find("Europe/Kiev").id)
    }
    @Test fun catalogContainsRealCoordinatesAndEnoughOfflineCities() {
        assertTrue(catalog.cities.size > 350)
        assertEquals(35.68,catalog.find("Asia/Tokyo").latitude,0.01)
        assertEquals(-74.01,catalog.find("America/New_York").longitude,0.01)
        assertEquals(catalog.cities.size,catalog.cities.map { it.id }.distinct().size)
    }
    @Test fun languageChoicePersistsAndOldSettingsUseSystemLanguage() {
        AppLanguage.entries.forEach { language ->
            val settings = fallback.copy(language = language)
            assertEquals(settings, SettingsCodec.decode(SettingsCodec.encode(settings), fallback))
        }
        assertEquals(AppLanguage.SYSTEM, SettingsCodec.decode("""{"cities":[],"language":"unsupported"}""", fallback).language)
        assertEquals(AppLanguage.SYSTEM, SettingsCodec.decode("""{"cities":[]}""", fallback).language)
        assertEquals("pt-BR", AppLanguage.SYSTEM.locale(Locale.forLanguageTag("pt-PT")).toLanguageTag())
        assertEquals("es-419", AppLanguage.SYSTEM.locale(Locale.forLanguageTag("es-ES")).toLanguageTag())
        assertEquals("en-US", AppLanguage.SYSTEM.locale(Locale.JAPANESE).toLanguageTag())
    }
    @Test fun catalogLocalizesCityCountryAndFindsNamesAcrossLanguages() {
        val pt = Locale.forLanguageTag("pt-BR")
        val es = Locale.forLanguageTag("es-419")
        assertEquals("Lisboa", catalog.find("Europe/Lisbon", pt).name)
        assertEquals("Nova York", catalog.find("America/New_York", pt).name)
        assertEquals("Londres", catalog.find("Europe/London", es).name)
        assertEquals("Japão", catalog.find("Asia/Tokyo", pt).country)
        assertEquals("Asia/Tokyo", catalog.search("Toquio", locale = pt).first().id)
        assertEquals("Europe/London", catalog.search("Londres", locale = Locale.ENGLISH).first().id)
        assertTrue(catalog.search("Japón", locale = es).any { it.id == "Asia/Tokyo" })
        assertTrue(catalog.search("New York", locale = pt).any { it.name == "Nova York" })
    }
    @Test fun clockMetadataUsesChosenLanguageWithoutChangingTheInstant() {
        val city = catalog.find("America/Sao_Paulo")
        val saved = SavedCity(city.id, "My team")
        val instant = Instant.parse("2026-10-11T15:00:00Z")
        val pt = ClockEngine.reading(city, saved, instant, true, java.time.ZoneOffset.UTC, Locale.forLanguageTag("pt-BR"))
        val es = ClockEngine.reading(city, saved, instant, true, java.time.ZoneOffset.UTC, Locale.forLanguageTag("es-419"))
        assertEquals("12:00", pt.time)
        assertEquals(pt.time, es.time)
        assertEquals("My team", pt.label)
        assertEquals("Meio-dia", pt.phase)
        assertEquals("Mediodía", es.phase)
        assertEquals("3h a menos", pt.difference)
        assertEquals("3h menos", es.difference)
        assertEquals("Mesmo horário", ClockEngine.differenceLabel(0, Locale.forLanguageTag("pt-BR")))
        assertEquals("Misma hora", ClockEngine.differenceLabel(0, Locale.forLanguageTag("es-419")))
    }

    @Test fun referenceCitySurvivesARoundTripAndIsOptional() {
        val chosen = fallback.copy(homeZone = "Asia/Tokyo")
        assertEquals(chosen, SettingsCodec.decode(SettingsCodec.encode(chosen), fallback))
        assertEquals("Asia/Tokyo", chosen.homeZoneId().id)
        // Absent is a real state, not an empty string: it means "follow the device".
        val none = fallback.copy(homeZone = null)
        assertNull(SettingsCodec.decode(SettingsCodec.encode(none), fallback).homeZone)
        assertEquals(java.time.ZoneId.systemDefault(), none.homeZoneId())
    }
    @Test fun referenceCityRejectsRubbishAndSurvivesAZoneThatStopsExisting() {
        // A hostile or stale payload must not become the zone every difference is measured from.
        val decoded = SettingsCodec.decode("""{"cities":[{"zoneId":"UTC"}],"homeZone":"Mars/Olympus"}""", fallback)
        assertNull(decoded.homeZone)
        // A zone that passed validation when stored but no longer resolves falls back, never throws.
        assertEquals(java.time.ZoneId.systemDefault(), fallback.copy(homeZone = "Mars/Olympus").homeZoneId())
    }

    /** `data/SettingsRepository.kt`, found by walking up from the module directory. */
    private fun settingsRepositorySource(): java.io.File {
        var dir: java.io.File? = java.io.File(".").absoluteFile
        while (dir != null) {
            val candidate = java.io.File(dir, "app/src/main/java/io/joao/worldclock/data/SettingsRepository.kt")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw AssertionError("SettingsRepository.kt not found walking up from ${java.io.File(".").absolutePath}")
    }

    /**
     * A settings change must reach every widget kind, not a subset written down by hand. The
     * broadcast once named three providers literally, so the ten premium kinds added later never
     * refreshed when the reference city, language or city list changed; Date Line kept showing the
     * old reference date until a periodic refresh happened to fire.
     *
     * Unit tests here run on the JVM with no `AppWidgetManager`, so this guards the drift itself:
     * the registry must be the source of the list. `SkyTest` reads `sky.css` the same way.
     */
    @Test fun everyWidgetKindIsRefreshedWhenSettingsChange() {
        val source = settingsRepositorySource().readText()
        assertTrue(
            "SettingsRepository must broadcast over WidgetKind.entries so new widget kinds refresh",
            source.contains("WidgetKind.entries"),
        )
        // The old shape: provider class names spelled out as strings next to the broadcast.
        val hardcoded = Regex("\"\\w*WidgetProvider\"").findAll(source).map { it.value }.toList()
        assertTrue(
            "provider names are hardcoded in SettingsRepository and will drift from WidgetKind: $hardcoded",
            hardcoded.isEmpty(),
        )
    }
}
