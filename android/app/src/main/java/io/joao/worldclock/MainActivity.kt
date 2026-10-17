package io.joao.worldclock

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.LocalActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.joao.worldclock.data.CityCatalog
import io.joao.worldclock.data.SettingsRepository
import io.joao.worldclock.ui.DeepLink
import io.joao.worldclock.ui.WorldClockApp
import io.joao.worldclock.ui.components.AppServices
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.theme.WorldClockTheme
import io.joao.worldclock.i18n.LocalizedApp
import io.joao.worldclock.engagement.Engagement
import io.joao.worldclock.billing.SupporterBilling
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val pendingLink = mutableStateOf<DeepLink?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        Engagement(this).recordLaunch()
        val services = AppServices(applicationContext, CityCatalog(applicationContext), SettingsRepository(applicationContext))
        if (savedInstanceState == null) pendingLink.value = DeepLink.parse(intent?.data)
        setContent {
            val settings by services.repository.settings.collectAsStateWithLifecycle()
            LocalizedApp(settings.language) {
                WorldClockTheme(settings.theme) {
                    CompositionLocalProvider(LocalServices provides services, LocalActivity provides this@MainActivity) {
                        WorldClockApp(
                            settings = settings,
                            deepLink = pendingLink.value,
                            onDeepLinkConsumed = { pendingLink.value = null },
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // A launcher tap on a running app carries no URI. Falling back to Clocks here threw away
        // the tab the person was on; a relaunch must resume where it was, like any Android app.
        DeepLink.parse(intent.data)?.let { pendingLink.value = it }
    }

    override fun onResume() {
        super.onResume()
        SupporterBilling.get(applicationContext).refresh()
        lifecycleScope.launch {
            delay(1500)
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) Engagement(this@MainActivity).maybeRequestReview(this@MainActivity)
        }
    }
}
