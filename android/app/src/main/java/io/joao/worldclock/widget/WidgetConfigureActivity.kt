package io.joao.worldclock.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.joao.worldclock.R
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.data.SettingsRepository
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.i18n.LocalizedApp
import io.joao.worldclock.ui.components.AppServices
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.rememberNow
import io.joao.worldclock.ui.theme.WorldClockTheme
import io.joao.worldclock.ui.widgets.WidgetCustomizer
import io.joao.worldclock.ui.supporter.SupporterSheet
import io.joao.worldclock.ui.widgets.NativeWidgetPreview

/**
 * Per-instance setup, opened by the launcher when a widget is placed or reconfigured,
 * and from the app's "On your home screen" list. Canceling a first placement removes the widget.
 */
/**
 * Names the commit bar so a test can scope its assertions there. The customizer above may
 * legitimately offer its own Unlock for a locked look, so a global match proves nothing.
 */
const val ConfigureBottomBarTag = "configure_bottom_bar"

class WidgetConfigureActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val id = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        val manager = AppWidgetManager.getInstance(this)
        val kind = WidgetKind.forProvider(manager.getAppWidgetInfo(id)?.provider?.className)
        // Only accept ids that belong to this app's providers.
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID || kind == null) { finish(); return }
        setResult(Activity.RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))

        val store = WidgetStore(this)
        val initial = store.load(id)
        // Whether this instance already exists decides the gate below, so read it before the
        // first save can change the answer.
        val wasConfigured = store.isConfigured(id)
        val services = AppServices(applicationContext, CityCatalog(applicationContext), SettingsRepository(applicationContext))

        setContent {
            val settings by services.repository.settings.collectAsStateWithLifecycle()
            var zones by rememberSaveable { mutableStateOf(initial.zones) }
            var style by rememberSaveable { mutableStateOf(initial.style) }
            var theme by rememberSaveable { mutableStateOf(initial.themeId) }
            var font by rememberSaveable { mutableStateOf(initial.faceId) }
            val now by rememberNow()
            val config = WidgetConfig(zones, style, theme, font)
            val supporter by services.supporter.state.collectAsStateWithLifecycle()
            var unlocking by rememberSaveable { mutableStateOf(false) }
            // A premium kind cannot be set up for the first time without access. An instance
            // that already exists stays editable, so expiry never strands someone with a
            // widget whose cities they can no longer change.
            val blocked = kind.premium && !supporter.hasAccess && !wasConfigured
            // Placed from the launcher, this screen can be the first thing opened after a
            // purchase on another device, so ask Play again every time it comes forward.
            LifecycleResumeEffect(Unit) { services.supporter.refresh(); onPauseOrDispose { } }
            LocalizedApp(settings.language) {
            val t = LocalStrings.current
            WorldClockTheme(settings.theme) {
                // The purchase flow needs an Activity, and this screen is its own host.
                CompositionLocalProvider(LocalServices provides services, LocalActivity provides this@WidgetConfigureActivity) {
                    if (unlocking) SupporterSheet(settings) { unlocking = false }
                    Scaffold(
                        topBar = { TopAppBar(title = { Text(t.get(R.string.wc_setup_title, t.get(kind.titleRes).lowercase(t.locale))) }) },
                        bottomBar = {
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceContainer,
                                modifier = Modifier.testTag(ConfigureBottomBarTag),
                            ) {
                                Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp)) {
                                if (blocked) {
                                    // A premium kind placed without access: say why rather than
                                    // failing a tap, and keep the preview above fully browsable.
                                    Text(t.get(R.string.wc_locked_note, t.get(kind.titleRes)),
                                        style = MaterialTheme.typography.bodyMedium)
                                    Text(t.get(R.string.wc_locked_save), style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(bottom = 8.dp))
                                }
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                    OutlinedButton(onClick = { finish() }) { Text(t.get(R.string.action_cancel)) }
                                    Spacer(Modifier.width(8.dp))
                                    if (blocked) {
                                        Button(onClick = { unlocking = true }) { Text(t.get(R.string.supporter_unlock)) }
                                    } else {
                                        Button(onClick = {
                                            // A locked look is only ever a preview: what is stored
                                            // is what this widget may actually draw.
                                            store.save(id, if (supporter.hasAccess ||
                                                (config.themeId == initial.themeId && config.faceId == initial.faceId)) config
                                            else config.forAccess(false))
                                            WidgetRenderer.update(this@WidgetConfigureActivity, manager, kind, id)
                                            setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
                                            finish()
                                        }) { Text(t.get(R.string.wc_save)) }
                                    }
                                }
                                }
                            }
                        },
                    ) { padding ->
                        Column(
                            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainerHighest, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                                Box(Modifier.padding(24.dp), contentAlignment = Alignment.Center) {
                                    NativeWidgetPreview(kind, config, settings, services.catalog)
                                }
                            }
                            Column(Modifier.widthIn(max = 560.dp).fillMaxWidth().padding(vertical = 8.dp)) {
                                WidgetCustomizer(kind, config, settings) { zones = it.zones; style = it.style; theme = it.themeId; font = it.faceId }
                            }
                        }
                    }
                }
            }
            }
        }
    }
}
