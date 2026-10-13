package io.joao.worldclock

import io.joao.worldclock.widget.*
import org.junit.Assert.*
import org.junit.Test
import java.util.Locale
import kotlin.math.pow

class PremiumCatalogTest {
    @Test fun catalogReferencesAreUniqueAndEveryLookCanBeStoredAndRestored() {
        assertEquals(16, PremiumCatalog.themes.size)
        assertEquals(24, PremiumCatalog.looks.size)
        assertEquals(7, PremiumCatalog.faces.size)
        listOf(PremiumCatalog.themes.map { it.id }, PremiumCatalog.faces.map { it.id },
            PremiumCatalog.looks.map { it.id }).forEach { ids ->
            assertEquals(ids.size, ids.distinct().size)
            assertTrue(ids.all { it.matches(Regex("[a-z][a-z0-9-]*")) })
        }
        assertEquals(1, PremiumCatalog.faces.count { !it.premium })
        PremiumCatalog.looks.forEach { look ->
            assertNotNull(PremiumCatalog.theme(look.themeId))
            assertTrue(PremiumCatalog.faces.any { it.id == look.faceId })
            val preset = AppearancePreset(look.id, look.id, WidgetStyle.DARK, look.themeId, look.faceId)
            assertEquals(preset, AppearanceCodec.decode(AppearanceCodec.encode(listOf(preset))).single())
            val saved = WidgetConfig(listOf("Asia/Kathmandu"), WidgetStyle.DARK).withLook(preset)
            assertEquals(look.themeId, saved.theme?.id)
            assertEquals(look.faceId, saved.font.id)
            val free = saved.forAccess(false)
            assertNull(free.theme)
            assertEquals("system", free.font.id)
            assertEquals(saved.zones, free.zones)
            assertEquals(WidgetStyle.DARK, free.style)
            assertEquals(saved, saved.forAccess(true))
        }
    }

    @Test fun migrationIsLocaleIndependentAndUnknownIdsRemainRecoverable() {
        val old = Locale.getDefault()
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"))
            val known = WidgetConfigCodec.decode("Asia/Tokyo", "LIGHT", "INK", "SERIF")
            assertEquals("ink", known.themeId)
            assertEquals("serif", known.faceId)
            val unknown = AppearanceCodec.decode("""[{"id":"x","name":"Future","theme":"future-theme","font":"future-face"}]""").single()
            assertNull(unknown.theme)
            assertEquals("system", unknown.font.id)
            assertEquals(unknown, AppearanceCodec.decode(AppearanceCodec.encode(listOf(unknown))).single())
        } finally { Locale.setDefault(old) }
    }

    private fun luminance(color: Int): Double {
        fun channel(shift: Int): Double {
            val value = ((color ushr shift) and 255) / 255.0
            return if (value <= 0.04045) value / 12.92 else ((value + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
    }
    private fun contrast(a: Int, b: Int): Double {
        val x = luminance(a); val y = luminance(b)
        return (maxOf(x, y) + 0.05) / (minOf(x, y) + 0.05)
    }
    private fun over(fg: Int, bg: Int): Int {
        val alpha = (fg ushr 24) / 255.0
        fun channel(shift: Int) = ((((fg ushr shift) and 255) * alpha + ((bg ushr shift) and 255) * (1 - alpha)).toInt()) shl shift
        return 0xFF000000.toInt() or channel(16) or channel(8) or channel(0)
    }

    @Test fun paletteTextRemainsReadableOnBothSurfaceAndWorldRows() {
        PremiumCatalog.themes.forEach { p ->
            assertTrue("${p.id} primary ink", contrast(p.ink, p.bg) >= 7)
            listOf(p.bg, over(p.row, p.bg)).forEach { background ->
                listOf(p.ink, p.ink2, p.accent).forEach { ink ->
                    assertTrue("${p.id} text contrast ${contrast(ink, background)}", contrast(ink, background) >= 4.5)
                }
            }
            assertTrue("${p.id} marker ring", contrast(p.marker, p.markerRing) >= 3)
        }
    }
}
