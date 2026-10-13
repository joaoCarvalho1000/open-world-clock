package io.joao.worldclock.widget

import androidx.annotation.StringRes
import io.joao.worldclock.R

/**
 * The Supporter catalog: every palette, clock face and curated look the app sells today.
 *
 * This file is content, not mechanism. It holds no behaviour, so the renderer, the in app
 * previews and the catalog screen all read one list and cannot drift apart, and adding a look
 * later is a line here rather than a change in three places.
 *
 * Palettes are plain ARGB values rather than colour resources because a theme is a fixed
 * surface by definition: it must not change with the device's light or dark setting, which is
 * exactly what a resource qualifier would invite. Every value below was measured against its
 * own background before it shipped: ink at 7:1 or better, ink2 and accent at 4.5:1 or better.
 */

/** Which shelf a palette sits on in the catalog. The only filter the browser offers. */
enum class ThemeGroup(@StringRes val labelRes: Int) {
    LIGHT(R.string.wc_group_light),
    DARK(R.string.wc_group_dark),
    VIVID(R.string.wc_group_vivid),
}

/**
 * One fixed widget surface. [row] is the pill behind a world widget row and [track] an empty
 * cell of the overlap bar. Both are the surface itself darkened on a light palette or
 * lightened on a dark one, rather than a hand picked grey that only suits one background.
 * Because they are plain black or white at a fixed alpha, the two shared row drawables the
 * renderer picks by [dark] carry exactly these values, so a preview cannot drift from a
 * placed widget.
 */
data class ThemePalette(
    val id: String,
    @StringRes val labelRes: Int,
    val group: ThemeGroup,
    val bg: Int,
    val ink: Int,
    val ink2: Int,
    val accent: Int,
    val track: Int,
    val row: Int,
) {
    val dark: Boolean get() = group != ThemeGroup.LIGHT

    /**
     * The "now" dot on the overlap bar is drawn twice: [marker] over [markerRing].
     * One colour cannot stay visible on both an empty cell and a full accent cell, because
     * those sit at opposite ends of the bar's own range. A dot with a ring in the opposing
     * tone reads on every cell of every palette, worst case 4.88:1.
     */
    val marker: Int get() = ink
    val markerRing: Int get() = bg
}

/**
 * A clock face for the widget digits. [family] is a system font family name, which is what a
 * RemoteViews span can carry into the launcher process; null keeps each layout's own face.
 *
 * [widthScale] trims the big 2x2 readout for faces that run wider than the system one, and
 * lets the condensed face grow, so the whole time stays on one line at the minimum size.
 */
data class ClockFace(
    val id: String,
    @StringRes val labelRes: Int,
    val family: String?,
    val widthScale: Float,
    val premium: Boolean,
)

/** A ready to apply combination of a palette and a face, under one name. */
data class CatalogLook(
    val id: String,
    @StringRes val labelRes: Int,
    val themeId: String,
    val faceId: String,
)

object PremiumCatalog {
    val themes: List<ThemePalette> = listOf(
        ThemePalette("paper", R.string.wc_theme_paper, ThemeGroup.LIGHT,
            bg = 0xFFF4ECDD.toInt(), ink = 0xFF27211A.toInt(), ink2 = 0xFF695C4E.toInt(),
            accent = 0xFF8F4C1C.toInt(), track = 0x1F000000.toInt(), row = 0x0F000000.toInt()),
        ThemePalette("linen", R.string.wc_theme_linen, ThemeGroup.LIGHT,
            bg = 0xFFECE7DF.toInt(), ink = 0xFF2A2723.toInt(), ink2 = 0xFF5F5A54.toInt(),
            accent = 0xFF3F5464.toInt(), track = 0x1F000000.toInt(), row = 0x0F000000.toInt()),
        ThemePalette("daybreak", R.string.wc_theme_daybreak, ThemeGroup.LIGHT,
            bg = 0xFFFFF0E2.toInt(), ink = 0xFF2E2018.toInt(), ink2 = 0xFF6B5446.toInt(),
            accent = 0xFFA8431F.toInt(), track = 0x1F000000.toInt(), row = 0x0F000000.toInt()),
        ThemePalette("mist", R.string.wc_theme_mist, ThemeGroup.LIGHT,
            bg = 0xFFE7EDF3.toInt(), ink = 0xFF1D242C.toInt(), ink2 = 0xFF56626E.toInt(),
            accent = 0xFF1F5493.toInt(), track = 0x1F000000.toInt(), row = 0x0F000000.toInt()),
        ThemePalette("sage", R.string.wc_theme_sage, ThemeGroup.LIGHT,
            bg = 0xFFE5EDE4.toInt(), ink = 0xFF1F2A1E.toInt(), ink2 = 0xFF525D53.toInt(),
            accent = 0xFF36633D.toInt(), track = 0x1F000000.toInt(), row = 0x0F000000.toInt()),
        ThemePalette("blossom", R.string.wc_theme_blossom, ThemeGroup.LIGHT,
            bg = 0xFFF7E8EE.toInt(), ink = 0xFF2B1E24.toInt(), ink2 = 0xFF6A535E.toInt(),
            accent = 0xFF93355C.toInt(), track = 0x1F000000.toInt(), row = 0x0F000000.toInt()),
        ThemePalette("chalk", R.string.wc_theme_chalk, ThemeGroup.LIGHT,
            bg = 0xFFF6F6F4.toInt(), ink = 0xFF17181A.toInt(), ink2 = 0xFF56585C.toInt(),
            accent = 0xFF0B5CAD.toInt(), track = 0x1F000000.toInt(), row = 0x0F000000.toInt()),
        ThemePalette("ink", R.string.wc_theme_ink, ThemeGroup.DARK,
            bg = 0xFF15161A.toInt(), ink = 0xFFF6F6F4.toInt(), ink2 = 0xFFAFAFB4.toInt(),
            accent = 0xFFE0A64F.toInt(), track = 0x24FFFFFF.toInt(), row = 0x14FFFFFF.toInt()),
        ThemePalette("forest", R.string.wc_theme_forest, ThemeGroup.DARK,
            bg = 0xFF12271F.toInt(), ink = 0xFFECF3ED.toInt(), ink2 = 0xFFA8C2B0.toInt(),
            accent = 0xFF79D7A4.toInt(), track = 0x24FFFFFF.toInt(), row = 0x14FFFFFF.toInt()),
        ThemePalette("midnight", R.string.wc_theme_midnight, ThemeGroup.DARK,
            bg = 0xFF101A2E.toInt(), ink = 0xFFE9EEF7.toInt(), ink2 = 0xFFA3B2C9.toInt(),
            accent = 0xFF7FB2F0.toInt(), track = 0x24FFFFFF.toInt(), row = 0x14FFFFFF.toInt()),
        ThemePalette("espresso", R.string.wc_theme_espresso, ThemeGroup.DARK,
            bg = 0xFF241B13.toInt(), ink = 0xFFF3EAE0.toInt(), ink2 = 0xFFC0AC99.toInt(),
            accent = 0xFFE0A96D.toInt(), track = 0x24FFFFFF.toInt(), row = 0x14FFFFFF.toInt()),
        ThemePalette("plum", R.string.wc_theme_plum, ThemeGroup.DARK,
            bg = 0xFF1E1426.toInt(), ink = 0xFFF0E9F4.toInt(), ink2 = 0xFFBFACC9.toInt(),
            accent = 0xFFD08BE0.toInt(), track = 0x24FFFFFF.toInt(), row = 0x14FFFFFF.toInt()),
        ThemePalette("slate", R.string.wc_theme_slate, ThemeGroup.DARK,
            bg = 0xFF1B1F24.toInt(), ink = 0xFFEDF0F3.toInt(), ink2 = 0xFFA8B2BC.toInt(),
            accent = 0xFF6FD3E0.toInt(), track = 0x24FFFFFF.toInt(), row = 0x14FFFFFF.toInt()),
        ThemePalette("ember", R.string.wc_theme_ember, ThemeGroup.DARK,
            bg = 0xFF241212.toInt(), ink = 0xFFF6E9E6.toInt(), ink2 = 0xFFC9A9A3.toInt(),
            accent = 0xFFF0855C.toInt(), track = 0x24FFFFFF.toInt(), row = 0x14FFFFFF.toInt()),
        ThemePalette("cobalt", R.string.wc_theme_cobalt, ThemeGroup.VIVID,
            bg = 0xFF173A8A.toInt(), ink = 0xFFFFFFFF.toInt(), ink2 = 0xFFC3D4F5.toInt(),
            accent = 0xFFFFD24A.toInt(), track = 0x24FFFFFF.toInt(), row = 0x14FFFFFF.toInt()),
        ThemePalette("rust", R.string.wc_theme_rust, ThemeGroup.VIVID,
            bg = 0xFF6B2E18.toInt(), ink = 0xFFFDF0E8.toInt(), ink2 = 0xFFE0B9A4.toInt(),
            accent = 0xFFFFC46B.toInt(), track = 0x24FFFFFF.toInt(), row = 0x14FFFFFF.toInt()),
    )

    val faces: List<ClockFace> = listOf(
        ClockFace("system", R.string.wc_font_system, null, 1f, false),
        ClockFace("light", R.string.wc_font_light, "sans-serif-light", 1f, true),
        ClockFace("medium", R.string.wc_font_medium, "sans-serif-medium", 0.98f, true),
        ClockFace("black", R.string.wc_font_black, "sans-serif-black", 0.94f, true),
        ClockFace("condensed", R.string.wc_font_condensed, "sans-serif-condensed", 1.05f, true),
        ClockFace("serif", R.string.wc_font_serif, "serif", 0.96f, true),
        ClockFace("mono", R.string.wc_font_mono, "monospace", 0.88f, true),
    )

    /** Curated looks, in the order the catalog shows them. */
    val looks: List<CatalogLook> = listOf(
        CatalogLook("newsprint", R.string.wc_look_newsprint, "paper", "serif"),
        CatalogLook("paper", R.string.wc_theme_paper, "paper", "system"),
        CatalogLook("linen", R.string.wc_theme_linen, "linen", "light"),
        CatalogLook("daybreak", R.string.wc_theme_daybreak, "daybreak", "system"),
        CatalogLook("awning", R.string.wc_look_awning, "daybreak", "condensed"),
        CatalogLook("mist", R.string.wc_theme_mist, "mist", "system"),
        CatalogLook("station", R.string.wc_look_station, "mist", "mono"),
        CatalogLook("sage", R.string.wc_theme_sage, "sage", "system"),
        CatalogLook("blossom", R.string.wc_theme_blossom, "blossom", "serif"),
        CatalogLook("chalk", R.string.wc_theme_chalk, "chalk", "light"),
        CatalogLook("receipt", R.string.wc_look_receipt, "chalk", "mono"),
        CatalogLook("headline", R.string.wc_look_headline, "chalk", "black"),
        CatalogLook("ink", R.string.wc_theme_ink, "ink", "system"),
        CatalogLook("almanac", R.string.wc_look_almanac, "ink", "serif"),
        CatalogLook("forest", R.string.wc_theme_forest, "forest", "system"),
        CatalogLook("canopy", R.string.wc_look_canopy, "forest", "condensed"),
        CatalogLook("midnight", R.string.wc_theme_midnight, "midnight", "light"),
        CatalogLook("terminal", R.string.wc_look_terminal, "midnight", "mono"),
        CatalogLook("espresso", R.string.wc_theme_espresso, "espresso", "serif"),
        CatalogLook("plum", R.string.wc_theme_plum, "plum", "light"),
        CatalogLook("slate", R.string.wc_theme_slate, "slate", "mono"),
        CatalogLook("ember", R.string.wc_theme_ember, "ember", "black"),
        CatalogLook("cobalt", R.string.wc_theme_cobalt, "cobalt", "black"),
        CatalogLook("rust", R.string.wc_theme_rust, "rust", "condensed"),
    )

    val freeFace: ClockFace = faces.first { !it.premium }

    fun theme(id: String?): ThemePalette? = id?.let { key -> themes.firstOrNull { it.id == key } }

    fun face(id: String?): ClockFace = id?.let { key -> faces.firstOrNull { it.id == key } } ?: freeFace

    fun look(id: String?): CatalogLook? = id?.let { key -> looks.firstOrNull { it.id == key } }

    /** The look matching a palette and face exactly, which is how the browser marks one applied. */
    fun lookFor(themeId: String?, faceId: String?): CatalogLook? =
        looks.firstOrNull { it.themeId == themeId && it.faceId == face(faceId).id }

    fun themes(group: ThemeGroup): List<ThemePalette> = themes.filter { it.group == group }

    fun looks(group: ThemeGroup): List<CatalogLook> = looks.filter { theme(it.themeId)?.group == group }
}
