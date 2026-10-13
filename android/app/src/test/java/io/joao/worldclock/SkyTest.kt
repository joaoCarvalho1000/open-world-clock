package io.joao.worldclock

import io.joao.worldclock.core.Sky
import io.joao.worldclock.widget.PremiumCatalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The sky is shared with the desktop renderer and the Apple app, so most of what matters here is
 * agreement rather than behaviour: the same altitude must name the same phase everywhere, and the
 * stops must be the ones `sky.css` authored.
 */
class SkyTest {

    /** `src/renderer/motion/sky.css`, found by walking up from the module directory. */
    private fun skyCss(): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "src/renderer/motion/sky.css")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw AssertionError("sky.css not found walking up from ${File(".").absolutePath}")
    }

    /**
     * The one that matters most. `Sky.swift` pasted converted sRGB constants and four of its dark
     * theme stops no longer match the CSS they cite. Authoring oklch here and checking it against
     * the CSS means Android cannot drift the same way without this failing.
     */
    @Test fun stopsMatchTheDesktopStylesheet() {
        val css = skyCss().readText()
        // `:root { ... }` first, then the dark override block.
        val blocks = Regex("\\{([^}]*)}", RegexOption.DOT_MATCHES_ALL).findAll(css).map { it.groupValues[1] }.toList()
        val light = blocks.first { it.contains("--sky-day-a") }
        val dark = blocks.last { it.contains("--sky-day-a") }
        assertTrue("expected two distinct stop blocks in sky.css", light != dark)

        fun parse(block: String, name: String): Sky.Oklch {
            val match = Regex("--sky-$name:\\s*oklch\\(([-0-9.]+)\\s+([-0-9.]+)\\s+([-0-9.]+)\\s*/\\s*([-0-9.]+)\\)")
                .find(block) ?: throw AssertionError("--sky-$name missing from sky.css")
            val (l, c, h, a) = match.destructured
            return Sky.Oklch(l.toDouble(), c.toDouble(), h.toDouble(), a.toDouble())
        }

        for (phase in Sky.Phase.entries) {
            val key = phase.name.lowercase()
            for (isDark in listOf(false, true)) {
                val block = if (isDark) dark else light
                val mine = Sky.stops(phase, isDark)
                assertEquals("$key top (dark=$isDark)", parse(block, "$key-a"), mine.top)
                assertEquals("$key bottom (dark=$isDark)", parse(block, "$key-b"), mine.bottom)
            }
        }
    }

    /** The ladder of `sky.js` phaseOf and `Sky.swift` phase, boundary by boundary. */
    @Test fun phaseLadderMatchesTheOtherPlatforms() {
        assertEquals(Sky.Phase.NIGHT, Sky.phase(-18.0, rising = true))
        assertEquals(Sky.Phase.NIGHT, Sky.phase(-12.1, rising = false))
        assertEquals(Sky.Phase.TWILIGHT, Sky.phase(-11.9, rising = true))
        assertEquals(Sky.Phase.TWILIGHT, Sky.phase(-11.9, rising = false))
        // Below -4 falling is still twilight; above it the evening turns to dusk.
        assertEquals(Sky.Phase.TWILIGHT, Sky.phase(-4.1, rising = false))
        assertEquals(Sky.Phase.DUSK, Sky.phase(-3.9, rising = false))
        // The same height going up is morning, and morning is never dusk.
        assertEquals(Sky.Phase.TWILIGHT, Sky.phase(-3.9, rising = true))
        assertEquals(Sky.Phase.DAWN, Sky.phase(0.0, rising = true))
        assertEquals(Sky.Phase.DAWN, Sky.phase(6.0, rising = true))
        assertEquals(Sky.Phase.DAY, Sky.phase(6.1, rising = true))
        assertEquals(Sky.Phase.GOLDEN, Sky.phase(10.0, rising = false))
        assertEquals(Sky.Phase.DAY, Sky.phase(10.1, rising = false))
    }

    /** Dawn is not dusk. The whole direction rests on this, so it gets its own case. */
    @Test fun theSameAltitudeDiffersByDirectionOfTravel() {
        for (altitude in listOf(-3.0, -2.0, -1.0)) {
            assertEquals(Sky.Phase.TWILIGHT, Sky.phase(altitude, rising = true))
            assertEquals(Sky.Phase.DUSK, Sky.phase(altitude, rising = false))
        }
        for (altitude in listOf(1.0, 4.0, 6.0)) {
            assertEquals(Sky.Phase.DAWN, Sky.phase(altitude, rising = true))
            assertEquals(Sky.Phase.GOLDEN, Sky.phase(altitude, rising = false))
        }
    }

    /**
     * The contrast guarantee. `sky.css` keeps each family inside a luminance band so the matching
     * text colour clears 4.5:1; interpolation must never leave the band, because the midpoint
     * between the two families is a surface where neither text colour passes.
     */
    @Test fun interpolationStaysInsideItsLuminanceBand() {
        fun check(altitude: Double, rising: Boolean, dark: Boolean) {
            val stops = Sky.stops(altitude, rising, dark)
            val night = Sky.isNightSurface(Sky.phase(altitude, rising))
            for ((which, stop) in listOf("top" to stops.top, "bottom" to stops.bottom)) {
                val l = stop.l
                val label = "alt=$altitude rising=$rising dark=$dark $which L=$l"
                when {
                    !dark && !night -> assertTrue("$label must stay >= 0.94", l >= 0.94 - 1e-9)
                    !dark && night -> assertTrue("$label must stay <= 0.34", l <= 0.34 + 1e-9)
                    dark && !night -> assertTrue("$label must stay <= 0.42", l <= 0.42 + 1e-9)
                    else -> assertTrue("$label must stay <= 0.30", l <= 0.30 + 1e-9)
                }
            }
        }
        var altitude = -18.0
        while (altitude <= 90.0) {
            for (rising in listOf(true, false)) for (dark in listOf(true, false)) check(altitude, rising, dark)
            altitude += 0.25
        }
    }

    /**
     * Continuous within a family. The horizon is excluded on purpose: the text colour switches
     * there, so that crossing is a deliberate hard change rather than a blend.
     */
    @Test fun theRampNeverSnapsInsideAFamily() {
        fun sweep(from: Double, to: Double, rising: Boolean, dark: Boolean) {
            var altitude = from
            var previous = Sky.stops(altitude, rising, dark)
            while (altitude < to) {
                // Clamped, or the last step would land past the horizon and sample the other
                // family, whose distance from this one is the switch this test must not cross.
                altitude = minOf(altitude + 0.1, to)
                val current = Sky.stops(altitude, rising, dark)
                val step = maxOf(
                    kotlin.math.abs(current.top.l - previous.top.l),
                    kotlin.math.abs(current.bottom.l - previous.bottom.l),
                )
                assertTrue("L jumped $step at altitude $altitude (rising=$rising dark=$dark)", step < 0.01)
                previous = current
            }
        }
        for (dark in listOf(true, false)) {
            sweep(-18.0, Sky.HORIZON - 0.001, rising = true, dark = dark)
            sweep(-18.0, Sky.HORIZON - 0.001, rising = false, dark = dark)
            sweep(Sky.HORIZON + 0.001, 90.0, rising = true, dark = dark)
            sweep(Sky.HORIZON + 0.001, 90.0, rising = false, dark = dark)
        }
    }

    /**
     * The oklch to sRGB conversion, checked against `Sky.swift`'s independently converted constants
     * for the stops where the two platforms still agree.
     */
    @Test fun conversionMatchesTheSwiftPort() {
        fun assertRgb(phase: Sky.Phase, dark: Boolean, top: Triple<Double, Double, Double>, bottom: Triple<Double, Double, Double>) {
            val stops = Sky.stops(phase, dark)
            for ((which, pair) in listOf("top" to (stops.top to top), "bottom" to (stops.bottom to bottom))) {
                val argb = Sky.argb(pair.first)
                val expected = intArrayOf(
                    Math.round(pair.second.first * 255).toInt(),
                    Math.round(pair.second.second * 255).toInt(),
                    Math.round(pair.second.third * 255).toInt(),
                )
                val actual = intArrayOf((argb shr 16) and 0xFF, (argb shr 8) and 0xFF, argb and 0xFF)
                for (i in 0..2) {
                    assertTrue(
                        "$phase dark=$dark $which channel $i: expected ${expected[i]} got ${actual[i]}",
                        kotlin.math.abs(expected[i] - actual[i]) <= 1,
                    )
                }
            }
        }
        assertRgb(Sky.Phase.DAY, false, Triple(0.9165, 0.9737, 1.0000), Triple(0.9749, 0.9953, 1.0000))
        assertRgb(Sky.Phase.DAWN, false, Triple(0.8984, 0.9605, 1.0000), Triple(1.0000, 0.9261, 0.8602))
        assertRgb(Sky.Phase.GOLDEN, false, Triple(1.0000, 0.9308, 0.8404), Triple(1.0000, 0.8933, 0.8930))
        assertRgb(Sky.Phase.TWILIGHT, false, Triple(0.1062, 0.1415, 0.2651), Triple(0.2228, 0.1763, 0.3333))
        assertRgb(Sky.Phase.DUSK, false, Triple(0.1516, 0.1502, 0.2921), Triple(0.2890, 0.1628, 0.3088))
        assertRgb(Sky.Phase.NIGHT, false, Triple(0.0566, 0.1003, 0.1947), Triple(0.0901, 0.1608, 0.2653))
        // Dark theme: only the stops Sky.swift has not drifted on.
        assertRgb(Sky.Phase.DAY, true, Triple(0.1681, 0.2931, 0.4007), Triple(0.1470, 0.2305, 0.3238))
        assertRgb(Sky.Phase.TWILIGHT, true, Triple(0.0519, 0.0809, 0.1660), Triple(0.1488, 0.1150, 0.2428))
        assertRgb(Sky.Phase.DUSK, true, Triple(0.0877, 0.0911, 0.1927), Triple(0.2168, 0.1112, 0.2408))
        assertRgb(Sky.Phase.NIGHT, true, Triple(0.0199, 0.0403, 0.1012), Triple(0.0427, 0.0858, 0.1569))
    }

    /** Alpha rides through the conversion, since the stops are translucent over the card. */
    @Test fun alphaSurvivesConversion() {
        assertEquals(0.9, Sky.stops(Sky.Phase.DAY, false).top.alpha, 1e-9)
        assertEquals(230, (Sky.argb(Sky.stops(Sky.Phase.DAY, false).top) ushr 24) and 0xFF)
        assertEquals(245, (Sky.argb(Sky.stops(Sky.Phase.NIGHT, false).top) ushr 24) and 0xFF)
    }

    /** Relative luminance, the WCAG definition, so contrast can be checked the way a person reads. */
    private fun luminance(argb: Int): Double {
        fun channel(c: Int): Double {
            val v = c / 255.0
            return if (v <= 0.03928) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel((argb shr 16) and 0xFF) +
            0.7152 * channel((argb shr 8) and 0xFF) +
            0.0722 * channel(argb and 0xFF)
    }

    private fun contrast(a: Int, b: Int): Double {
        val x = luminance(a); val y = luminance(b)
        return (maxOf(x, y) + 0.05) / (minOf(x, y) + 0.05)
    }

    /**
     * oklch to sRGB and back has to land where it started, or [Sky.dressed] is built on sand.
     *
     * The tolerance is 0.01 rather than nothing because several authored stops sit outside the
     * sRGB gamut and are clipped on the way out, which `Sky.swift` records in its own constants
     * as "gamut-clipped". What a dressed palette actually produces is always in gamut, so that
     * path is checked exactly below.
     */
    @Test fun theColourConversionRoundTrips() {
        for (phase in Sky.Phase.entries) for (dark in listOf(true, false)) {
            val stops = Sky.stops(phase, dark)
            for (stop in listOf(stops.top, stops.bottom)) {
                val back = Sky.toOklch(Sky.argb(stop))
                assertEquals("$phase dark=$dark lightness", stop.l, back.l, 0.01)
                assertEquals("$phase dark=$dark chroma", stop.c, back.c, 0.01)
            }
        }
        // An in gamut colour has to survive exactly, which is the case dressed palettes use.
        for (theme in PremiumCatalog.themes) {
            val back = Sky.toOklch(Sky.argb(Sky.toOklch(theme.bg)))
            assertEquals(theme.id, Sky.lightnessOf(theme.bg), back.l, 0.002)
        }
    }

    /**
     * The whole point of wearing the sky rather than being replaced by it: a paid palette keeps
     * the lightness its own ink was chosen against, so every phase stays readable. This is the
     * test that lets the Supporter Pack follow the sun at all.
     */
    @Test fun aDressedPaletteKeepsTheContrastItsInkWasChosenFor() {
        var worst = Double.MAX_VALUE
        var worstName = ""
        for (theme in PremiumCatalog.themes) for (phase in Sky.Phase.entries) for (dark in listOf(true, false)) {
            val (top, bottom) = Sky.dressed(theme.bg, phase, dark)
            for ((which, stop) in listOf("top" to top, "bottom" to bottom)) {
                val ratio = contrast(theme.ink, stop)
                if (ratio < worst) { worst = ratio; worstName = "${theme.id} $phase dark=$dark $which" }
                assertTrue(
                    "${theme.id} at $phase (dark=$dark, $which) drops its ink to ${"%.2f".format(ratio)}:1",
                    ratio >= 4.5,
                )
                // Lightness is the channel that carries contrast, so it must barely move.
                val drift = kotlin.math.abs(Sky.lightnessOf(stop) - Sky.lightnessOf(theme.bg))
                assertTrue("${theme.id} at $phase moved lightness by $drift", drift <= 0.03)
            }
        }
        println("worst dressed contrast: ${"%.2f".format(worst)}:1 at $worstName")
    }

    /**
     * And it has to actually change, or the pack is still selling a static swatch. Measured as a
     * perceptual distance rather than a hue angle, because hue is meaningless at low chroma and
     * several palettes are nearly neutral by design.
     */
    @Test fun aDressedPaletteLooksDifferentAtDifferentHours() {
        for (theme in PremiumCatalog.themes) {
            val golden = Sky.toOklch(Sky.dressed(theme.bg, Sky.Phase.GOLDEN, false).second)
            val night = Sky.toOklch(Sky.dressed(theme.bg, Sky.Phase.NIGHT, false).second)
            fun ab(c: Sky.Oklch) = c.c * kotlin.math.cos(Math.toRadians(c.h)) to
                c.c * kotlin.math.sin(Math.toRadians(c.h))
            val (ga, gb) = ab(golden)
            val (na, nb) = ab(night)
            // Full OKLab distance: lightness is part of how different two surfaces look.
            val apart = kotlin.math.sqrt(
                (ga - na) * (ga - na) + (gb - nb) * (gb - nb) +
                    (golden.l - night.l) * (golden.l - night.l),
            )
            assertTrue(
                "${theme.id} is the same colour at golden hour and midnight (distance $apart)",
                apart > 0.012,
            )
        }
    }

    /** A palette that leads has to still be itself: the sky inflects its hue, it does not take it. */
    @Test fun aDressedPaletteStaysRecognisablyItself() {
        for (theme in PremiumCatalog.themes) {
            val base = Sky.toOklch(theme.bg)
            if (base.c < 0.02) continue // a near neutral palette has no hue to protect
            for (phase in Sky.Phase.entries) {
                val worn = Sky.toOklch(Sky.dressed(theme.bg, phase, false).second)
                val apart = kotlin.math.min(
                    kotlin.math.abs(worn.h - base.h),
                    360.0 - kotlin.math.abs(worn.h - base.h),
                )
                assertTrue(
                    "${theme.id} swung ${apart.toInt()} degrees of hue at $phase, which is a different palette",
                    apart <= 40.0,
                )
                assertTrue(
                    "${theme.id} washed out at $phase: chroma ${worn.c} against ${base.c}",
                    worn.c >= base.c * 0.55,
                )
            }
        }
    }
}
