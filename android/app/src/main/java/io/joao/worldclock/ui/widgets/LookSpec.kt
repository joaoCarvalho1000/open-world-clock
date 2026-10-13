package io.joao.worldclock.ui.widgets

import androidx.annotation.StringRes
import io.joao.worldclock.R
import io.joao.worldclock.widget.CatalogLook
import io.joao.worldclock.widget.ClockFace
import io.joao.worldclock.widget.PremiumCatalog
import io.joao.worldclock.widget.ThemePalette
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.WidgetStyle

/**
 * Everything a preview needs to draw one look, and nothing about where it is stored.
 *
 * The catalog previews a look before anything is applied, and the supporter sheet previews
 * looks for a widget that does not exist yet, so previews are driven by this rather than by a
 * stored [WidgetConfig].
 */
data class LookSpec(
    val palette: ThemePalette?,
    val style: WidgetStyle = WidgetStyle.AUTO,
    val face: ClockFace = PremiumCatalog.freeFace,
) {
    val premium: Boolean get() = palette != null || face.premium
}

/** The look a widget currently wears. */
fun WidgetConfig.look(): LookSpec = LookSpec(theme, style, font)

/**
 * Applies a browsed look to a widget, keeping its cities untouched.
 *
 * A palette never overwrites [WidgetConfig.style]. The free style is the widget's fallback,
 * the thing it returns to when access lapses, so picking a premium look must leave it exactly
 * as the person set it. Only a free look, which *is* a style, writes that field.
 */
fun WidgetConfig.applyLook(spec: LookSpec): WidgetConfig = copy(
    style = if (spec.palette == null) spec.style else style,
    themeId = spec.palette?.id,
    faceId = spec.face.id,
)

/** A curated look as something previewable. Catalog entries name ids; previews need the data. */
fun CatalogLook.spec(): LookSpec =
    LookSpec(PremiumCatalog.theme(themeId), WidgetStyle.AUTO, PremiumCatalog.face(faceId))

/** The name of a free style, which is what a look without a palette is called. */
@StringRes
fun freeStyleLabel(style: WidgetStyle): Int = when (style) {
    WidgetStyle.AUTO -> R.string.wc_style_auto
    WidgetStyle.LIGHT -> R.string.wc_style_light
    WidgetStyle.DARK -> R.string.wc_style_dark
}
