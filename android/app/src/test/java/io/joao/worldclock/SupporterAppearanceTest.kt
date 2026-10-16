package io.joao.worldclock

import io.joao.worldclock.billing.SupporterState
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.widget.AppearanceCodec
import io.joao.worldclock.widget.AppearancePreset
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.WidgetConfigCodec
import io.joao.worldclock.widget.ClockFace
import io.joao.worldclock.widget.PremiumCatalog
import io.joao.worldclock.widget.WidgetKind
import io.joao.worldclock.widget.WidgetStyle
import io.joao.worldclock.widget.forAccess
import io.joao.worldclock.widget.matches
import io.joao.worldclock.widget.withLook
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SupporterAppearanceTest {
    private val paperSerif = AppearancePreset("a", "Paper", WidgetStyle.LIGHT, "paper", "serif")
    private val settings = ClockSettings(listOf(SavedCity("Europe/Lisbon"), SavedCity("Asia/Tokyo")))

    @Test fun presetsRoundTripAndSurviveHostileStorage() {
        val saved = listOf(paperSerif, AppearancePreset("b", "Night mono", WidgetStyle.DARK, null, "mono"))
        assertEquals(saved, AppearanceCodec.decode(AppearanceCodec.encode(saved)))
        assertEquals(emptyList<AppearancePreset>(), AppearanceCodec.decode("{not an array"))
        assertEquals(emptyList<AppearancePreset>(), AppearanceCodec.decode(null))

        val hostile = AppearanceCodec.decode(
            """[{"id":"x","name":"  Gold  ","style":"NEON","theme":"GOLD","font":"COMIC"},
               {"id":"x","name":"Copy"},{"id":"","name":"No id"},{"id":"y","name":"   "}]""",
        )
        val single = hostile.single()
        assertEquals("Gold", single.name)
        assertEquals(WidgetStyle.AUTO, single.style)
        assertNull("An unknown theme must fall back to the free look", single.theme)
        assertEquals(PremiumCatalog.face("system"), single.font)
    }

    @Test fun savedLooksAreBoundedAndNamesTrimmed() {
        val many = (1..AppearanceCodec.MAX_PRESETS + 6).map { AppearancePreset("id$it", "Look $it") }
        assertEquals(AppearanceCodec.MAX_PRESETS, AppearanceCodec.decode(AppearanceCodec.encode(many)).size)
        val long = AppearanceCodec.bounded(listOf(paperSerif.copy(name = "x".repeat(80)))).single()
        assertEquals(AppearanceCodec.MAX_NAME, long.name.length)
    }

    @Test fun aLookAppliesWithoutTouchingTheCityList() {
        val config = WidgetConfig(listOf("Asia/Tokyo"), WidgetStyle.DARK)
        val applied = config.withLook(paperSerif)
        assertEquals(listOf("Asia/Tokyo"), applied.zones)
        assertEquals(PremiumCatalog.theme("paper"), applied.theme)
        assertEquals(PremiumCatalog.face("serif"), applied.font)
        assertTrue(applied.matches(paperSerif))
        assertFalse(config.matches(paperSerif))
        assertEquals("Asia/Tokyo", applied.cities(WidgetKind.SINGLE, settings).single().zoneId)
    }

    @Test fun withoutAccessTheFreeLookIsDrawnAndThePaidOneIsKept() {
        val config = WidgetConfig(listOf("Europe/Lisbon"), WidgetStyle.DARK, "forest", "mono")
        val free = config.forAccess(false)
        assertNull(free.theme)
        assertEquals(PremiumCatalog.face("system"), free.font)
        assertEquals("The free style a widget was placed with is never overwritten", WidgetStyle.DARK, free.style)
        assertEquals(listOf("Europe/Lisbon"), free.zones)
        // The stored config is untouched, so access returning restores the look exactly.
        assertEquals(PremiumCatalog.theme("forest"), config.theme)
        assertEquals(config, config.forAccess(true))
        val plain = WidgetConfig(listOf("Europe/Lisbon"), WidgetStyle.LIGHT)
        assertEquals(plain, plain.forAccess(false))
    }

    @Test fun widgetsPlacedBeforeTheSupporterPackKeepTheirLook() {
        val migrated = WidgetConfigCodec.decode("Asia/Tokyo,Europe/Lisbon", "DARK", null, null)
        assertEquals(WidgetConfig(listOf("Asia/Tokyo", "Europe/Lisbon"), WidgetStyle.DARK), migrated)
        assertNull(migrated.theme)
        assertEquals(PremiumCatalog.face("system"), migrated.font)

        val stored = WidgetConfigCodec.decode("", "LIGHT", "PAPER", "CONDENSED")
        assertEquals(PremiumCatalog.theme("paper"), stored.theme)
        assertEquals(PremiumCatalog.face("condensed"), stored.font)
        assertTrue(stored.zones.isEmpty())

        val corrupt = WidgetConfigCodec.decode("Not/AZone,Asia/Tokyo", "SPARKLE", "", "")
        assertEquals(WidgetStyle.AUTO, corrupt.style)
        assertNull(corrupt.theme)
        assertEquals(PremiumCatalog.face("system"), corrupt.font)
        assertEquals("Asia/Tokyo", WidgetConfigCodec.encodeZones(corrupt))
    }

    @Test fun everyPaidFaceNamesASystemFamilyAndTheFreeOneDoesNot() {
        assertNull(PremiumCatalog.face("system").family)
        assertFalse(PremiumCatalog.face("system").premium)
        PremiumCatalog.faces.filter { it.premium }.forEach {
            assertTrue("${it.id} must name a font family", !it.family.isNullOrBlank())
        }
        assertEquals(16, PremiumCatalog.themes.size)
        assertEquals(PremiumCatalog.theme("paper"), io.joao.worldclock.widget.WidgetConfigCodec.decode(null, null, "PAPER", null).theme)
        assertNull(PremiumCatalog.theme("unknown"))
    }

    /**
     * The sheet tells people a yearly subscription is cheaper than twelve monthly ones. That claim
     * is only safe when Play quoted both plans, in one currency, and yearly really is cheaper.
     * Every other case has to say nothing rather than guess, because a wrong saving on a store
     * listing is the kind of mistake that gets an app pulled.
     */
    @Test fun yearlySavingIsClaimedOnlyWhenItIsTrueAndComparable() {
        fun state(year: Long?, month: Long?, currency: String? = "USD") =
            SupporterState(yearlyMicros = year, monthlyMicros = month, currency = currency)

        // US$5 a year against US$1 a month is US$5 versus US$12, a saving of 58 percent.
        assertEquals(58, state(5_000_000, 1_000_000).yearlySavingPercent)

        // Nothing to claim, so nothing is said.
        assertNull("yearly dearer than monthly", state(20_000_000, 1_000_000).yearlySavingPercent)
        assertNull("yearly identical to twelve months", state(12_000_000, 1_000_000).yearlySavingPercent)
        assertNull("yearly not quoted", state(null, 1_000_000).yearlySavingPercent)
        assertNull("monthly not quoted", state(5_000_000, null).yearlySavingPercent)
        assertNull("currencies differ, so the two are not comparable",
            state(5_000_000, 1_000_000, currency = null).yearlySavingPercent)
        assertNull("nonsense amounts", state(0, 0).yearlySavingPercent)
    }
}
