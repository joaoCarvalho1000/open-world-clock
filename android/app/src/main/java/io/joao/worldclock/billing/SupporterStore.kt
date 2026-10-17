package io.joao.worldclock.billing

import android.content.Context
import io.joao.worldclock.BuildConfig

/** Private, backup-excluded receipt cache; every read checks the Play signature again. */
internal class SupporterStore private constructor(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("supporter_receipts", Context.MODE_PRIVATE)
    val verifier = PurchaseVerifier(BuildConfig.PLAY_BILLING_PUBLIC_KEY, context.packageName)

    fun access(now: Long = System.currentTimeMillis()): SupporterAccess {
        val yearly = read(SupporterPlan.YEARLY)
        val monthly = read(SupporterPlan.MONTHLY)
        return EntitlementPolicy.access(yearly?.checkedAt, monthly?.checkedAt, now)
    }

    fun read(plan: SupporterPlan): PurchaseEvidence? {
        val json = prefs.getString("${plan.name}.json", null) ?: return null
        val signature = prefs.getString("${plan.name}.signature", null) ?: return null
        if (verifier.verify(json, signature)?.plan != plan) return null
        return PurchaseEvidence(json, signature, prefs.getLong("${plan.name}.checked", 0))
    }

    fun replace(plan: SupporterPlan, evidence: PurchaseEvidence?) {
        val edit = prefs.edit()
        if (evidence == null) {
            edit.remove("${plan.name}.json").remove("${plan.name}.signature").remove("${plan.name}.checked")
        } else {
            require(verifier.verify(evidence.json, evidence.signature)?.plan == plan)
            edit.putString("${plan.name}.json", evidence.json)
                .putString("${plan.name}.signature", evidence.signature)
                .putLong("${plan.name}.checked", evidence.checkedAt)
        }
        edit.apply()
    }

    companion object {
        @Volatile private var instance: SupporterStore? = null
        fun get(context: Context): SupporterStore = instance ?: synchronized(this) {
            instance ?: SupporterStore(context.applicationContext).also { instance = it }
        }
    }
}
