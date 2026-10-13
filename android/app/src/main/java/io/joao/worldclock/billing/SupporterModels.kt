package io.joao.worldclock.billing

enum class SupporterPlan(val productId: String, val basePlanId: String, val billingPeriod: String) {
    YEARLY("supporter_yearly", "yearly", "P1Y"), MONTHLY("supporter_monthly", "monthly", "P1M");
}

enum class SupporterAccess(val plan: SupporterPlan? = null) {
    FREE, YEARLY(SupporterPlan.YEARLY), MONTHLY(SupporterPlan.MONTHLY)
}
enum class BillingStatus { LOADING, READY, UNAVAILABLE, ERROR, PENDING, RESTORED, NOTHING_TO_RESTORE }

data class SupporterState(
    val access: SupporterAccess = SupporterAccess.FREE,
    val yearlyPrice: String? = null,
    val monthlyPrice: String? = null,
    val busy: Boolean = false,
    val status: BillingStatus = BillingStatus.LOADING,
) { val hasAccess: Boolean get() = access != SupporterAccess.FREE }

/** Only signed, completed, acknowledged purchases can be stored here. Never a premium boolean. */
internal data class PurchaseEvidence(
    val json: String,
    val signature: String,
    val checkedAt: Long,
)

internal data class VerifiedPurchase(val plan: SupporterPlan, val token: String, val purchasedAt: Long)

internal object EntitlementPolicy {
    // queryPurchases returns active subscriptions (including cancelled but not yet expired).
    // The client receipt has no expiry. Do not treat it as a permanent subscription grant.
    const val SUBSCRIPTION_OFFLINE_MS = 24L * 60 * 60 * 1000
    fun access(yearlyCheckedAt: Long?, monthlyCheckedAt: Long?, now: Long): SupporterAccess = when {
        fresh(yearlyCheckedAt, now) -> SupporterAccess.YEARLY
        fresh(monthlyCheckedAt, now) -> SupporterAccess.MONTHLY
        else -> SupporterAccess.FREE
    }
    private fun fresh(checkedAt: Long?, now: Long) =
        checkedAt != null && now >= checkedAt && now - checkedAt < SUBSCRIPTION_OFFLINE_MS
}
