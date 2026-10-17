package io.joao.worldclock.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.util.TypedValue
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.SpannableString
import android.text.Spanned
import android.text.format.DateFormat
import android.text.style.TypefaceSpan
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import io.joao.worldclock.MainActivity
import io.joao.worldclock.R
import io.joao.worldclock.core.AppTheme
import io.joao.worldclock.core.City
import io.joao.worldclock.core.ClockEngine
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.core.Sky
import io.joao.worldclock.core.Sun
import io.joao.worldclock.core.homeZoneId
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.billing.SupporterBilling
import io.joao.worldclock.data.SettingsRepository
import io.joao.worldclock.i18n.AppStrings
import io.joao.worldclock.ui.components.compactHour
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Builds RemoteViews for every widget kind. Clock digits are TextClock views bound to each city's
 * zone, so they tick on the launcher without alarms. Everything else here (daylight colors, the
 * date, offsets, overlap) is metadata written in the app language and refreshed on update
 * broadcasts and every 30 minutes.
 */
object WidgetRenderer {
    private val Rows = listOf(
        RowIds(R.id.row0, R.id.icon0, R.id.name0, R.id.meta0, R.id.time0, R.id.ampm0),
        RowIds(R.id.row1, R.id.icon1, R.id.name1, R.id.meta1, R.id.time1, R.id.ampm1),
        RowIds(R.id.row2, R.id.icon2, R.id.name2, R.id.meta2, R.id.time2, R.id.ampm2),
        RowIds(R.id.row3, R.id.icon3, R.id.name3, R.id.meta3, R.id.time3, R.id.ampm3),
    )
    private val MeetingRows = listOf(
        MeetingIds(R.id.mrow0, R.id.mdot0, R.id.mname0, R.id.mstatus0, R.id.mtime0),
        MeetingIds(R.id.mrow1, R.id.mdot1, R.id.mname1, R.id.mstatus1, R.id.mtime1),
        MeetingIds(R.id.mrow2, R.id.mdot2, R.id.mname2, R.id.mstatus2, R.id.mtime2),
        MeetingIds(R.id.mrow3, R.id.mdot3, R.id.mname3, R.id.mstatus3, R.id.mtime3),
    )

    /** One mark every three hours, each sitting at the left edge of its cell in the overlap bar. */
    private val Axis = listOf(R.id.axis0, R.id.axis1, R.id.axis2, R.id.axis3, R.id.axis4, R.id.axis5, R.id.axis6, R.id.axis7)

    private data class RowIds(val row: Int, val icon: Int, val name: Int, val meta: Int, val time: Int, val ampm: Int)
    private data class MeetingIds(val row: Int, val dot: Int, val name: Int, val status: Int, val time: Int)

    /**
     * Resolved colors. Every field is written on every update: a launcher reuses the views it
     * already has, so a color left unset would keep whatever the previous look painted.
     */
    private data class Palette(val bg: Int, val ink: Int?, val ink2: Int?, val accent: Int?, val marker: Int? = null)

    fun update(context: Context, manager: AppWidgetManager, kind: WidgetKind, id: Int) {
        val settings = SettingsRepository(context).settings.value
        val config = WidgetStore(context).load(id)
        val catalog = CityCatalog(context)
        val views = build(context, kind, id, config, settings, catalog, manager.getAppWidgetOptions(id))
        manager.updateAppWidget(id, views)
    }

    /**
     * [hasAccess] decides whether the Supporter theme and clock face stored for this widget are
     * drawn. Without it the widget renders its free look, and the stored look waits untouched.
     */
    fun build(
        context: Context,
        kind: WidgetKind,
        id: Int,
        config: WidgetConfig,
        settings: ClockSettings,
        catalog: CityCatalog,
        options: Bundle?,
        hasAccess: Boolean = SupporterBilling.hasAccess(context),
        now: Instant = Instant.now(),
    ): RemoteViews {
        val chosenCities = config.cities(kind, settings).map { it.zoneId }
        @Suppress("NAME_SHADOWING") val config = config.forAccess(hasAccess).let {
            if (kind.premium && !hasAccess) it.copy(zones = chosenCities) else it
        }
        @Suppress("NAME_SHADOWING") val kind = kind.forAccess(hasAccess)
        // Every word and date below is written in the app language, not the launcher's.
        val t = AppStrings(context, settings.language)
        fun sized(widthDp: Float, heightDp: Float) = when (kind) {
            WidgetKind.SINGLE -> single(context, t, id, config, settings, catalog, now, widthDp, heightDp)
            WidgetKind.WORLD -> world(context, t, id, config, settings, catalog, now, widthDp, heightDp)
            WidgetKind.MEETING -> meeting(context, t, id, config, settings, catalog, now, widthDp, heightDp)
            WidgetKind.DUO, WidgetKind.BOARD -> tiles(context, t, kind, id, config, settings, catalog, now, widthDp, heightDp)
            WidgetKind.WORKDAY -> workday(context, t, id, config, settings, catalog, now, widthDp, heightDp)
            else -> PremiumWidgetRenderer.build(context, t, kind, id, config, settings, catalog, now, widthDp, heightDp)
        }
        val sizes = if (Build.VERSION.SDK_INT >= 31) {
            @Suppress("DEPRECATION")
            options?.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
        } else null
        if (Build.VERSION.SDK_INT >= 31 && !sizes.isNullOrEmpty()) {
            return RemoteViews(sizes.distinct().take(4).associateWith { sized(it.width, it.height) })
        }
        val portrait = context.resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT
        val w = options?.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH else AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0) ?: 0
        val h = options?.getInt(if (portrait) AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
        val defaults = when (kind) { WidgetKind.SINGLE -> 150f to 150f; WidgetKind.WORLD -> 300f to 170f; WidgetKind.MEETING -> 300f to 250f; WidgetKind.DUO -> 300f to 170f; WidgetKind.BOARD -> 300f to 270f; WidgetKind.WORKDAY -> 300f to 190f; WidgetKind.DAYLIGHT, WidgetKind.NEXT -> 150f to 150f; WidgetKind.MAP, WidgetKind.WEEK -> 300f to 270f; WidgetKind.RULER -> 300f to 170f; WidgetKind.DATELINE -> 300f to 190f; WidgetKind.CHANGE -> 300f to 150f }
        return sized(if (w > 0) w.toFloat() else defaults.first, if (h > 0) h.toFloat() else defaults.second)
    }

    private fun palette(context: Context, config: WidgetConfig, autoDay: Boolean?): Palette {
        val theme = config.theme
        if (theme != null) {
            return Palette(R.drawable.widget_bg, theme.ink, theme.ink2, theme.accent, theme.marker)
        }
        return palette(context, config.style, autoDay)
    }

    private fun palette(context: Context, style: WidgetStyle, autoDay: Boolean?): Palette {
        fun c(res: Int) = context.getColor(res)
        val dark = when (style) {
            WidgetStyle.LIGHT -> false
            WidgetStyle.DARK -> true
            // No city sun to follow: the theme-following colors, resolved now rather than left
            // to whatever the view was painted with last time.
            WidgetStyle.AUTO -> autoDay?.not()
                ?: return Palette(R.drawable.widget_bg, c(R.color.widget_ink), c(R.color.widget_ink2), c(R.color.widget_accent), c(R.color.wc_sun))
        }
        return if (dark) {
            val bg = if (style == WidgetStyle.AUTO) R.drawable.widget_bg_night else R.drawable.widget_bg_dark
            Palette(bg, c(R.color.wc_night_ink), c(R.color.wc_night_ink2), c(R.color.wc_accent_night))
        } else {
            val bg = if (style == WidgetStyle.AUTO) R.drawable.widget_bg_day else R.drawable.widget_bg_light
            Palette(bg, c(R.color.wc_day_ink), c(R.color.wc_day_ink2), c(R.color.wc_accent))
        }
    }

    /**
     * The `autoDay` an AUTO surface asks for, read from the sky [skyFor] actually paints rather
     * than from the city's sun.
     *
     * [skyFor] builds the stops from the altitude *and* [darkTheme]; [palette] used to pick the ink
     * from [Sun.isDay] alone. The two disagree whenever the app theme and the city's daylight
     * disagree, and a dark themed card over a city at noon drew #1B2233 on #29445D, 1.57:1. One
     * answer now serves the text and the day icon's tint, so they cannot drift apart again.
     */
    private fun autoDayInk(context: Context, settings: ClockSettings, city: City, now: Instant): Boolean {
        val altitude = Sun.altitude(now, city.latitude, city.longitude)
        val rising = Sky.rising(now, city.latitude, city.longitude, altitude)
        return !Sky.inkIsLight(altitude, rising, darkTheme(context, settings))
    }

    /** Which variant of the sky stops to use: the app's own theme, not the city's sun. */
    internal fun darkTheme(context: Context, settings: ClockSettings): Boolean = when (settings.theme) {
        AppTheme.LIGHT -> false
        AppTheme.DARK -> true
        AppTheme.SYSTEM -> (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
    }

    /**
     * The surface follows a sun only when nothing else was chosen. A widget showing many cities
     * puts each city's daylight on its own row or tile, so its frame carries the home sky: the
     * question that frame answers is what time it is where you are.
     */
    private fun skyFor(context: Context, config: WidgetConfig, settings: ClockSettings, city: City, now: Instant): Pair<Int, Int>? {
        // LIGHT and DARK are a decision to hold still, so they do.
        if (config.style != WidgetStyle.AUTO) return null
        val altitude = Sun.altitude(now, city.latitude, city.longitude)
        val rising = Sky.rising(now, city.latitude, city.longitude, altitude)
        val dark = darkTheme(context, settings)
        val theme = config.theme ?: return Sky.gradient(altitude, rising, dark)
        // A paid palette used to return early here and never ask about the sun, which made the
        // Supporter Pack the one thing in the app that stopped following the signature it is
        // sold on. Now it wears the sky instead of replacing it.
        return Sky.dressed(theme.bg, Sky.phase(altitude, rising), dark)
    }

    /** The sun and moon stay literal in every theme; only their ink changes with the surface. */
    private fun dayIcon(config: WidgetConfig, isDay: Boolean): Int = when {
        config.theme == null -> if (isDay) R.drawable.ic_widget_sun else R.drawable.ic_widget_moon
        isDay -> R.drawable.ic_widget_sun_tint
        else -> R.drawable.ic_widget_moon_tint
    }

    /**
     * A paid palette still wins, because a chosen surface is the whole point of one. Otherwise an
     * AUTO widget gets the real sky, and LIGHT or DARK keep the flat style they asked for.
     */
    private fun RemoteViews.bindSurface(
        context: Context,
        config: WidgetConfig,
        fallback: Int,
        sky: Pair<Int, Int>?,
        widthDp: Float,
        heightDp: Float,
    ) {
        if (sky != null) {
            setInt(R.id.widget_root, "setBackgroundResource", 0)
            setViewVisibility(R.id.widget_bg_layer, View.VISIBLE)
            setImageViewBitmap(R.id.widget_bg_layer, SkySurface.bitmap(context, widthDp, heightDp, sky.first, sky.second))
            // The palette tint would repaint the whole ramp one colour.
            setInt(R.id.widget_bg_layer, "setColorFilter", 0)
            return
        }
        setInt(R.id.widget_root, "setBackgroundResource", if (config.theme != null) 0 else fallback)
        setViewVisibility(R.id.widget_bg_layer, if (config.theme != null) View.VISIBLE else View.GONE)
        setImageViewResource(R.id.widget_bg_layer, R.drawable.widget_bg_tint)
        setInt(R.id.widget_bg_layer, "setColorFilter", config.theme?.bg ?: android.graphics.Color.WHITE)
    }

    /**
     * [isDay] picks the glyph, which stays literal: a sun means the city is in daylight. [dayInk]
     * picks the tint, which belongs to the surface the glyph sits on, so a row on its own opaque
     * card keeps the default and an icon straight on the sky passes the sky's own answer.
     */
    private fun RemoteViews.bindDayIcon(context: Context, id: Int, config: WidgetConfig, isDay: Boolean, dayInk: Boolean = isDay) {
        setImageViewResource(id, dayIcon(config, isDay))
        setInt(id, "setColorFilter", config.theme?.let { if (isDay) it.accent else it.ink2 }
            ?: context.getColor(if (dayInk) R.color.wc_sun else R.color.wc_accent_night))
    }

    private fun RemoteViews.color(viewId: Int, color: Int?) { if (color != null) setTextColor(viewId, color) }

    /**
     * A chosen clock face travels as a span on the format itself. `DateFormat.format` keeps the
     * spans of a spanned format and `TextClock` hands the result straight to `setText`, so the
     * digits still tick on the launcher's own schedule, with no alarm and no second layout.
     * The family is a system one because that is what a span can name across processes.
     */
    private fun faced(pattern: String, font: ClockFace): CharSequence {
        val family = font.family ?: return pattern
        return SpannableString(pattern).apply {
            setSpan(TypefaceSpan(family), 0, length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
        }
    }

    private fun RemoteViews.bindClock(timeId: Int, ampmId: Int?, zone: String, use24: Boolean, font: ClockFace, withPeriodInline: Boolean = false) {
        val pattern = when {
            use24 -> "HH:mm"
            withPeriodInline -> "h:mm a"
            else -> "h:mm"
        }
        val faced = faced(pattern, font)
        setString(timeId, "setTimeZone", zone)
        setCharSequence(timeId, "setFormat12Hour", faced)
        setCharSequence(timeId, "setFormat24Hour", faced)
        if (ampmId != null) {
            setString(ampmId, "setTimeZone", zone)
            setCharSequence(ampmId, "setFormat12Hour", faced("a", font))
            setCharSequence(ampmId, "setFormat24Hour", faced("a", font))
            setViewVisibility(ampmId, if (use24) View.GONE else View.VISIBLE)
        }
    }

    private fun label(saved: SavedCity, catalog: CityCatalog, t: AppStrings) =
        saved.label.ifBlank { catalog.find(saved.zoneId, t.locale).name }

    fun convertIntent(context: Context, zone: String, requestCode: Int): PendingIntent =
        activityIntent(context, Uri.parse("worldclock://convert?zone=" + Uri.encode(zone)), requestCode)

    fun activityIntent(context: Context, uri: Uri, requestCode: Int): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, uri, context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun relative(saved: SavedCity, now: Instant, t: AppStrings, home: ZoneId): String {
        val zone = ZoneId.of(saved.zoneId)
        val minutes = (zone.rules.getOffset(now).totalSeconds - home.rules.getOffset(now).totalSeconds) / 60
        return ClockEngine.differenceLabel(minutes, t.locale)
    }

    private fun single(context: Context, t: AppStrings, id: Int, config: WidgetConfig, settings: ClockSettings, catalog: CityCatalog, now: Instant, widthDp: Float, heightDp: Float): RemoteViews {
        val saved = config.cities(WidgetKind.SINGLE, settings).first()
        val city = catalog.find(saved.zoneId, t.locale)
        val isDay = Sun.isDay(now, city.latitude, city.longitude)
        // The clock sits straight on the sky, so its ink comes from the sky, not from isDay.
        val dayInk = autoDayInk(context, settings, city, now)
        val p = palette(context, config, dayInk)
        val name = label(saved, catalog, t)
        val reading = ClockEngine.reading(city, saved, now, settings.use24Hour, locale = t.locale)
        val compact = heightDp < 110 || widthDp < 120

        return RemoteViews(context.packageName, R.layout.widget_single).apply {
            bindSurface(context, config, p.bg, skyFor(context, config, settings, city, now), widthDp, heightDp)
            val inset = if (widthDp < 120) (12 * context.resources.displayMetrics.density).toInt()
                else context.resources.getDimensionPixelSize(R.dimen.widget_padding)
            setViewPadding(R.id.single_body, inset, inset, inset, inset)
            setTextViewText(R.id.single_name, name)
            color(R.id.single_name, p.ink); color(R.id.single_time, p.ink); color(R.id.single_ampm, p.ink2)
            color(R.id.single_date, p.ink2); color(R.id.single_meta, p.ink2)
            bindDayIcon(context, R.id.single_icon, config, isDay, dayInk)
            setContentDescription(R.id.single_icon, t.get(if (isDay) R.string.widget_daytime else R.string.widget_night))
            bindClock(R.id.single_time, R.id.single_ampm, saved.zoneId, settings.use24Hour, config.font)
            // The separate period must leave enough room for a two-digit hour at large text.
            setTextViewTextSize(R.id.single_ampm, android.util.TypedValue.COMPLEX_UNIT_SP, if (widthDp < 120) 10f else 14f)
            // The date is metadata: TextClock would spell the weekday in the launcher's language.
            val datePattern = DateFormat.getBestDateTimePattern(t.locale, "EEEdMMM")
            setTextViewText(R.id.single_date, now.atZone(ZoneId.of(saved.zoneId)).format(DateTimeFormatter.ofPattern(datePattern, t.locale)))
            // XML autosizing fits live clock digits; setTextSize is ignored when autosize is on.
            val meta = listOf(
                relative(saved, now, t, settings.homeZoneId()),
                reading.phase.ifBlank { t.get(if (isDay) R.string.widget_daylight else R.string.widget_night) },
                if (reading.isWorking) t.get(R.string.work_status_working) else "",
            ).filter { it.isNotBlank() }.joinToString(" · ")
            setTextViewText(R.id.single_meta, meta)
            setViewVisibility(R.id.single_meta, if (compact) View.GONE else View.VISIBLE)
            setViewVisibility(R.id.single_date, if (heightDp < 90) View.GONE else View.VISIBLE)
            setOnClickPendingIntent(R.id.widget_root, convertIntent(context, saved.zoneId, id * 10))
        }
    }

    private fun world(context: Context, t: AppStrings, id: Int, config: WidgetConfig, settings: ClockSettings, catalog: CityCatalog, now: Instant, widthDp: Float, heightDp: Float): RemoteViews {
        val cities = config.cities(WidgetKind.WORLD, settings)
        // The city name column takes whatever the readout leaves, so when the readout grows the
        // name and the offset ellipsize to uselessness ("Mesmo h...", "4h a m..."). Width alone
        // does not predict it: the gallery renders at the declared 250dp minimum and still
        // truncated at 1.5x, because the pressure comes from the text size, not the box.
        val fontScale = context.resources.configuration.fontScale
        val tight = widthDp < 220 || fontScale > 1.3f
        val visible = worldVisibleRows(heightDp)
        val showMeta = worldShowsMeta(heightDp, minOf(visible, cities.size))
        // A Supporter theme is a chosen surface, so like LIGHT and DARK it holds through the day.
        val fixed = config.theme != null || config.style != WidgetStyle.AUTO
        val homeCity = catalog.find(settings.homeZoneId().id, t.locale)
        // The frame carries the home sky, so the frame's ink is read from that same sky.
        val base = palette(context, config, if (fixed) true else autoDayInk(context, settings, homeCity, now))
        val homeSky = skyFor(context, config, settings, homeCity, now)
        return RemoteViews(context.packageName, R.layout.widget_world).apply {
            bindSurface(context, config, base.bg, homeSky, widthDp, heightDp)
            Rows.forEachIndexed { i, ids ->
                val saved = cities.getOrNull(i)
                if (saved == null || i >= visible) { setViewVisibility(ids.row, View.GONE); return@forEachIndexed }
                setViewVisibility(ids.row, View.VISIBLE)
                val city = catalog.find(saved.zoneId, t.locale)
                val isDay = Sun.isDay(now, city.latitude, city.longitude)
                // In AUTO each row carries its own daylight, like the app's city cards.
                val rowPalette = if (fixed) base else palette(context, WidgetStyle.AUTO, isDay)
                val rowBg = when {
                    config.theme != null -> if (config.theme!!.dark) R.drawable.widget_row_lift else R.drawable.widget_row_dim
                    config.style != WidgetStyle.AUTO -> R.drawable.widget_row_plain
                    isDay -> R.drawable.widget_row_day
                    else -> R.drawable.widget_row_night
                }
                setInt(ids.row, "setBackgroundResource", rowBg)
                setTextViewText(ids.name, label(saved, catalog, t))
                setTextViewText(ids.meta, relative(saved, now, t, settings.homeZoneId()))
                setTextViewTextSize(ids.time, TypedValue.COMPLEX_UNIT_SP, if (tight) 18f else 22f)
                setTextViewTextSize(ids.ampm, TypedValue.COMPLEX_UNIT_SP, if (tight) 10f else 11f)
                setTextViewTextSize(ids.name, TypedValue.COMPLEX_UNIT_SP, if (tight) 13f else 14f)
                setTextViewTextSize(ids.meta, TypedValue.COMPLEX_UNIT_SP, if (tight) 10f else 11f)
                setViewVisibility(ids.meta, if (showMeta) View.VISIBLE else View.GONE)
                color(ids.name, rowPalette.ink); color(ids.time, rowPalette.ink)
                color(ids.meta, rowPalette.ink2); color(ids.ampm, rowPalette.ink2)
                bindDayIcon(context, ids.icon, config, isDay)
                setContentDescription(ids.icon, t.get(if (isDay) R.string.widget_daytime else R.string.widget_night))
                bindClock(ids.time, ids.ampm, saved.zoneId, settings.use24Hour, config.font)
                setOnClickPendingIntent(ids.row, convertIntent(context, saved.zoneId, id * 10 + i))
            }
        }
    }

    private fun meeting(context: Context, t: AppStrings, id: Int, config: WidgetConfig, settings: ClockSettings, catalog: CityCatalog, now: Instant, widthDp: Float, heightDp: Float): RemoteViews {
        val cities = config.cities(WidgetKind.MEETING, settings)
        val home = settings.homeZoneId()
        val today = now.atZone(home).toLocalDate()
        val slots = ClockEngine.plan(today, home.id, cities)
        val dayStart = today.atStartOfDay(home).toInstant()
        val dayEnd = today.plusDays(1).atStartOfDay(home).toInstant()
        val daySeconds = dayEnd.epochSecond - dayStart.epochSecond
        val best = slots.maxOfOrNull { it.workingCount } ?: 0
        val use24 = settings.use24Hour
        val fmt = DateTimeFormatter.ofPattern(if (use24) "HH:mm" else "h a", t.locale)
        val summary = if (best == 0) t.get(R.string.widget_meeting_none) else {
            val start = slots.indexOfFirst { it.workingCount == best }
            var end = start
            while (end + 1 < slots.size && slots[end + 1].workingCount == best) end++
            val from = slots[start].instant.atZone(home).format(fmt)
            val to = minOf(slots[end].instant.plusSeconds(3600), dayEnd).atZone(home).format(fmt)
            if (best == cities.size) t.get(R.string.widget_meeting_everyone, from, to)
            else t.get(R.string.widget_meeting_partial, best, cities.size, from, to)
        }
        val homeCity = catalog.find(home.id, t.locale)
        // Was null, which fell through to R.color.widget_ink: a colour resolved by the system's
        // night mode, not by the app theme the home sky behind it was built from.
        val p = palette(context, config, if (config.theme == null && config.style == WidgetStyle.AUTO)
            autoDayInk(context, settings, homeCity, now) else true)
        val accent = p.accent ?: context.getColor(R.color.widget_accent)
        val track = when {
            config.theme != null -> config.theme!!.track
            config.style == WidgetStyle.LIGHT -> 0x1F1B2233
            config.style == WidgetStyle.DARK -> 0x29F3F6FB
            else -> context.getColor(R.color.widget_track)
        }
        val nowIndex = slots.indexOfLast { !it.instant.isAfter(now) }
        val bar = overlapBitmap(slots.map { if (it.totalCount == 0) 0f else it.workingCount.toFloat() / it.totalCount }, nowIndex, accent, track,
            p.marker ?: context.getColor(R.color.wc_sun), p.ink2 ?: context.getColor(R.color.widget_ink2),
            config.theme?.markerRing, widthDp, daySeconds / 3600f)
        val visible = ((heightDp - 100) / 34).toInt().coerceIn(1, 4)
        val homeName = homeCity.name

        return RemoteViews(context.packageName, R.layout.widget_meeting).apply {
            bindSurface(context, config, p.bg, skyFor(context, config, settings, homeCity, now), widthDp, heightDp)
            setTextViewText(R.id.meet_title, t.get(R.string.widget_meeting_heading))
            setTextViewText(R.id.meet_summary, summary)
            color(R.id.meet_summary, p.ink); color(R.id.meet_title, p.accent)
            setImageViewBitmap(R.id.meet_bar, bar)
            setContentDescription(R.id.meet_bar, t.get(R.string.widget_meeting_bar_a11y, summary, homeName))
            // Eight evenly spaced elapsed-time marks also fit 23/25-hour civil days.
            val everyThirdHour = widthDp >= 220
            Axis.indices.forEach { i ->
                val at = dayStart.plusSeconds(daySeconds * i / Axis.size).atZone(home)
                val label = if (at.minute == 0) compactHour(at.hour, use24, t.locale)
                    else at.format(DateTimeFormatter.ofPattern(if (use24) "H:mm" else "h:mm a", t.locale))
                setTextViewText(Axis[i], label)
                color(Axis[i], p.ink2)
                setViewVisibility(Axis[i], if (everyThirdHour || i % 2 == 0) View.VISIBLE else View.GONE)
            }
            // The bar means nothing without its hours, so the marks stay until the widget cannot show them at all.
            setViewVisibility(R.id.meet_axis, if (heightDp < 100) View.GONE else View.VISIBLE)
            MeetingRows.forEachIndexed { i, ids ->
                val saved = cities.getOrNull(i)
                if (saved == null || i >= visible) { setViewVisibility(ids.row, View.GONE); return@forEachIndexed }
                setViewVisibility(ids.row, View.VISIBLE)
                val working = ClockEngine.isWorking(now, saved)
                setTextViewText(ids.name, label(saved, catalog, t))
                setTextViewText(ids.status, t.get(if (working) R.string.work_status_working else R.string.work_status_off))
                setImageViewResource(ids.dot, R.drawable.widget_dot_tint)
                setInt(ids.dot, "setColorFilter", config.theme?.let { if (working) it.accent else it.ink2 } ?: context.getColor(if (working) R.color.wc_accent else R.color.widget_track))
                color(ids.name, p.ink); color(ids.time, p.ink); color(ids.status, if (working) accent else p.ink2)
                bindClock(ids.time, null, saved.zoneId, use24, config.font, withPeriodInline = true)
                setOnClickPendingIntent(ids.row, convertIntent(context, saved.zoneId, id * 10 + i))
            }
            setOnClickPendingIntent(R.id.meet_header, activityIntent(context, Uri.parse("worldclock://planner"), id * 10 + 9))
        }
    }

    private data class TileIds(val root: Int, val name: Int, val time: Int, val date: Int, val meta: Int, val icon: Int)
    private val Tiles = listOf(
        TileIds(R.id.tile0, R.id.tile_name0, R.id.tile_time0, R.id.tile_date0, R.id.tile_meta0, R.id.tile_icon0),
        TileIds(R.id.tile1, R.id.tile_name1, R.id.tile_time1, R.id.tile_date1, R.id.tile_meta1, R.id.tile_icon1),
        TileIds(R.id.tile2, R.id.tile_name2, R.id.tile_time2, R.id.tile_date2, R.id.tile_meta2, R.id.tile_icon2),
        TileIds(R.id.tile3, R.id.tile_name3, R.id.tile_time3, R.id.tile_date3, R.id.tile_meta3, R.id.tile_icon3),
    )

    private fun tiles(context: Context, t: AppStrings, kind: WidgetKind, id: Int, config: WidgetConfig,
        settings: ClockSettings, catalog: CityCatalog, now: Instant, widthDp: Float, heightDp: Float): RemoteViews {
        val cities = config.cities(kind, settings)
        val home = ZoneId.of(cities.first().zoneId)
        val homeCity = catalog.find(home.id, t.locale)
        // Same null as the Meeting frame carried, and the same fix: the frame's ink is the frame's
        // own sky, which the tiles' opaque cards then sit on top of with their own pinned ink.
        val p = palette(context, config, autoDayInk(context, settings, homeCity, now))
        val dateFormat = DateTimeFormatter.ofPattern(if (widthDp < 340) "d MMM" else
            DateFormat.getBestDateTimePattern(t.locale, "EEEdMMM"), t.locale)
        return RemoteViews(context.packageName, if (kind == WidgetKind.DUO) R.layout.widget_duo else R.layout.widget_board).apply {
            bindSurface(context, config, p.bg, skyFor(context, config, settings, homeCity, now), widthDp, heightDp)
            Tiles.take(kind.maxCities).forEachIndexed { i, ids ->
                val saved = cities.getOrNull(i)
                setViewVisibility(ids.root, if (saved == null) View.INVISIBLE else View.VISIBLE)
                if (saved == null) return@forEachIndexed
                val city = catalog.find(saved.zoneId, t.locale)
                val local = now.atZone(ZoneId.of(saved.zoneId))
                val reading = ClockEngine.reading(city, saved, now, settings.use24Hour, home, t.locale)
                val rowPalette = if (config.theme == null && config.style == WidgetStyle.AUTO)
                    palette(context, WidgetStyle.AUTO, reading.isDay) else p
                val bg = if (config.theme != null) {
                    if (config.theme!!.dark) R.drawable.widget_row_lift else R.drawable.widget_row_dim
                } else if (config.style != WidgetStyle.AUTO) R.drawable.widget_row_plain
                else if (reading.isDay) R.drawable.widget_row_day else R.drawable.widget_row_night
                setInt(ids.root, "setBackgroundResource", bg)
                setTextViewText(ids.name, label(saved, catalog, t))
                bindClock(ids.time, null, saved.zoneId, settings.use24Hour, config.font, withPeriodInline = true)
                setTextViewText(ids.date, local.format(dateFormat))
                val difference = (local.offset.totalSeconds - now.atZone(home).offset.totalSeconds) / 60
                val fullDifference = ClockEngine.differenceLabel(difference, t.locale)
                val compactDifference = (if (difference < 0) "−" else if (difference > 0) "+" else "") +
                    "${kotlin.math.abs(difference) / 60}h" +
                    (if (difference % 60 != 0) " ${kotlin.math.abs(difference) % 60}m" else "")
                val meta = if (kind == WidgetKind.DUO) if (widthDp < 340) compactDifference else fullDifference
                    else t.get(if (reading.isWorking) R.string.work_status_working else R.string.work_status_off)
                // Tile 0 is the reference every other tile is measured against, so its own
                // difference is always zero and the compact form spells that "0h". Keep the slot
                // and lose the line: INVISIBLE, not GONE, so both footers stay the same height and
                // the pair keeps reading as a pair.
                val selfReference = kind == WidgetKind.DUO && i == 0
                setViewVisibility(ids.meta, if (selfReference) View.INVISIBLE else View.VISIBLE)
                setTextViewText(ids.meta, if (selfReference) "" else meta)
                if (kind == WidgetKind.DUO && !selfReference) setContentDescription(ids.meta, fullDifference)
                color(ids.name, rowPalette.ink); color(ids.time, rowPalette.ink)
                color(ids.date, rowPalette.ink2); color(ids.meta, rowPalette.ink2)
                bindDayIcon(context, ids.icon, config, reading.isDay)
                setContentDescription(ids.icon, t.get(if (reading.isDay) R.string.widget_daytime else R.string.widget_night))
                setOnClickPendingIntent(ids.root, convertIntent(context, saved.zoneId, id * 10 + i))
            }
        }
    }

    private fun workday(context: Context, t: AppStrings, id: Int, config: WidgetConfig,
        settings: ClockSettings, catalog: CityCatalog, now: Instant, widthDp: Float, heightDp: Float): RemoteViews {
        val saved = config.cities(WidgetKind.WORKDAY, settings).first()
        val zone = ZoneId.of(saved.zoneId)
        val city = catalog.find(saved.zoneId, t.locale)
        val p = palette(context, config, autoDayInk(context, settings, city, now))
        val working = ClockEngine.isWorking(now, saved)
        val next = WorkdaySchedule.nextTransition(saved, now)
        val timeline = WorkdaySchedule.timeline(saved, now)
        val nextFormat = DateTimeFormatter.ofPattern(if (settings.use24Hour) "EEE HH:mm" else "EEE h:mm a", t.locale)
        val dateFormat = DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(t.locale, "EEEdMMM"), t.locale)
        val accent = p.accent ?: context.getColor(R.color.widget_accent)
        val ink2 = p.ink2 ?: context.getColor(R.color.widget_ink2)
        val track = config.theme?.track ?: context.getColor(R.color.widget_track)
        return RemoteViews(context.packageName, R.layout.widget_workday).apply {
            bindSurface(context, config, p.bg, skyFor(context, config, settings, city, now), widthDp, heightDp)
            setTextViewText(R.id.wd_name, label(saved, catalog, t))
            bindClock(R.id.wd_time, null, saved.zoneId, settings.use24Hour, config.font, withPeriodInline = true)
            setTextViewText(R.id.wd_date, now.atZone(zone).format(dateFormat))
            setTextViewText(R.id.wd_status, t.get(if (working) R.string.work_status_working else R.string.work_status_off))
            setTextViewText(R.id.wd_next, if (next == null) t.get(R.string.widget_workday_no_schedule)
                else t.get(if (next.starts) R.string.widget_workday_starts else R.string.widget_workday_ends,
                    next.instant.atZone(zone).format(nextFormat)))
            color(R.id.wd_name, p.ink); color(R.id.wd_time, p.ink); color(R.id.wd_date, ink2)
            color(R.id.wd_status, if (working) accent else ink2); color(R.id.wd_next, ink2)
            val axis = listOf(R.id.wd_axis0, R.id.wd_axis1, R.id.wd_axis2, R.id.wd_axis3, R.id.wd_axis4)
            timeline.axis.forEachIndexed { i, at ->
                val local = at.atZone(zone)
                val label = if (i == 4 && settings.use24Hour) "24" else if (local.minute == 0)
                    compactHour(local.hour, settings.use24Hour, t.locale)
                else local.format(DateTimeFormatter.ofPattern(if (settings.use24Hour) "HH:mm" else "h:mm a", t.locale))
                setTextViewText(axis[i], label); color(axis[i], ink2)
            }
            // The bar is 18dp tall inside 16dp of side padding, so the bitmap takes that aspect
            // and the mark stays a circle at every width instead of only at one.
            val barWidth = 720f
            val barHeight = (barWidth * 18f / (widthDp - 32f).coerceAtLeast(80f)).coerceIn(18f, 160f)
            val bitmap = Bitmap.createBitmap(barWidth.toInt(), barHeight.toInt(), Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val cellWidth = barWidth / timeline.working.size
            timeline.working.forEachIndexed { i, active ->
                paint.color = if (active) accent else track
                canvas.drawRect(i * cellWidth, barHeight * 0.2f, (i + 1) * cellWidth, barHeight * 0.8f, paint)
            }
            val ring = barHeight * 0.45f
            val x = (timeline.nowFraction * barWidth).coerceIn(ring, barWidth - ring)
            paint.color = config.theme?.markerRing ?: context.getColor(R.color.widget_ink)
            canvas.drawCircle(x, barHeight / 2f, ring, paint)
            paint.color = config.theme?.marker ?: context.getColor(R.color.wc_sun)
            canvas.drawCircle(x, barHeight / 2f, ring * 0.66f, paint)
            setImageViewBitmap(R.id.wd_bar, bitmap)
            setContentDescription(R.id.wd_bar, t.get(R.string.widget_workday_timeline_a11y, label(saved, catalog, t)))
            setOnClickPendingIntent(R.id.widget_root, convertIntent(context, saved.zoneId, id * 10))
        }
    }

    /**
     * Hourly cells over the actual civil day, a sun dot for now, and eight equally spaced
     * ticks aligned with the elapsed-time labels underneath.
     */
    /**
     * [boxWidthDp] is the widget width less its 16dp side padding. The bitmap is stretched into a
     * 20dp tall bar with fitXY, so its height has to follow that box or the now mark, the app's
     * one recurring mark, is drawn as an ellipse. Every vertical constant below scales with it.
     */
    private fun overlapBitmap(values: List<Float>, nowIndex: Int, accent: Int, track: Int, sun: Int, tick: Int,
        markerRing: Int? = null, boxWidthDp: Float = 268f, dayHours: Float = 24f): Bitmap {
        val w = 480
        val h = (w * 20f / (boxWidthDp - 32f).coerceAtLeast(80f)).coerceIn(20f, 160f).toInt()
        val k = h / 40f
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val cell = w / dayHours
        values.forEachIndexed { i, v ->
            paint.color = if (v <= 0f) track else {
                val alpha = (255 * (0.3f + 0.7f * v)).toInt().coerceIn(0, 255)
                (accent and 0x00FFFFFF) or (alpha shl 24)
            }
            canvas.drawRoundRect(RectF(i * cell + 2, 2f * k, (i + 1) * cell - 2, h - 10f * k), 6f * k, 6f * k, paint)
        }
        paint.color = (tick and 0x00FFFFFF) or (0x80 shl 24)
        for (i in 0 until 8) {
            val x = i * w / 8f
            canvas.drawRect(RectF(x + 2, h - 7f * k, x + 3.5f, h - 1f * k), paint)
        }
        if (nowIndex in values.indices) {
            val centre = (h - 8f * k) / 2f
            if (markerRing != null) {
                paint.color = markerRing
                canvas.drawCircle(nowIndex * cell + cell / 2, centre, 8f * k, paint)
            }
            paint.color = sun
            canvas.drawCircle(nowIndex * cell + cell / 2, centre, 6f * k, paint)
        }
        return bmp
    }
}

/**
 * World widget row rules, shared with the in-app preview. Rows need 32dp (name plus time),
 * so a default 4x2 (about 170dp) keeps all four cities; the offset line appears only when
 * each row has 46dp or more. Cities are dropped only below about 150dp.
 */
fun worldVisibleRows(heightDp: Float): Int = ((heightDp - 16 + 2) / 34).toInt().coerceIn(1, 4)
// The seams between rows are part of the stack, so the usable height per row is what is left
// after them. Dividing the full height was over-promising the offset line at the threshold.
fun worldShowsMeta(heightDp: Float, rows: Int): Boolean =
    rows > 0 && (heightDp - 16 - 2 * (rows - 1)) / rows >= 46
