package io.joao.worldclock.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.net.Uri
import android.os.Bundle
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.data.SettingsRepository
import java.util.UUID

/** Shared provider behavior: render on every update and keep instances independent. */
abstract class BaseWidgetProvider(private val kind: WidgetKind) : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { WidgetRenderer.update(context, manager, kind, it) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        WidgetRenderer.update(context, manager, kind, id)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        WidgetStore(context).delete(ids)
    }

    override fun onRestored(context: Context, oldIds: IntArray, newIds: IntArray) {
        val store = WidgetStore(context)
        oldIds.zip(newIds).forEach { (old, new) -> store.save(new, store.load(old)) }
        store.delete(oldIds)
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_PINNED -> {
                // Callback from requestPinAppWidget: the system appends the new widget id,
                // and the extras carry the configuration chosen in the in-app gallery.
                val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
                if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                    val config = WidgetConfigCodec.decode(
                        intent.getStringArrayListExtra(EXTRA_ZONES).orEmpty().joinToString(","),
                        intent.getStringExtra(EXTRA_STYLE),
                        intent.getStringExtra(EXTRA_THEME),
                        intent.getStringExtra(EXTRA_FONT),
                    )
                    WidgetStore(context).save(id, config)
                    WidgetRenderer.update(context, AppWidgetManager.getInstance(context), kind, id)
                }
            }
            Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_LOCALE_CHANGED -> refresh(context, kind)
            else -> super.onReceive(context, intent)
        }
    }

    companion object {
        const val ACTION_PINNED = "io.joao.worldclock.widget.PINNED"
        const val EXTRA_ZONES = "zones"
        const val EXTRA_STYLE = "style"
        const val EXTRA_THEME = "theme"
        const val EXTRA_FONT = "font"

        fun refresh(context: Context, kind: WidgetKind) {
            val manager = AppWidgetManager.getInstance(context)
            manager.getAppWidgetIds(ComponentName(context, kind.providerClass)).forEach {
                WidgetRenderer.update(context, manager, kind, it)
            }
        }

        fun canPin(context: Context): Boolean = AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported

        /** Asks the launcher to pin a widget preconfigured with [config]. Returns false if unsupported. */
        fun requestPin(context: Context, kind: WidgetKind, config: WidgetConfig): Boolean {
            if (kind.premium && !io.joao.worldclock.billing.SupporterBilling.hasAccess(context)) return false
            val manager = AppWidgetManager.getInstance(context)
            if (!manager.isRequestPinAppWidgetSupported) return false
            // A unique data URI gives every request its own PendingIntent, so a second pin of the
            // same kind can't overwrite the configuration carried by a first, unconfirmed one.
            val callback = Intent(context, kind.providerClass).setAction(ACTION_PINNED)
                .setData(Uri.parse("worldclock-pin://${kind.name.lowercase()}/${UUID.randomUUID()}"))
                .putStringArrayListExtra(EXTRA_ZONES, ArrayList(config.zones))
                .putExtra(EXTRA_STYLE, config.style.name)
                .putExtra(EXTRA_THEME, config.themeId)
                .putExtra(EXTRA_FONT, config.faceId)
            // Mutable so the system can attach EXTRA_APPWIDGET_ID to the callback.
            val flags = PendingIntent.FLAG_ONE_SHOT or if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
            val pending = PendingIntent.getBroadcast(context, 0, callback, flags)
            // The launcher's confirmation dialog shows whatever is drawn here, and build() falls
            // back to a generic size table when handed no options. Sun arc, Next window and Date
            // line all declare minima above that table, so the first sight of a paid widget was a
            // cropped one. Ask the provider what it actually asks for.
            val info = manager.installedProviders.firstOrNull { it.provider.className == kind.providerClass.name }
            val density = context.resources.displayMetrics.density
            val sizing = info?.takeIf { it.minWidth > 0 && it.minHeight > 0 && density > 0f }?.let {
                // The provider declares pixels; these options are read back as dp.
                val wDp = (it.minWidth / density).toInt()
                val hDp = (it.minHeight / density).toInt()
                Bundle().apply {
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, wDp)
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, wDp)
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, hDp)
                    putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, hDp)
                }
            }
            val preview = WidgetRenderer.build(context, kind, 0, config,
                SettingsRepository(context).settings.value, CityCatalog(context), sizing)
            val extras = Bundle().apply { putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW, preview) }
            return manager.requestPinAppWidget(ComponentName(context, kind.providerClass), extras, pending)
        }
    }
}

class SingleClockWidgetProvider : BaseWidgetProvider(WidgetKind.SINGLE)

class MeetingWidgetProvider : BaseWidgetProvider(WidgetKind.MEETING)

class WorldClockWidgetProvider : BaseWidgetProvider(WidgetKind.WORLD) {
    companion object {
        /** Re-renders every placed widget of every kind. Safe to call from any settings change. */
        fun refreshAll(context: Context) {
            WidgetKind.entries.forEach { BaseWidgetProvider.refresh(context, it) }
        }
    }
}

class DuoWidgetProvider : BaseWidgetProvider(WidgetKind.DUO)
class WorldBoardWidgetProvider : BaseWidgetProvider(WidgetKind.BOARD)
class WorkdayWidgetProvider : BaseWidgetProvider(WidgetKind.WORKDAY)

class MapWidgetProvider : BaseWidgetProvider(WidgetKind.MAP)
class DaylightWidgetProvider : BaseWidgetProvider(WidgetKind.DAYLIGHT)
class NextWidgetProvider : BaseWidgetProvider(WidgetKind.NEXT)
class WeekWidgetProvider : BaseWidgetProvider(WidgetKind.WEEK)
class RulerWidgetProvider : BaseWidgetProvider(WidgetKind.RULER)
class DateLineWidgetProvider : BaseWidgetProvider(WidgetKind.DATELINE)
class ChangeWidgetProvider : BaseWidgetProvider(WidgetKind.CHANGE)
