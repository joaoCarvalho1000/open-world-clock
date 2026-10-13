package io.joao.worldclock.ui.widgets

import android.appwidget.AppWidgetManager
import android.os.Bundle
import android.widget.FrameLayout
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.widget.WidgetConfig
import io.joao.worldclock.widget.WidgetKind
import io.joao.worldclock.widget.WidgetRenderer

/**
 * The size to preview a kind at: the minimum its own provider declares.
 *
 * Read from the installed provider rather than written here, because the declared minimum is
 * the single source of truth and it moves. A hardcoded table drifted below the real minima the
 * moment those were raised, and the gallery clipped while the launcher tests passed, which is
 * the worst way round: the surface a person actually browses was lying about the one thing
 * these previews exist to show.
 *
 * The minimum is also the right size to show. It is the hardest case the widget has to
 * survive, so a preview at that size is the preview that can still be wrong, and anything
 * larger only ever looks better.
 */
@Composable
private fun minimumSize(kind: WidgetKind): Pair<Dp, Dp> {
    val context = LocalContext.current
    return remember(kind) {
        val info = AppWidgetManager.getInstance(context).installedProviders
            .firstOrNull { it.provider.className == kind.providerClass.name }
        val density = context.resources.displayMetrics.density
        // minWidth and minHeight on the provider info are pixels, not dp.
        if (info == null || info.minWidth <= 0 || info.minHeight <= 0) 240.dp to 170.dp
        else (info.minWidth / density).dp to (info.minHeight / density).dp
    }
}

/**
 * The widget itself, inflated from the very RemoteViews the launcher is sent.
 *
 * There used to be a Compose re-drawing of each widget beside this. It was faithful, but it
 * was a second implementation that could drift, and at ten premium kinds it would have become
 * ten more. Every preview in the app now comes through here, so what the gallery, the catalog
 * and the configure screen show is what the launcher will draw, by construction.
 */
@Composable
fun NativeWidgetPreview(
    kind: WidgetKind,
    config: WidgetConfig,
    settings: ClockSettings,
    catalog: CityCatalog,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val locale = LocalStrings.current.locale
    val (width, height) = minimumSize(kind)

    // A preview always draws the look being considered, with or without access: trying one is
    // how you decide whether it is worth anything, and nothing is stored until Apply.
    val views = remember(kind, config, settings, locale, width, height) {
        WidgetRenderer.build(
            context, kind, PreviewWidgetId, config, settings, catalog,
            sizeOptions(width.value.toInt(), height.value.toInt()), hasAccess = true,
        )
    }

    AndroidView(
        modifier = modifier.size(width, height),
        factory = { FrameLayout(it) },
        update = { frame ->
            // Re-inflating on every tick would throw the real clocks away each second, so the
            // host only rebuilds when the look it was given actually changed.
            if (frame.tag !== views) {
                frame.removeAllViews()
                frame.addView(views.apply(frame.context, frame))
                frame.tag = views
            }
        },
    )
}

/**
 * No widget is placed, so there is no id and no launcher to ask for a size. Both bounds are
 * written so the renderer reads the same size whichever orientation it checks.
 */
private fun sizeOptions(widthDp: Int, heightDp: Int) = Bundle().apply {
    putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, widthDp)
    putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, widthDp)
    putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, heightDp)
    putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, heightDp)
}

/** Not a placed widget. Only reaches PendingIntent request codes, which a preview never fires. */
private const val PreviewWidgetId = 0
