package io.joao.worldclock.billing

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import io.joao.worldclock.widget.WidgetKind
import com.android.billingclient.api.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.coroutines.resume

/**
 * Google Play owns prices, payment and subscription status. This client-only integration verifies
 * signed receipts, acknowledges purchases and rechecks ownership whenever the app resumes.
 * No local toggle, URL or build flag grants access. Unconfigured builds cannot charge anyone.
 */
class SupporterBilling private constructor(context: Context) {
    private val app = context.applicationContext
    private val store = SupporterStore.get(app)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate + CoroutineExceptionHandler { _, _ ->
        // Store/service failures must leave the free clock app usable. Do not log payment data.
        purchaseInFlight = false
        publish(BillingStatus.ERROR, false)
    })
    private val mutex = Mutex()
    private val flow = MutableStateFlow(SupporterState(access = store.access()))
    val state: StateFlow<SupporterState> = flow.asStateFlow()
    private var expiry: Job? = null
    private var operation: Job? = null
    private var purchaseInFlight = false
    private val offers = mutableMapOf<SupporterPlan, Offer>()
    private var offersAt = 0L
    private data class Offer(val details: ProductDetails, val token: String?, val price: String,
        val micros: Long, val currency: String)

    private val client = BillingClient.newBuilder(app)
        .setListener { result, purchases ->
            purchaseInFlight = false
            scope.launch {
                mutex.withLock {
                    when (result.responseCode) {
                        BillingClient.BillingResponseCode.OK -> {
                            val report = processUpdates(purchases.orEmpty())
                            publish(report, false)
                        }
                        BillingClient.BillingResponseCode.USER_CANCELED -> publish(BillingStatus.READY, false)
                        BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> refresh()
                        else -> publish(BillingStatus.ERROR, false)
                    }
                }
            }
        }
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    fun refresh() {
        purchaseInFlight = false
        synchronizePurchases(restoring = false)
    }
    fun restore() = synchronizePurchases(restoring = true)

    private fun synchronizePurchases(restoring: Boolean) {
        if (operation?.isActive == true) return
        operation = scope.launch {
            mutex.withLock {
                publish(BillingStatus.LOADING, true)
                if (!store.verifier.configured || !hasNetwork() || !connect()) {
                    offers.clear()
                    flow.update { it.copy(yearlyPrice = null, monthlyPrice = null, yearlyMicros = null, monthlyMicros = null, currency = null) }
                    publish(BillingStatus.UNAVAILABLE, false)
                    return@withLock
                }
                val ownershipStatus = queryOwnership()
                loadOffers()
                val status = when {
                    ownershipStatus != BillingStatus.READY -> ownershipStatus
                    restoring && store.access() != SupporterAccess.FREE -> BillingStatus.RESTORED
                    restoring -> BillingStatus.NOTHING_TO_RESTORE
                    offers.isEmpty() && store.access() == SupporterAccess.FREE -> BillingStatus.UNAVAILABLE
                    else -> BillingStatus.READY
                }
                publish(status, false)
            }
        }
    }

    fun purchase(activity: Activity, plan: SupporterPlan) {
        // No upsell to people who already own either plan, including a still-active cancellation.
        if (activity.isFinishing || activity.isDestroyed || flow.value.busy || flow.value.status == BillingStatus.PENDING ||
            purchaseInFlight || store.access() != SupporterAccess.FREE) return
        val offer = offers[plan] ?: return
        if (!store.verifier.configured || System.currentTimeMillis() - offersAt !in 0..OFFER_MAX_AGE_MS) {
            refresh()
            return
        }
        operation = scope.launch {
            mutex.withLock {
                publish(BillingStatus.LOADING, true)
                // Prevent a second charge if another device bought it after this screen loaded.
                if (!hasNetwork() || !connect()) {
                    publish(BillingStatus.ERROR, false)
                    return@withLock
                }
                val ownershipStatus = queryOwnership()
                if (ownershipStatus != BillingStatus.READY) {
                    publish(ownershipStatus, false)
                    return@withLock
                }
                if (store.access() != SupporterAccess.FREE || activity.isFinishing || activity.isDestroyed) {
                    publish(BillingStatus.READY, false)
                    return@withLock
                }
                val item = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(offer.details).apply { offer.token?.let(::setOfferToken) }.build()
                purchaseInFlight = true
                val result = client.launchBillingFlow(activity, BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(item)).build())
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    purchaseInFlight = false
                    publish(if (result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) BillingStatus.READY else BillingStatus.ERROR, false)
                }
                // A successful launch waits for the listener or the next foreground ownership query.
            }
        }
    }

    fun manage(activity: Activity) {
        val uri = Uri.parse("https://play.google.com/store/account/subscriptions")
            .buildUpon().apply { store.access().plan?.let { appendQueryParameter("sku", it.productId) } }
            .appendQueryParameter("package", app.packageName).build()
        try { activity.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
        catch (_: ActivityNotFoundException) { publish(BillingStatus.ERROR, false) }
    }

    private suspend fun connect(): Boolean {
        if (client.isReady) return true
        return withTimeoutOrNull(REQUEST_TIMEOUT_MS) {
            suspendCancellableCoroutine { continuation ->
                client.startConnection(object : BillingClientStateListener {
                    override fun onBillingSetupFinished(result: BillingResult) {
                        if (continuation.isActive) continuation.resume(result.responseCode == BillingClient.BillingResponseCode.OK)
                    }
                    override fun onBillingServiceDisconnected() = Unit // SDK reconnects on the next request.
                })
            }
        } ?: false
    }

    private fun hasNetwork(): Boolean {
        val manager = app.getSystemService(ConnectivityManager::class.java)
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private suspend fun queryOwnership(): BillingStatus {
        var status = BillingStatus.READY
        // Both plans are subscriptions. One successful snapshot decides ownership for both.
        val result = withTimeoutOrNull(REQUEST_TIMEOUT_MS) {
            suspendCancellableCoroutine<Pair<BillingResult, List<Purchase>>> { continuation ->
                val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
                client.queryPurchasesAsync(params) { response, purchases ->
                    if (continuation.isActive) continuation.resume(response to purchases)
                }
            }
        }
        // Transient failures preserve the bounded cache. An offline Play cache must not renew it.
        if (result == null || result.first.responseCode != BillingClient.BillingResponseCode.OK || !hasNetwork()) {
            return BillingStatus.ERROR
        }
        for (plan in SupporterPlan.entries) {
            val purchases = result.second.filter { plan.productId in it.products }
            val active = purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED && !it.isSuspended }
            var evidence: PurchaseEvidence? = null
            for (purchase in active) {
                val proof = verifyAndAcknowledge(purchase)
                if (proof != null) evidence = proof else status = BillingStatus.ERROR
            }
            // Revoke only after a successful authoritative query, including expired/refunded items.
            if (active.isEmpty() || evidence != null) store.replace(plan, evidence)
            if (purchases.any { it.purchaseState == Purchase.PurchaseState.PENDING } && status != BillingStatus.ERROR) status = BillingStatus.PENDING
        }
        return status
    }

    private suspend fun processUpdates(purchases: List<Purchase>): BillingStatus {
        var status = BillingStatus.READY
        for (purchase in purchases) {
            if (purchase.products.none { id -> SupporterPlan.entries.any { it.productId == id } }) continue
            if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
                status = BillingStatus.PENDING
                continue
            }
            if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED || purchase.isSuspended) continue
            val evidence = verifyAndAcknowledge(purchase)
            val plan = evidence?.let { store.verifier.verify(it.json, it.signature)?.plan }
            if (plan != null) store.replace(plan, evidence) else status = BillingStatus.ERROR
        }
        return status
    }

    private suspend fun verifyAndAcknowledge(purchase: Purchase): PurchaseEvidence? {
        val proof = store.verifier.verify(purchase.originalJson, purchase.signature) ?: return null
        if (proof.token != purchase.purchaseToken || proof.plan.productId !in purchase.products) return null
        if (!hasNetwork()) return null
        if (!purchase.isAcknowledged) {
            val acknowledged = withTimeoutOrNull(REQUEST_TIMEOUT_MS) {
                suspendCancellableCoroutine { continuation ->
                    client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(proof.token).build()) { result ->
                        if (continuation.isActive) continuation.resume(result.responseCode == BillingClient.BillingResponseCode.OK)
                    }
                }
            } ?: false
            if (!acknowledged) return null // Query on resume/restore retries delivery; never consume it.
        }
        return PurchaseEvidence(purchase.originalJson, purchase.signature, System.currentTimeMillis())
    }

    private suspend fun loadOffers() {
        offers.clear()
        for (plan in SupporterPlan.entries) {
            val details = withTimeoutOrNull(REQUEST_TIMEOUT_MS) {
                suspendCancellableCoroutine<List<ProductDetails>> { continuation ->
                    val item = QueryProductDetailsParams.Product.newBuilder().setProductId(plan.productId).setProductType(BillingClient.ProductType.SUBS).build()
                    client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(listOf(item)).build()) { result, query ->
                        if (continuation.isActive) continuation.resume(if (result.responseCode == BillingClient.BillingResponseCode.OK) query.productDetailsList else emptyList())
                    }
                }
            }.orEmpty().firstOrNull { it.productId == plan.productId } ?: continue
            val option = details.subscriptionOfferDetails?.firstOrNull {
                it.basePlanId == plan.basePlanId && it.offerId == null &&
                    it.pricingPhases.pricingPhaseList.size == 1 && it.pricingPhases.pricingPhaseList.single().let { phase ->
                        phase.billingPeriod == plan.billingPeriod && phase.priceAmountMicros > 0 &&
                            phase.recurrenceMode == ProductDetails.RecurrenceMode.INFINITE_RECURRING
                    }
                }
            if (option != null) {
                val phase = option.pricingPhases.pricingPhaseList.single()
                offers[plan] = Offer(details, option.offerToken, phase.formattedPrice,
                    phase.priceAmountMicros, phase.priceCurrencyCode)
            }
        }
        offersAt = System.currentTimeMillis()
        val yearly = offers[SupporterPlan.YEARLY]
        val monthly = offers[SupporterPlan.MONTHLY]
        // Only carry a currency when both plans quote the same one, so the sheet never compares
        // two different currencies against each other.
        val shared = yearly?.currency?.takeIf { it == monthly?.currency }
        flow.update {
            it.copy(
                yearlyPrice = yearly?.price, monthlyPrice = monthly?.price,
                yearlyMicros = yearly?.micros, monthlyMicros = monthly?.micros, currency = shared,
            )
        }
    }

    private fun publish(status: BillingStatus, busy: Boolean) {
        val access = store.access()
        val changed = access != flow.value.access
        flow.update { it.copy(access = access, status = status, busy = busy) }
        if (changed) refreshWidgets()
        expiry?.cancel()
        access.plan?.let { plan ->
            val checked = store.read(plan)?.checkedAt ?: return
            expiry = scope.launch {
                delay((checked + EntitlementPolicy.SUBSCRIPTION_OFFLINE_MS - System.currentTimeMillis()).coerceAtLeast(1))
                refresh() // An unsuccessful refresh lets the bounded offline access expire.
            }
        }
    }

    private fun refreshWidgets() {
        val manager = AppWidgetManager.getInstance(app)
        WidgetKind.entries.forEach { kind ->
            val component = ComponentName(app, kind.providerClass)
            val ids = manager.getAppWidgetIds(component)
            if (ids.isNotEmpty()) app.sendBroadcast(Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .setComponent(component).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids))
        }
    }

    companion object {
        private const val REQUEST_TIMEOUT_MS = 15_000L
        private const val OFFER_MAX_AGE_MS = 15 * 60 * 1000L
        @Volatile private var instance: SupporterBilling? = null
        fun get(context: Context): SupporterBilling = instance ?: synchronized(this) {
            instance ?: SupporterBilling(context).also { instance = it }
        }
        fun hasAccess(context: Context): Boolean = SupporterStore.get(context).access() != SupporterAccess.FREE
    }
}
