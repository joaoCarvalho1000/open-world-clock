package io.joao.worldclock.ui.supporter

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.joao.worldclock.R
import io.joao.worldclock.billing.SupporterAccess
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.LocalServices

/**
 * The Supporter Pack in Settings: benefits and Google Play subscription options.
 */
@Composable
fun SupporterSettingsCard(onOpen: () -> Unit) {
    val t = LocalStrings.current
    val billing = LocalServices.current.supporter
    val activity = LocalActivity.current
    val state by billing.state.collectAsStateWithLifecycle()
    var restoreRequested by rememberSaveable { mutableStateOf(false) }

    Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Palette, null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(14.dp))
                Text(t.get(R.string.supporter_title), style = MaterialTheme.typography.titleMedium)
            }
            Text(
                when (state.access) {
                    SupporterAccess.YEARLY -> t.get(R.string.supporter_active_yearly)
                    SupporterAccess.MONTHLY -> t.get(R.string.supporter_active_monthly)
                    SupporterAccess.FREE -> t.get(R.string.supporter_pitch)
                },
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!state.hasAccess) {
                Text(t.get(R.string.supporter_free_note), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                FilledTonalButton(onClick = onOpen, modifier = Modifier.padding(top = 12.dp)) {
                    Text(t.get(R.string.supporter_open))
                }
            } else {
                TextButton(onClick = { activity?.let { billing.manage(it) } }, modifier = Modifier.padding(top = 8.dp)) {
                    Text(t.get(R.string.supporter_manage))
                }
            }
            if (!state.hasAccess) {
                TextButton(onClick = { restoreRequested = true; billing.restore() }, enabled = !state.busy) {
                    Text(t.get(R.string.supporter_restore))
                }
                if (restoreRequested) {
                    statusLine(t, state)?.let { line ->
                        Text(line, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    }
                }
            }
        }
    }
}

/**
 * Shown while a locked look is being tried. It says what is being previewed, what will happen
 * if the widget is saved anyway, and offers the one way out.
 */
@Composable
fun SupporterLockNote(lockedName: String, savingNote: Boolean, onUnlock: () -> Unit, modifier: Modifier = Modifier) {
    val t = LocalStrings.current
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.secondaryContainer, modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp)) {
            Text(t.get(R.string.wc_preview_only), style = MaterialTheme.typography.labelLarge)
            Text(t.get(R.string.wc_locked_note, lockedName), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSecondaryContainer)
            if (savingNote) {
                Text(t.get(R.string.wc_locked_save), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer)
            }
            TextButton(onClick = onUnlock, modifier = Modifier.padding(top = 4.dp)) { Text(t.get(R.string.supporter_unlock)) }
        }
    }
}
