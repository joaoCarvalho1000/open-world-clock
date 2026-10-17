package io.joao.worldclock.engagement

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import com.google.android.play.core.review.ReviewManagerFactory
import io.joao.worldclock.R
import io.joao.worldclock.core.AppLanguage
import io.joao.worldclock.data.SettingsRepository
import io.joao.worldclock.i18n.AppStrings
import java.time.LocalDate
import java.util.Locale

/** Sharing stays in the system chooser. Nothing is sent or tracked by the app. */
class Engagement(private val context: Context) {
    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences("engagement", Context.MODE_PRIVATE)
    val canReview: Boolean get() = (app.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0 &&
        runCatching {
            if (Build.VERSION.SDK_INT >= 30) app.packageManager.getInstallSourceInfo(app.packageName).installingPackageName
            else @Suppress("DEPRECATION") app.packageManager.getInstallerPackageName(app.packageName)
        }.getOrNull() == "com.android.vending"

    fun recordLaunch(now: Long = System.currentTimeMillis()) {
        val today = LocalDate.now().toString()
        val edit = prefs.edit()
        if (!prefs.contains("first_use")) edit.putLong("first_use", now)
        if (prefs.getString("last_day", null) != today) {
            edit.putString("last_day", today).putInt("active_days", prefs.getInt("active_days", 0) + 1)
        }
        edit.apply()
    }

    fun recordMeaningfulUse() {
        prefs.edit().putInt("uses", (prefs.getInt("uses", 0) + 1).coerceAtMost(1000)).apply()
    }

    fun maybeRequestReview(activity: Activity, now: Long = System.currentTimeMillis()) {
        if (!canReview || activity.isFinishing || activity.isDestroyed || !ReviewPolicy.eligible(now,
                prefs.getLong("first_use", now), prefs.getInt("active_days", 0), prefs.getInt("uses", 0), prefs.getLong("review_attempt", 0))) return
        prefs.edit().putLong("review_attempt", now).apply()
        val manager = ReviewManagerFactory.create(app)
        manager.requestReviewFlow().addOnSuccessListener { info ->
            val resumed = (activity as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) != false
            if (!activity.isFinishing && !activity.isDestroyed && resumed) manager.launchReviewFlow(activity, info)
        }
        // Failure or a quota-suppressed prompt must not interrupt the normal app flow.
    }

    /** A deliberate Rate app tap opens the listing: unlike the prompt API, it cannot silently hit a quota. */
    fun requestReview(activity: Activity) {
        if (!canReview) { sendFeedback(strings().locale); return }
        prefs.edit().putLong("review_attempt", System.currentTimeMillis()).apply()
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${app.packageName}"))
            .setPackage("com.android.vending").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { activity.startActivity(intent) }
        catch (_: ActivityNotFoundException) { openWeb("https://play.google.com/store/apps/details?id=${app.packageName}") }
    }

    fun shareApp(locale: Locale) {
        val language = locale.language.takeIf { it in setOf("pt", "es") }
        val url = "https://openworldclock.com/" + (language?.let { "$it/" } ?: "")
        val text = localized(locale).get(R.string.eng_share_app_text, url)
        shareText(text, localized(locale).get(R.string.eng_share_title))
    }

    fun shareText(text: String, title: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, text).putExtra(Intent.EXTRA_TITLE, title)
        launch(Intent.createChooser(send, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        recordMeaningfulUse()
    }

    fun sendFeedback(locale: Locale) {
        val subject = localized(locale).get(R.string.eng_feedback_subject)
        val mail = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:support@openworldclock.com?subject=${Uri.encode(subject)}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { context.startActivity(mail) }
        catch (_: ActivityNotFoundException) { openWeb("https://openworldclock.com/support.html") }
    }

    /**
     * Play expects the policy a buyer agrees to be reachable from the app, not only the listing.
     * The site carries all three languages, so follow the app's own rather than the browser's.
     */
    fun openPrivacyPolicy(locale: Locale) = openWeb(
        "https://openworldclock.com/" + when (locale.language) { "pt" -> "pt/privacy"; "es" -> "es/privacy"; else -> "privacy" }
    )

    private fun localized(locale: Locale) = AppStrings(context, when (locale.language) { "pt" -> AppLanguage.PT; "es" -> AppLanguage.ES; else -> AppLanguage.EN })
    private fun strings() = AppStrings(context, SettingsRepository(context).settings.value.language)
    private fun openWeb(url: String) = launch(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    private fun launch(intent: Intent) {
        try { context.startActivity(intent) }
        catch (_: ActivityNotFoundException) { Toast.makeText(context, strings().get(R.string.eng_unavailable), Toast.LENGTH_SHORT).show() }
    }
}
