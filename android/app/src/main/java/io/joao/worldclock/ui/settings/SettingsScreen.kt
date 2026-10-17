package io.joao.worldclock.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MailOutline
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.StarRate
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import io.joao.worldclock.R
import io.joao.worldclock.ui.clocks.CitySearchSheet
import io.joao.worldclock.ui.components.rememberHomePoint
import io.joao.worldclock.core.AppLanguage
import io.joao.worldclock.core.AppTheme
import io.joao.worldclock.core.ClockSettings
import io.joao.worldclock.i18n.LocalStrings
import io.joao.worldclock.ui.components.LocalServices
import io.joao.worldclock.ui.components.ScreenTitle
import io.joao.worldclock.ui.components.SectionHeader
import io.joao.worldclock.ui.supporter.SupporterSettingsCard
import io.joao.worldclock.ui.supporter.SupporterSheet
import java.time.LocalTime
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(settings: ClockSettings) {
    val t = LocalStrings.current
    val services = LocalServices.current
    val context = LocalContext.current
    val activity = LocalActivity.current
    val engagement = services.engagement
    var license by rememberSaveable { mutableStateOf<String?>(null) }
    license?.let { LicenseDialog(it) { license = null } }
    var supporter by rememberSaveable { mutableStateOf(false) }
    var referencePicker by rememberSaveable { mutableStateOf(false) }
    if (referencePicker) {
        val current = settings.homeZone ?: java.time.ZoneId.systemDefault().id
        CitySearchSheet(
            title = t.get(R.string.clocks_home_title),
            selected = setOf(current),
            onPick = { city -> services.setHomeZone(city.id); referencePicker = false },
            onDismiss = { referencePicker = false },
        )
    }
    if (supporter) SupporterSheet(settings) { supporter = false }
    val version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: ""
    val sample = LocalTime.of(17, 30)
        .format(DateTimeFormatter.ofPattern(if (settings.use24Hour) "HH:mm" else "h:mm a", t.locale))

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
        ScreenTitle(t.get(R.string.settings_title))
        SectionHeader(t.get(R.string.settings_appearance))
        Group {
            val home = rememberHomePoint(settings, t.locale)
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { referencePicker = true },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(t.get(R.string.settings_reference), style = MaterialTheme.typography.bodyLarge)
                    Text(home.city.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
                Icon(Icons.Rounded.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(t.get(R.string.settings_reference_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            // Only offered once it would do something: with no override this is already the state.
            if (settings.homeZone != null) {
                TextButton(onClick = { services.setHomeZone(null) }, contentPadding = PaddingValues(0.dp)) {
                    Text(t.get(R.string.settings_reference_device))
                }
            }
        }
        Spacer(Modifier.size(8.dp))
        Group {
            Text(t.get(R.string.settings_theme), style = MaterialTheme.typography.bodyLarge)
            Text(t.get(R.string.settings_theme_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            val options = listOf(AppTheme.SYSTEM to R.string.theme_system, AppTheme.LIGHT to R.string.theme_light, AppTheme.DARK to R.string.theme_dark)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                options.forEachIndexed { i, (theme, label) ->
                    SegmentedButton(
                        selected = settings.theme == theme,
                        onClick = { services.setTheme(theme) },
                        shape = SegmentedButtonDefaults.itemShape(i, options.size),
                    ) { Text(t.get(label), maxLines = 1) }
                }
            }
        }
        Spacer(Modifier.size(8.dp))
        Group {
            Row(
                Modifier.fillMaxWidth().toggleable(settings.use24Hour, role = Role.Switch) { services.setUse24Hour(it) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(t.get(R.string.settings_24h), style = MaterialTheme.typography.bodyLarge)
                    Text(t.get(R.string.settings_24h_sample, sample), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = settings.use24Hour, onCheckedChange = null)
            }
        }
        Spacer(Modifier.size(8.dp))
        Group {
            Text(t.get(R.string.settings_language), style = MaterialTheme.typography.bodyLarge)
            // Four choices never fit a segmented row at large font scales, so they wrap as
            // radio chips: one per line on a phone, side by side when there is room.
            FlowRow(
                Modifier.fillMaxWidth().padding(top = 8.dp).selectableGroup(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Languages.forEach { (language, label) ->
                    val selected = settings.language == language
                    Row(
                        Modifier.widthIn(min = 150.dp).heightIn(min = 48.dp)
                            .selectable(selected, role = Role.RadioButton) { services.setLanguage(language) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = selected, onClick = null)
                        Spacer(Modifier.width(8.dp))
                        Text(t.get(label), style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
        Spacer(Modifier.size(8.dp))
        SupporterSettingsCard { supporter = true }
        SectionHeader(t.get(R.string.settings_privacy))
        Group {
            PrivacyLine(Icons.Rounded.CloudOff, t.get(R.string.privacy_offline), t.get(R.string.privacy_offline_body))
            PrivacyLine(Icons.Rounded.VisibilityOff, t.get(R.string.privacy_tracking), t.get(R.string.privacy_tracking_body))
            PrivacyLine(Icons.Rounded.Lock, t.get(R.string.privacy_local), t.get(R.string.privacy_local_body))
            Spacer(Modifier.size(4.dp))
            ActionRow(Icons.Rounded.OpenInNew, t.get(R.string.settings_privacy_policy)) { engagement.openPrivacyPolicy(t.locale) }
        }
        SectionHeader(t.get(R.string.settings_about))
        Group {
            Text(t.get(R.string.app_name), style = MaterialTheme.typography.titleMedium)
            Text(
                t.get(R.string.about_body) + if (version.isNotBlank()) "\n" + t.get(R.string.about_version, version) else "",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.size(12.dp))
            ActionRow(Icons.Rounded.Share, t.get(R.string.settings_share)) { engagement.shareApp(t.locale) }
            ActionRow(Icons.Rounded.MailOutline, t.get(R.string.settings_feedback)) { engagement.sendFeedback(t.locale) }
            if (activity != null && engagement.canReview) {
                ActionRow(Icons.Rounded.StarRate, t.get(R.string.settings_rate)) { engagement.requestReview(activity) }
            }
            Spacer(Modifier.size(4.dp))
            TextButton(onClick = { license = "LICENSE" }) { Text(t.get(R.string.about_license)) }
            TextButton(onClick = { license = "THIRD_PARTY_NOTICES.md" }) { Text(t.get(R.string.about_notices)) }
        }
        Spacer(Modifier.size(24.dp))
    }
}

/** Language names stay in their own language, which is how people recognise them in a list. */
private val Languages = listOf(
    AppLanguage.SYSTEM to R.string.language_system,
    AppLanguage.EN to R.string.language_en,
    AppLanguage.PT to R.string.language_pt,
    AppLanguage.ES to R.string.language_es,
)

/** Shows a bundled license file verbatim, read offline from assets. */
@Composable
private fun LicenseDialog(asset: String, onDismiss: () -> Unit) {
    val t = LocalStrings.current
    val context = LocalContext.current
    val text = remember(asset) {
        runCatching { context.assets.open(asset).bufferedReader().use { it.readText() } }
            .getOrDefault(t.get(R.string.license_unavailable))
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t.get(if (asset == "LICENSE") R.string.license_title else R.string.about_notices)) },
        text = {
            SelectionContainer {
                Text(text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.verticalScroll(rememberScrollState()))
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(t.get(R.string.action_close)) } },
    )
}

@Composable
private fun Group(content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { content() }
    }
}

/** One tap, one line, no explanation: the label already says what happens. */
@Composable
private fun ActionRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(14.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun PrivacyLine(icon: ImageVector, title: String, body: String) {
    Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(14.dp))
        Column {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
