package io.joao.worldclock.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Build
import android.util.TypedValue
import android.net.Uri
import android.text.SpannableString
import android.text.Spanned
import android.text.style.TypefaceSpan
import android.view.View
import android.widget.RemoteViews
import androidx.core.graphics.PathParser
import io.joao.worldclock.R
import io.joao.worldclock.core.ClockEngine
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.core.SavedCity
import io.joao.worldclock.core.Sky
import io.joao.worldclock.core.Sun
import io.joao.worldclock.core.homeZoneId
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.i18n.AppStrings
import io.joao.worldclock.ui.components.compactHour
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/** Data-rich premium compositions. Only TextClock is used for live clock digits. */
internal object PremiumWidgetRenderer {
    private val names = listOf(R.id.px_name0, R.id.px_name1, R.id.px_name2, R.id.px_name3, R.id.px_name4, R.id.px_name5, R.id.px_name6)
    private val times = listOf(R.id.px_time0, R.id.px_time1, R.id.px_time2)
    private val metas = listOf(R.id.px_meta0, R.id.px_meta1, R.id.px_meta2)
    private val rows = listOf(R.id.px_row0, R.id.px_row1, R.id.px_row2)
    private val axes = listOf(R.id.px_axis0, R.id.px_axis1, R.id.px_axis2, R.id.px_axis3, R.id.px_axis4)
    private data class Colors(val bg: Int, val ink: Int, val secondary: Int, val accent: Int, val track: Int)

    /**
     * Pins the graphic's box, so a bitmap can be generated at exactly the aspect it will be
     * stretched into. Below API 31 this is a no op and the layout's own declared size stands; the
     * two are kept in step, so the aspect is known by construction on every version. Guessing at
     * the box is what drew the world twice too tall and the now mark as an ellipse.
     */
    private fun RemoteViews.sizeGraphic(widthDp: Float, heightDp: Float, viewId: Int = R.id.px_image) {
        if (Build.VERSION.SDK_INT >= 31) {
            setViewLayoutWidth(viewId, widthDp, TypedValue.COMPLEX_UNIT_DIP)
            setViewLayoutHeight(viewId, heightDp, TypedValue.COMPLEX_UNIT_DIP)
        }
    }

    /** Pixel dimensions at the box's aspect, wide enough to stay crisp and small enough to stay cheap. */
    private fun graphicPixels(boxWidthDp: Float, boxHeightDp: Float, pixelWidth: Int = 480): Pair<Int, Int> =
        pixelWidth to (pixelWidth * boxHeightDp / boxWidthDp.coerceAtLeast(1f)).toInt().coerceIn(24, 900)

    /**
     * [widthDp] and [heightDp] are the widget's own box. Every bitmap below is stretched into its
     * view with fitXY, so a bitmap whose aspect does not match its box is distorted: the now mark,
     * a circle, came out an ellipse on every size but one. The size used to be dropped at the call
     * site, which is why the constants were fixed guesses.
     */
    fun build(context: Context, t: AppStrings, kind: WidgetKind, id: Int, config: WidgetConfig,
        settings: ClockSettings, catalog: CityCatalog, now: Instant,
        widthDp: Float = 300f, heightDp: Float = 190f): RemoteViews {
        val cities = config.cities(kind, settings)
        val first = cities.first()
        // Clock change is about whichever city changes its clocks next, so its surface, its click
        // target and its words have to name the same city. Every other kind leads with the first
        // in the list. Without this a card about Lisbon could render in Tokyo's night.
        val subject = if (kind == WidgetKind.CHANGE)
            PremiumWidgetData.nextClockChange(cities, now)?.city ?: first else first
        val zone = ZoneId.of(subject.zoneId)
        val city = catalog.find(subject.zoneId, t.locale)
        val dark = when (config.style) {
            WidgetStyle.DARK -> true
            WidgetStyle.LIGHT -> false
            WidgetStyle.AUTO -> !Sun.isDay(now, city.latitude, city.longitude)
        }
        val p = config.theme?.let { Colors(it.bg, it.ink, it.ink2, it.accent, it.track) }
            ?: if (dark) Colors(0xFF151E33.toInt(), context.getColor(R.color.wc_night_ink),
                context.getColor(R.color.wc_night_ink2), context.getColor(R.color.wc_accent_night), 0x29FFFFFF)
            else Colors(0xFFF7F9FC.toInt(), context.getColor(R.color.wc_day_ink),
                context.getColor(R.color.wc_day_ink2), context.getColor(R.color.wc_accent), 0x1F000000)
        val layout = when (kind) {
            WidgetKind.DAYLIGHT -> R.layout.widget_daylight
            WidgetKind.MAP -> R.layout.widget_map
            WidgetKind.WEEK -> R.layout.widget_week
            WidgetKind.NEXT -> R.layout.widget_next
            WidgetKind.RULER -> R.layout.widget_ruler
            WidgetKind.DATELINE -> R.layout.widget_dateline
            WidgetKind.CHANGE -> R.layout.widget_change
            else -> error("Unsupported premium composition $kind")
        }
        // The chrome around every graphic is set in sp, so the room left for the graphic shrinks
        // as text grows. Sizing the box in dp alone squeezed the Sun arc's labels at 1.5x.
        val fontScale = context.resources.configuration.fontScale
        val timeFormat = DateTimeFormatter.ofPattern(if (settings.use24Hour) "HH:mm" else "h:mm a", t.locale)
        val dateFormat = DateTimeFormatter.ofPattern("EEE d MMM", t.locale)
        val datedTime = DateTimeFormatter.ofPattern(if (settings.use24Hour) "EEE d MMM HH:mm" else "EEE d MMM h:mm a", t.locale)
        fun label(saved: SavedCity) = saved.label.ifBlank { catalog.find(saved.zoneId, t.locale).name }
        fun local(at: Instant) = at.atZone(zone)
        fun range(window: WorkingWindow): String = local(window.start).format(timeFormat) + " – " +
            local(window.end).format(if (local(window.start).toLocalDate() == local(window.end).toLocalDate()) timeFormat else datedTime)
        return RemoteViews(context.packageName, layout).apply {
            setInt(R.id.widget_root, "setBackgroundResource", 0)
            setViewVisibility(R.id.widget_bg_layer, View.VISIBLE)
            // A chosen palette, or a fixed LIGHT or DARK style, is a decision to hold still.
            // Otherwise the paid kinds get the same six phase sky the free ones do, keyed to the
            // city their own readings are already written in.
            val sky = if (config.style != WidgetStyle.AUTO) null else {
                val altitude = Sun.altitude(now, city.latitude, city.longitude)
                val rising = Sky.rising(now, city.latitude, city.longitude, altitude)
                val appDark = WidgetRenderer.darkTheme(context, settings)
                config.theme?.let { Sky.dressed(it.bg, Sky.phase(altitude, rising), appDark) }
                    ?: Sky.gradient(altitude, rising, appDark)
            }
            if (sky != null) {
                setImageViewBitmap(R.id.widget_bg_layer, SkySurface.bitmap(context, widthDp, heightDp, sky.first, sky.second))
                // The palette tint would repaint the whole ramp one colour.
                setInt(R.id.widget_bg_layer, "setColorFilter", 0)
            } else {
                setImageViewResource(R.id.widget_bg_layer, R.drawable.widget_bg_tint)
                setInt(R.id.widget_bg_layer, "setColorFilter", p.bg)
            }
            fun text(view: Int, value: CharSequence, color: Int = p.ink) {
                setTextViewText(view, value); setTextColor(view, color)
            }
            fun image(bitmap: Bitmap, description: String) {
                setImageViewBitmap(R.id.px_image, bitmap)
                setContentDescription(R.id.px_image, description)
            }
            fun clock(view: Int, timeZone: String) {
                val pattern = if (settings.use24Hour) "HH:mm" else "h:mm a"
                val format = config.font.family?.let { family -> SpannableString(pattern).apply {
                    setSpan(TypefaceSpan(family), 0, length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
                } } ?: pattern
                setString(view, "setTimeZone", timeZone)
                setCharSequence(view, "setFormat12Hour", format); setCharSequence(view, "setFormat24Hour", format)
                setTextColor(view, p.ink)
            }
            val planner = kind in listOf(WidgetKind.WEEK, WidgetKind.NEXT, WidgetKind.RULER)
            setOnClickPendingIntent(R.id.widget_root, if (kind == WidgetKind.MAP)
                WidgetRenderer.activityIntent(context, Uri.parse("worldclock://map"), id * 10)
            else if (planner)
                WidgetRenderer.activityIntent(context, Uri.parse("worldclock://planner"), id * 10)
            else WidgetRenderer.convertIntent(context, first.zoneId, id * 10))
            when (kind) {
                WidgetKind.DAYLIGHT -> {
                    text(R.id.px_title, label(first), p.secondary)
                    clock(R.id.px_clock, first.zoneId)
                    val solar = PremiumWidgetData.solar(local(now).toLocalDate(), zone, city.latitude, city.longitude)
                    val summary = when {
                        solar.alwaysDay -> t.get(R.string.widget_solar_polar_day)
                        solar.alwaysNight -> t.get(R.string.widget_solar_polar_night)
                        else -> listOf(solar.rise?.let { t.get(R.string.widget_solar_rise, local(it).format(timeFormat)) }
                            ?: t.get(R.string.widget_solar_no_rise),
                            solar.set?.let { t.get(R.string.widget_solar_set, local(it).format(timeFormat)) }
                                ?: t.get(R.string.widget_solar_no_set)).joinToString("\n")
                    }
                    val polar = solar.alwaysDay || solar.alwaysNight
                    setViewVisibility(R.id.px_detail, if (polar) View.GONE else View.VISIBLE)
                    text(R.id.px_summary, if (polar) summary else solar.rise?.let { "↑ " + local(it).format(timeFormat) } ?: "↑ —")
                    setContentDescription(R.id.px_summary, summary)
                    text(R.id.px_detail, if (polar) "" else solar.set?.let { "↓ " + local(it).format(timeFormat) } ?: "↓ —", p.secondary)
                    // 12dp of padding either side; the arc takes a fixed share of the height so a
                    // taller widget gets a bigger graphic rather than a stretched one.
                    val arcWidth = widthDp - 24f
                    val arcHeight = (heightDp * 0.46f / fontScale).coerceIn(40f, 180f)
                    sizeGraphic(arcWidth, arcHeight)
                    val (arcPxW, arcPxH) = graphicPixels(arcWidth, arcHeight)
                    image(solarBitmap(solar, now, p, arcPxW, arcPxH), summary + ". " + t.get(R.string.widget_sampled))
                }
                WidgetKind.MAP -> {
                    image(mapBitmap(context, catalog, cities, now, p), cities.joinToString { label(it) } + ". " + t.get(R.string.widget_sampled))
                    repeat(3) { i ->
                        val saved = cities.getOrNull(i)
                        setViewVisibility(names[i], if (saved == null) View.GONE else View.VISIBLE)
                        setViewVisibility(times[i], if (saved == null) View.GONE else View.VISIBLE)
                        if (saved != null) { text(names[i], label(saved), p.secondary); clock(times[i], saved.zoneId)
                            setOnClickPendingIntent(times[i], WidgetRenderer.convertIntent(context, saved.zoneId, id * 10 + i + 1)) }
                    }
                }
                WidgetKind.NEXT -> {
                    val window = PremiumWidgetData.nextWindow(cities, now)
                    text(R.id.px_title, t.get(R.string.widget_next_label), p.secondary)
                    val answer = when {
                        window == null -> t.get(R.string.widget_window_none)
                        window.start == now -> t.get(R.string.widget_window_now)
                        else -> local(window.start).format(datedTime)
                    }
                    text(R.id.px_summary, answer)
                    // Answer first means the answer takes the room when there is room to take.
                    setTextViewTextSize(R.id.px_summary, TypedValue.COMPLEX_UNIT_SP,
                        if (heightDp >= 170f && widthDp >= 280f &&
                            context.resources.configuration.fontScale <= 1.2f) 24f else 18f)
                    // With no window the bar is an empty track, which states nothing and reads
                    // as a broken rule, so it goes. A count of your own cities is not an answer
                    // either; naming them at least says who could not be fitted in.
                    val detail = window?.let { range(it) + "\n" + label(first) }
                        ?: cities.joinToString(" · ") { label(it) }
                    text(R.id.px_detail, detail, p.secondary)
                    setContentDescription(R.id.px_detail, (window?.let { range(it) + ". " } ?: "") + cities.joinToString { label(it) })
                    setViewVisibility(R.id.px_image, if (window == null) View.GONE else View.VISIBLE)
                    if (window != null) image(windowBitmap(window, now, zone, p, widthDp), answer + ". " + t.get(R.string.widget_sampled))
                }
                WidgetKind.WEEK -> {
                    val week = PremiumWidgetData.week(cities, now)
                    text(R.id.px_title, t.get(R.string.widget_week_label) + " · " + label(first), p.secondary)
                    val best = week.maxByOrNull { (_, windows) -> windows.sumOf { Duration.between(it.start, it.end).seconds } }
                    text(R.id.px_summary, if (best == null || best.second.isEmpty()) t.get(R.string.widget_week_none)
                        else t.get(R.string.widget_week_best, best.first.format(dateFormat)))
                    week.forEachIndexed { i, (date, windows) ->
                        text(names[i], date.format(DateTimeFormatter.ofPattern("EEE", t.locale)), p.secondary)
                        setContentDescription(names[i], date.format(dateFormat) + ": " +
                            if (windows.isEmpty()) t.get(R.string.widget_week_none) else windows.joinToString { range(it) })
                    }
                    // Four ids, not the shared five: setTextViewText against an id this layout
                    // does not carry throws when the RemoteViews is applied, rather than being
                    // dropped the way a missing bind usually is.
                    listOf(R.id.px_axis0, R.id.px_axis1, R.id.px_axis2, R.id.px_axis3)
                        .forEachIndexed { i, view -> text(view, compactHour(i * 6, settings.use24Hour, t.locale), p.secondary) }
                    // 14dp padding either side, a fixed 40dp day column and its 8dp gutter.
                    val gridWidth = widthDp - 76f
                    val gridHeight = (heightDp - 110f * fontScale).coerceIn(70f, 320f)
                    // The row, not the image: the day labels sit in a column beside the grid and
                    // have to share its height, or seven labels drift out of step with seven rows.
                    // The image keeps match_parent inside it and follows.
                    sizeGraphic(widthDp - 28f, gridHeight, R.id.px_grid_row)
                    val (gridPxW, gridPxH) = graphicPixels(gridWidth, gridHeight)
                    image(weekBitmap(week, now, zone, timeFormat, p, gridPxW, gridPxH),
                        week.joinToString("; ") { (date, windows) -> date.format(dateFormat) + ": " +
                            if (windows.isEmpty()) t.get(R.string.widget_week_none) else windows.joinToString { range(it) } })
                }
                WidgetKind.RULER -> {
                    val start = now.atZone(zone).withMinute(0).withSecond(0).withNano(0).toInstant()
                    repeat(3) { i -> text(names[i], cities.getOrNull(i)?.let(::label).orEmpty(), p.secondary) }
                    text(R.id.px_title, t.get(R.string.widget_sampled), p.secondary)
                    axes.forEachIndexed { i, view ->
                        setViewVisibility(view, if (i < 3) View.VISIBLE else View.GONE)
                        if (i < 3) text(view, compactHour(local(start.plusSeconds(i * 3 * 3600L)).hour, settings.use24Hour, t.locale), p.secondary)
                    }
                    // 12dp padding either side, a fixed 64dp name column and its 8dp gutter.
                    val rulerWidth = widthDp - 96f
                    val rulerHeight = (heightDp - 66f * fontScale).coerceIn(40f, 260f)
                    sizeGraphic(rulerWidth, rulerHeight)
                    val (rulerPxW, rulerPxH) = graphicPixels(rulerWidth, rulerHeight)
                    image(rulerBitmap(cities, start, now, timeFormat, p, rulerPxW, rulerPxH), cities.joinToString { label(it) } + ". " + t.get(R.string.widget_sampled))
                }
                WidgetKind.DATELINE -> {
                    val homeDate = now.atZone(settings.homeZoneId()).toLocalDate()
                    val groups = cities.groupBy { now.atZone(ZoneId.of(it.zoneId)).toLocalDate() }.toSortedMap().entries.toList()
                    text(R.id.px_title, t.get(R.string.widget_dateline_label), p.secondary)
                    repeat(3) { i ->
                        val group = groups.getOrNull(i)
                        setViewVisibility(rows[i], if (group == null) View.GONE else View.VISIBLE)
                        if (group != null) {
                            val relative = when (ChronoUnit.DAYS.between(homeDate, group.key)) {
                                -1L -> t.get(R.string.widget_date_yesterday)
                                0L -> t.get(R.string.widget_date_today)
                                1L -> t.get(R.string.widget_date_tomorrow)
                                else -> ""
                            }
                            text(names[i], listOf(relative, group.key.format(dateFormat)).filter { it.isNotBlank() }.joinToString(" · "))
                            text(metas[i], group.value.joinToString { label(it) }, p.secondary)
                            // The layout's seam colour resolves against the system night mode
                            // while the card follows the chosen style or palette, so a light
                            // palette on a dark phone would draw a near-white hairline on a
                            // near-white card. The 40% alpha stays in the layout.
                            if (i > 0) setInt(if (i == 1) R.id.px_seam1 else R.id.px_seam2, "setBackgroundColor", p.ink)
                            setOnClickPendingIntent(rows[i], WidgetRenderer.convertIntent(context, group.value.first().zoneId, id * 10 + i + 1))
                        }
                    }
                }
                WidgetKind.CHANGE -> {
                    text(R.id.px_title, t.get(R.string.widget_change_label), p.secondary)
                    setViewVisibility(R.id.px_meta0, View.GONE)
                    val change = PremiumWidgetData.nextClockChange(cities, now)
                    if (change == null) {
                        text(R.id.px_summary, t.get(R.string.widget_change_none))
                        text(R.id.px_detail, label(first) + " · " + t.get(R.string.wc_cities) + ": " + cities.size, p.secondary)
                        setContentDescription(R.id.px_detail, cities.joinToString { label(it) })
                    } else {
                        val transition = change.transition
                        val changeTime = DateTimeFormatter.ofPattern(if (settings.use24Hour) "d MMM HH:mm" else "d MMM h:mm a", t.locale)
                        text(R.id.px_summary, label(change.city) + "\n" + transition.dateTimeBefore.format(changeTime))
                        text(R.id.px_detail, t.get(R.string.widget_change_detail,
                            ClockEngine.offsetLabel(transition.offsetBefore.totalSeconds / 60),
                            ClockEngine.offsetLabel(transition.offsetAfter.totalSeconds / 60)), p.secondary)
                        setOnClickPendingIntent(R.id.widget_root, WidgetRenderer.convertIntent(context, change.city.zoneId, id * 10))
                    }
                }
                else -> Unit
            }
        }
    }

    /**
     * The day's altitude as a curve. Every constant is a fraction of the bitmap, which is built at
     * the aspect of the box it will be stretched into, so the now mark is a circle at every size
     * rather than only at the one the old fixed 360 by 100 happened to match.
     */
    private fun solarBitmap(day: SolarDay, now: Instant, p: Colors, width: Int, height: Int): Bitmap {
        val w = width.toFloat(); val h = height.toFloat()
        val inset = w * 0.022f
        val span = w - 2 * inset
        val horizon = h * 0.72f
        // The curve's vertical gain follows the bitmap, so the arc keeps its shape when the box does not.
        val gain = h * 0.007
        val ceiling = h * 0.08f
        val floor = h * 0.94f
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap); val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = p.secondary; paint.alpha = 110; paint.strokeWidth = h * 0.02f
        canvas.drawLine(inset, horizon, w - inset, horizon, paint)
        val curve = Path()
        day.altitudes.forEachIndexed { i, altitude ->
            val x = inset + i * span / (day.altitudes.size - 1)
            val y = (horizon - altitude * gain).toFloat().coerceIn(ceiling, floor)
            if (i == 0) curve.moveTo(x, y) else curve.lineTo(x, y)
        }
        paint.alpha = 255; paint.color = p.track; paint.style = Paint.Style.STROKE; paint.strokeWidth = h * 0.05f
        canvas.drawPath(curve, paint)
        canvas.save()
        canvas.clipRect(0f, 0f, w, horizon)
        paint.color = p.accent; canvas.drawPath(curve, paint)
        canvas.restore()
        val fraction = ((now.epochSecond - day.start.epochSecond).toDouble() / (day.end.epochSecond - day.start.epochSecond)).coerceIn(0.0, 1.0)
        val index = (fraction * (day.altitudes.size - 1)).toInt()
        val x = (inset + fraction * span).toFloat()
        val y = (horizon - day.altitudes[index] * gain).toFloat().coerceIn(ceiling, floor)
        val ring = h * 0.09f
        paint.style = Paint.Style.FILL; paint.color = p.bg; canvas.drawCircle(x, y, ring, paint)
        paint.color = p.ink; canvas.drawCircle(x, y, ring * 0.66f, paint)
        return bitmap
    }

    private data class Land(val path: Path, val width: Float, val height: Float, val north: Double, val south: Double)
    @Volatile private var land: Land? = null
    private fun land(context: Context): Land = land ?: synchronized(this) {
        land ?: JSONObject(context.assets.open("world-land.json").bufferedReader().use { it.readText() }).let {
            Land(requireNotNull(PathParser.createPathFromPathData(it.getString("d"))), it.getDouble("width").toFloat(),
                it.getDouble("height").toFloat(), it.getDouble("north"), it.getDouble("south"))
        }.also { land = it }
    }
    /**
     * The world at its own proportions. The bitmap used to be a fixed 600x270, which stretched the
     * bundled 3600x1330 outline 22% too tall before the ImageView stretched it again, so Atlas
     * disagreed with the app's own Map screen about the shape of the world. Height now follows the
     * outline, and the view scales it with fitCenter.
     */
    private fun mapBitmap(context: Context, catalog: CityCatalog, cities: List<SavedCity>, now: Instant, p: Colors): Bitmap {
        val shape = land(context)
        val width = 600f
        val height = width * shape.height / shape.width
        val bitmap = Bitmap.createBitmap(width.toInt(), height.toInt(), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap); val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        canvas.clipPath(Path().apply { addRoundRect(RectF(0f, 0f, width, height), 6f, 6f, Path.Direction.CW) })
        // One scale for both axes now, which is what keeps the continents the right shape.
        canvas.save(); canvas.scale(width / shape.width, height / shape.height)
        paint.color = p.accent; paint.alpha = 110; canvas.drawPath(shape.path, paint); canvas.restore()
        val columns = 80
        val rows = 36
        val cellWidth = width / columns
        val cellHeight = height / rows
        for (row in 0 until rows) for (col in 0 until columns) {
            val lat = shape.north - (row + 0.5) * (shape.north - shape.south) / rows
            val lng = -180 + (col + 0.5) * 360 / columns
            val darkness = (-Sun.altitude(now, lat, lng) / 12).coerceIn(0.0, 1.0)
            paint.color = Color.BLACK; paint.alpha = (darkness * 120).toInt()
            canvas.drawRect(col * cellWidth, row * cellHeight, (col + 1) * cellWidth, (row + 1) * cellHeight, paint)
        }
        paint.alpha = 255
        cities.forEach { saved ->
            val city = catalog.find(saved.zoneId)
            val x = ((city.longitude + 180) / 360 * width).toFloat().coerceIn(7f, width - 7f)
            val y = ((shape.north - city.latitude) / (shape.north - shape.south) * height).toFloat().coerceIn(7f, height - 7f)
            // The ring is what buys contrast against both a lit and an unlit cell; only the dot
            // carries the city's own sun, amber by day and blue by night, as the Map screen does.
            paint.color = p.bg; canvas.drawCircle(x, y, 8f, paint)
            paint.color = context.getColor(
                if (Sun.isDay(now, city.latitude, city.longitude)) R.color.wc_sun else R.color.wc_accent_night)
            canvas.drawCircle(x, y, 5f, paint)
        }
        return bitmap
    }

    /** [boxWidthDp] is the widget width less its 14dp side padding; the bar itself is 12dp tall. */
    private fun windowBitmap(window: WorkingWindow?, now: Instant, zone: ZoneId, p: Colors, boxWidthDp: Float): Bitmap {
        val width = 640f
        // Match the view's aspect so fitXY only scales, and keep the mark round.
        val height = (width * 12f / (boxWidthDp - 28f).coerceAtLeast(60f)).coerceIn(16f, 160f)
        val k = height / 24f
        val bitmap = Bitmap.createBitmap(width.toInt(), height.toInt(), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap); val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val inset = 8f
        paint.color = p.track
        canvas.drawRoundRect(RectF(inset, height / 3f, width - inset, height * 2f / 3f), 4f * k, 4f * k, paint)
        if (window != null) {
            paint.color = p.accent
            val day = window.start.atZone(zone).toLocalDate()
            val start = day.atStartOfDay(zone).toInstant()
            val end = day.plusDays(1).atStartOfDay(zone).toInstant()
            fun x(at: Instant) = (inset + (at.epochSecond - start.epochSecond).toFloat() /
                (end.epochSecond - start.epochSecond) * (width - 2 * inset)).coerceIn(inset, width - inset)
            canvas.drawRoundRect(RectF(x(window.start), height / 3f, x(window.end), height * 2f / 3f), 4f * k, 4f * k, paint)
            if (now >= start && now < end) {
                val ring = height * 0.42f
                paint.color = p.bg; canvas.drawCircle(x(now), height / 2f, ring, paint)
                paint.color = p.ink; canvas.drawCircle(x(now), height / 2f, ring * 0.66f, paint)
            }
        }
        return bitmap
    }

    /**
     * Seven days of shared hours. Built at the aspect of its box and at the number of days in use,
     * so the track, the caption and the now mark all keep their proportions instead of being
     * stretched by whatever shape the widget happened to be. Constants scale off the row height,
     * which the original 50 pixel band defined.
     */
    private fun weekBitmap(days: List<Pair<java.time.LocalDate, List<WorkingWindow>>>, now: Instant,
        zone: ZoneId, format: DateTimeFormatter, p: Colors, width: Int, height: Int): Bitmap {
        val rows = days.size.coerceAtLeast(1)
        val w = width.toFloat(); val h = height.toFloat()
        val rowHeight = h / rows
        val k = rowHeight / 50f
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap); val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        days.forEachIndexed { i, (date, windows) ->
            val top = i * rowHeight
            val barTop = top + 35f * k
            val barBottom = top + 43f * k
            paint.color = p.track; canvas.drawRoundRect(RectF(0f, barTop, w, barBottom), 4f * k, 4f * k, paint)
            windows.forEach { window ->
                val day = window.start.atZone(zone).toLocalDate()
                val start = day.atStartOfDay(zone).toInstant(); val end = day.plusDays(1).atStartOfDay(zone).toInstant()
                val seconds = (end.epochSecond - start.epochSecond).toFloat()
                val left = (window.start.epochSecond - start.epochSecond) / seconds * w
                val right = (window.end.epochSecond - start.epochSecond) / seconds * w
                paint.color = p.accent; canvas.drawRoundRect(RectF(left, barTop, right, barBottom), 4f * k, 4f * k, paint)
            }
            val longest = windows.maxByOrNull { Duration.between(it.start, it.end) }
            // The range keeps its en dash, which reads as a range in every language this ships in.
            // The empty day draws nothing at all: with seven rows the old em dash placeholder
            // stacked up as seven floating marks above seven empty tracks, and an empty track
            // already says there is no window. Only visible once the grid was drawn at its real
            // proportions, which is the sort of thing no assertion was ever going to catch.
            val caption = longest?.let { it.start.atZone(zone).format(format) + " – " + it.end.atZone(zone).format(format) }
            if (caption != null) {
                paint.color = p.ink; paint.textSize = 30f * k; paint.textAlign = Paint.Align.LEFT
                canvas.drawText(caption, 2f * k, top + 28f * k, paint)
            }
            paint.alpha = 102; paint.strokeWidth = 1.5f * k
            canvas.drawLine(1f * k, top + 33f * k, 1f * k, top + 45f * k, paint)
            canvas.drawLine(w - 1f * k, top + 33f * k, w - 1f * k, top + 45f * k, paint)
            paint.alpha = 255
            val start = date.atStartOfDay(zone).toInstant()
            val end = date.plusDays(1).atStartOfDay(zone).toInstant()
            if (now >= start && now < end) {
                val x = (now.epochSecond - start.epochSecond).toFloat() / (end.epochSecond - start.epochSecond) * w
                val cy = top + 39f * k
                val ring = 8f * k
                paint.color = p.bg; canvas.drawCircle(x, cy, ring, paint)
                paint.color = p.ink; canvas.drawCircle(x, cy, ring * 0.62f, paint)
            }
        }
        return bitmap
    }

    /**
     * Hours as a labelled grid, one row per city. Built at the aspect of the box it is stretched
     * into and at the number of rows actually in use, so a two city ruler no longer pads a third
     * empty band and the now mark stays a circle. Every constant scales off the row height, which
     * the original 70 pixel cell defined.
     */
    private fun rulerBitmap(
        cities: List<SavedCity>, start: Instant, now: Instant, format: DateTimeFormatter, p: Colors,
        width: Int, height: Int,
    ): Bitmap {
        val columns = 3
        val rows = cities.size.coerceAtLeast(1)
        val w = width.toFloat(); val h = height.toFloat()
        val columnWidth = w / columns
        val rowHeight = h / rows
        val k = rowHeight / 70f
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap); val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        cities.forEachIndexed { row, city ->
            for (col in 0 until columns) {
                val at = start.plusSeconds(col * 3 * 3600L)
                val working = ClockEngine.isWorking(at, city)
                paint.color = if (working) p.accent else p.track
                if (working) paint.alpha = 77
                canvas.drawRoundRect(
                    RectF(col * columnWidth + 2 * k, row * rowHeight + 3 * k,
                        (col + 1) * columnWidth - 2 * k, row * rowHeight + rowHeight - 5 * k),
                    7 * k, 7 * k, paint,
                )
                paint.alpha = 255; paint.color = p.ink
                paint.textSize = 40f * k; paint.textAlign = Paint.Align.CENTER
                val value = at.atZone(ZoneId.of(city.zoneId)).format(format)
                val pieces = value.split(' ', limit = 2)
                canvas.drawText(pieces[0], col * columnWidth + columnWidth / 2, row * rowHeight + 39 * k, paint)
                if (pieces.size > 1) {
                    paint.textSize = 25f * k
                    canvas.drawText(pieces[1], col * columnWidth + columnWidth / 2, row * rowHeight + 61 * k, paint)
                }
            }
        }
        // One current reference line ties all rows together, not one independently scaled strip.
        fun xOf(at: Instant) = columnWidth / 2 + (at.epochSecond - start.epochSecond) / 10800f * columnWidth
        paint.color = p.ink; paint.strokeWidth = 3f * k
        val nowX = xOf(now)
        canvas.drawLine(nowX, 0f, nowX, h, paint)
        cities.forEachIndexed { row, city ->
            val zone = ZoneId.of(city.zoneId)
            val midnight = start.atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant()
            val seamX = xOf(midnight)
            if (seamX in 0f..w) {
                paint.color = p.ink; paint.alpha = 102; paint.strokeWidth = 1.5f * k
                canvas.drawLine(seamX, row * rowHeight, seamX, (row + 1) * rowHeight, paint)
            }
            // Centred in its row. It used to sit on the row's top edge and read as clipped.
            val cy = row * rowHeight + rowHeight / 2
            val ring = 8f * k
            paint.alpha = 255; paint.color = p.bg
            canvas.drawCircle(nowX, cy, ring, paint)
            paint.color = p.ink; canvas.drawCircle(nowX, cy, ring * 0.62f, paint)
        }
        return bitmap
    }
}
