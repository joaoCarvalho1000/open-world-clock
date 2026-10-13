package io.joao.worldclock.core

import java.time.Instant
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cbrt
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The six phase sky, shared with the desktop renderer (`src/renderer/motion/sky.js`, stops in
 * `motion/sky.css`) and the Apple app (`WorldClockCore/Sky.swift`). Android shipped without it and
 * coloured every surface from [Sun.isDay], a boolean, so high noon and one minute before sunset
 * rendered identically.
 *
 * Two things differ from the other platforms, both deliberate:
 *
 *  1. Stops are authored here in oklch, the same numbers the CSS carries, and converted to sRGB at
 *     runtime. `Sky.swift` pasted already converted sRGB constants and has since drifted from the
 *     CSS on three dark theme stops. `SkyTest` reads `sky.css` and asserts these literals match it,
 *     so that cannot happen again on this platform.
 *  2. The desktop snaps between the six phases and cross fades in time. Here the stops also
 *     interpolate *within* a phase by altitude, so a card moves continuously instead of stepping.
 */
object Sky {
    /** The standard refraction corrected sunrise altitude, the same one [Sun.isDay] thresholds on. */
    const val HORIZON = -0.833

    /** How far a palette is carried toward the sky's hue, and the most it may ever travel. */
    private const val HUE_PULL = 0.35
    private const val MAX_HUE_SWING = 36.0

    enum class Phase { NIGHT, TWILIGHT, DAWN, DAY, GOLDEN, DUSK }

    /** oklch exactly as authored in `sky.css`. Hue in degrees; [alpha] is the stop's own opacity. */
    data class Oklch(val l: Double, val c: Double, val h: Double, val alpha: Double = 1.0)

    /** Top of the card is sky, bottom is horizon, matching `--sky-a` and `--sky-b`. */
    data class Stops(val top: Oklch, val bottom: Oklch)

    /**
     * Light text or dark text. The two families exist because `--day-fg` and `--night-fg` switch
     * here, and only each family's own luminance band keeps the matching text above 4.5:1. Nothing
     * may interpolate across this line: the midpoint between L 0.96 and L 0.27 is a surface where
     * neither text colour passes.
     */
    fun isNightSurface(phase: Phase): Boolean = when (phase) {
        Phase.NIGHT, Phase.TWILIGHT, Phase.DUSK -> true
        Phase.DAWN, Phase.DAY, Phase.GOLDEN -> false
    }

    /** `sky.js` phaseOf and `Sky.swift` phase, unchanged, so all three platforms name one moment alike. */
    fun phase(altitude: Double, rising: Boolean): Phase {
        if (altitude <= HORIZON) {
            if (altitude < -12) return Phase.NIGHT
            return if (altitude < -4 || rising) Phase.TWILIGHT else Phase.DUSK
        }
        if (rising) return if (altitude <= 6) Phase.DAWN else Phase.DAY
        return if (altitude <= 10) Phase.GOLDEN else Phase.DAY
    }

    fun phase(instant: Instant, latitude: Double, longitude: Double): Phase {
        val altitude = Sun.altitude(instant, latitude, longitude)
        return phase(altitude, rising(instant, latitude, longitude, altitude))
    }

    /** Ten minutes on, as `sky.js` measures it. Dawn and dusk are the same height and nothing alike. */
    fun rising(
        instant: Instant,
        latitude: Double,
        longitude: Double,
        altitude: Double = Sun.altitude(instant, latitude, longitude),
    ): Boolean = Sun.altitude(instant.plusSeconds(600), latitude, longitude) > altitude

    /**
     * The continuous ramp: anchors in altitude order within one family, never across it.
     *
     * Each list runs from the far end of its family toward the horizon, and an altitude between two
     * anchors blends their stops. Where two anchors name different phases the card is genuinely
     * between two skies rather than snapping from one to the next; the phase boundaries the other
     * platforms step at sit inside those gaps.
     */
    private val RISING_NIGHT = listOf(-18.0 to Phase.NIGHT, -6.0 to Phase.TWILIGHT, HORIZON to Phase.TWILIGHT)
    private val RISING_DAY = listOf(HORIZON to Phase.DAWN, 6.0 to Phase.DAWN, 12.0 to Phase.DAY, 90.0 to Phase.DAY)
    private val FALLING_DAY = listOf(HORIZON to Phase.GOLDEN, 10.0 to Phase.GOLDEN, 16.0 to Phase.DAY, 90.0 to Phase.DAY)
    private val FALLING_NIGHT = listOf(-18.0 to Phase.NIGHT, -12.0 to Phase.TWILIGHT, -4.0 to Phase.DUSK, HORIZON to Phase.DUSK)

    private fun anchors(altitude: Double, rising: Boolean): List<Pair<Double, Phase>> = when {
        altitude <= HORIZON && rising -> RISING_NIGHT
        altitude <= HORIZON -> FALLING_NIGHT
        rising -> RISING_DAY
        else -> FALLING_DAY
    }

    /** The stops for one moment, interpolated. [dark] is the app theme, not the city's own sun. */
    fun stops(altitude: Double, rising: Boolean, dark: Boolean): Stops {
        val ladder = anchors(altitude, rising)
        val clamped = altitude.coerceIn(ladder.first().first, ladder.last().first)
        val upper = ladder.indexOfFirst { it.first >= clamped }.coerceAtLeast(1)
        val (lowAltitude, lowPhase) = ladder[upper - 1]
        val (highAltitude, highPhase) = ladder[upper]
        if (lowPhase == highPhase) return stops(lowPhase, dark)
        val t = if (highAltitude == lowAltitude) 0.0 else (clamped - lowAltitude) / (highAltitude - lowAltitude)
        val from = stops(lowPhase, dark)
        val to = stops(highPhase, dark)
        return Stops(mix(from.top, to.top, t), mix(from.bottom, to.bottom, t))
    }

    /** Top and bottom as sRGB, ready for a shader or a generated bitmap. */
    fun gradient(altitude: Double, rising: Boolean, dark: Boolean): Pair<Int, Int> =
        stops(altitude, rising, dark).let { argb(it.top) to argb(it.bottom) }

    /**
     * Blended through OKLab rather than along the oklch hue circle: interpolating hue directly
     * takes the long way round between a blue sky and an amber horizon and passes through green.
     */
    fun mix(from: Oklch, to: Oklch, t: Double): Oklch {
        val f = t.coerceIn(0.0, 1.0)
        val (fromA, fromB) = ab(from)
        val (toA, toB) = ab(to)
        val a = fromA + (toA - fromA) * f
        val b = fromB + (toB - fromB) * f
        var hue = Math.toDegrees(atan2(b, a))
        if (hue < 0) hue += 360.0
        return Oklch(from.l + (to.l - from.l) * f, hypot(a, b), hue, from.alpha + (to.alpha - from.alpha) * f)
    }

    private fun ab(color: Oklch): Pair<Double, Double> {
        val radians = color.h * PI / 180.0
        return color.c * cos(radians) to color.c * sin(radians)
    }

    /** oklch to sRGB, the standard OKLab matrices and the sRGB transfer function. */
    fun argb(color: Oklch): Int {
        val (a, b) = ab(color)
        val lp = color.l + 0.3963377774 * a + 0.2158037573 * b
        val mp = color.l - 0.1055613458 * a - 0.0638541728 * b
        val sp = color.l - 0.0894841775 * a - 1.2914855480 * b
        val l = lp * lp * lp
        val m = mp * mp * mp
        val s = sp * sp * sp
        val red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        val green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        val blue = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        return (channel(color.alpha) shl 24) or (channel(transfer(red)) shl 16) or
            (channel(transfer(green)) shl 8) or channel(transfer(blue))
    }

    private fun transfer(linear: Double): Double =
        if (linear <= 0.0031308) 12.92 * linear
        else 1.055 * linear.coerceAtLeast(0.0).pow(1 / 2.4) - 0.055

    private fun channel(value: Double): Int = (value.coerceIn(0.0, 1.0) * 255.0).roundToInt()

    /**
     * A palette worn at one moment.
     *
     * A chosen palette used to return early and never consult the sun, so buying the Supporter
     * Pack made a widget static: the paid product was the only thing in the app that did not
     * follow the signature it was sold on. This inverts that. The palette keeps the lightness its
     * own ink and accent were chosen against, which is what holds contrast, and borrows the
     * phase's hue and some of its chroma. Paper stays paper, and Paper at dusk is not Paper at
     * noon.
     */
    fun dressed(background: Int, phase: Phase, dark: Boolean): Pair<Int, Int> {
        val base = toOklch(background)
        val sky = stops(phase, dark)
        // Hue alone cannot separate every phase: a warm cream's shortest path to a night blue runs
        // backwards through red, so rotation would make midnight warmer than noon. Brightness does
        // the work hue cannot, and it is also simply true that a surface is dimmer after dark.
        // Kept well inside the drift the ink can absorb.
        val mood = if (isNightSurface(phase)) -0.015 else 0.006
        fun worn(stop: Oklch, shift: Double): Oklch {
            // The palette leads and the sky inflects it. Two earlier attempts were wrong in
            // opposite directions: taking the sky's hue outright turned Newsprint blue at midday,
            // and blending through OKLab cancelled Paper's chroma at night and flipped its hue to
            // a meaningless angle. Rotating the palette's own hue a bounded amount keeps the
            // chroma it was authored with, so a palette can never wash out or become another one.
            var swing = ((stop.h - base.h + 540.0) % 360.0) - 180.0
            swing = (swing * HUE_PULL).coerceIn(-MAX_HUE_SWING, MAX_HUE_SWING)
            return Oklch(
                l = (base.l + mood + shift).coerceIn(0.04, 0.99),
                // Allowed to breathe toward the sky's intensity, never below its own.
                c = (base.c * 0.75 + stop.c * 0.25).coerceIn(base.c * 0.6, 0.09),
                h = (base.h + swing + 360.0) % 360.0,
                alpha = 1.0,
            )
        }
        // A visible ramp without moving far enough to threaten the ink either stop sits under.
        return argb(worn(sky.top, -0.012)) to argb(worn(sky.bottom, 0.012))
    }

    /** sRGB back to oklch, the inverse of [argb]. */
    fun toOklch(argb: Int): Oklch {
        fun linear(channel: Int): Double {
            val v = channel / 255.0
            return if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        }
        val r = linear((argb shr 16) and 0xFF)
        val g = linear((argb shr 8) and 0xFF)
        val b = linear(argb and 0xFF)
        val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        val lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
        val a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        val bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        var hue = Math.toDegrees(atan2(bb, a))
        if (hue < 0) hue += 360.0
        return Oklch(lightness, hypot(a, bb), hue, ((argb ushr 24) and 0xFF) / 255.0)
    }

    /** OKLab lightness of an sRGB colour, so a contrast test can check a blended stop. */
    fun lightnessOf(argb: Int): Double {
        fun linear(channel: Int): Double {
            val v = channel / 255.0
            return if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        }
        val r = linear((argb shr 16) and 0xFF)
        val g = linear((argb shr 8) and 0xFF)
        val b = linear(argb and 0xFF)
        val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    }

    /**
     * The twelve palettes of `sky.css`, as authored. The light family sits at L >= 0.94 and the dark
     * family at L <= 0.34 so the matching text colour clears 4.5:1; keep any edit inside its band.
     */
    fun stops(phase: Phase, dark: Boolean): Stops = if (dark) when (phase) {
        Phase.DAY -> Stops(Oklch(0.40, 0.06, 246.0, 0.94), Oklch(0.345, 0.05, 252.0, 0.94))
        Phase.DAWN -> Stops(Oklch(0.37, 0.04, 252.0, 0.94), Oklch(0.37, 0.03, 40.0, 0.94))
        Phase.GOLDEN -> Stops(Oklch(0.38, 0.03, 62.0, 0.94), Oklch(0.35, 0.035, 20.0, 0.94))
        Phase.TWILIGHT -> Stops(Oklch(0.20, 0.045, 268.0, 0.95), Oklch(0.26, 0.06, 294.0, 0.95))
        Phase.DUSK -> Stops(Oklch(0.22, 0.05, 280.0, 0.95), Oklch(0.28, 0.068, 320.0, 0.95))
        Phase.NIGHT -> Stops(Oklch(0.15, 0.035, 266.0, 0.95), Oklch(0.20, 0.04, 260.0, 0.95))
    } else when (phase) {
        Phase.DAY -> Stops(Oklch(0.972, 0.02, 236.0, 0.9), Oklch(0.993, 0.006, 220.0, 0.9))
        Phase.DAWN -> Stops(Oklch(0.962, 0.024, 242.0, 0.9), Oklch(0.958, 0.034, 58.0, 0.9))
        Phase.GOLDEN -> Stops(Oklch(0.958, 0.038, 70.0, 0.9), Oklch(0.945, 0.036, 18.0, 0.9))
        Phase.TWILIGHT -> Stops(Oklch(0.27, 0.06, 270.0, 0.96), Oklch(0.33, 0.07, 296.0, 0.96))
        Phase.DUSK -> Stops(Oklch(0.29, 0.065, 282.0, 0.96), Oklch(0.34, 0.075, 322.0, 0.96))
        Phase.NIGHT -> Stops(Oklch(0.22, 0.05, 264.0, 0.96), Oklch(0.28, 0.055, 258.0, 0.96))
    }
}
