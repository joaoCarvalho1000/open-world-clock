package io.joao.worldclock.i18n

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import io.joao.worldclock.core.AppLanguage
import java.util.Locale

/** One locale for Compose copy, date pickers, city names and background widgets. */
class AppStrings(base: Context, language: AppLanguage) {
    val locale: Locale = language.locale(base.resources.configuration.locales.let { locales ->
        (0 until locales.size()).map(locales::get).firstOrNull { it.language in setOf("en", "pt", "es") }
            ?: Locale.ENGLISH
    })
    val context: Context = base.createConfigurationContext(Configuration(base.resources.configuration).apply {
        setLocales(LocaleList(this@AppStrings.locale))
        setLayoutDirection(this@AppStrings.locale)
    })

    fun get(@StringRes id: Int, vararg args: Any): String = if (args.isEmpty()) context.getString(id)
        else String.format(locale, context.getString(id), *args)
}

val LocalStrings = staticCompositionLocalOf<AppStrings> { error("AppStrings not provided") }

@Composable
fun LocalizedApp(language: AppLanguage, content: @Composable () -> Unit) {
    val base = LocalContext.current
    val configuration = LocalConfiguration.current
    val strings = remember(base, language, configuration) { AppStrings(base, language) }
    CompositionLocalProvider(
        LocalStrings provides strings,
        LocalContext provides strings.context,
        LocalConfiguration provides strings.context.resources.configuration,
        content = content,
    )
}
