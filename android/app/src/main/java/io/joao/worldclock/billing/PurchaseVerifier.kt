package io.joao.worldclock.billing

import org.json.JSONObject
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/** Client-only signature verification. No purchase token or receipt is sent to our servers. */
internal class PurchaseVerifier(publicKey: String, private val packageName: String) {
    private val key = runCatching {
        KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(publicKey)))
    }.getOrNull()
    val configured: Boolean get() = key != null

    fun verify(json: String, signature: String): VerifiedPurchase? = runCatching {
        val publicKey = key ?: return null
        if (json.isBlank() || signature.isBlank()) return null
        val checker = Signature.getInstance("SHA1withRSA")
        checker.initVerify(publicKey)
        checker.update(json.toByteArray(Charsets.UTF_8))
        if (!checker.verify(Base64.getDecoder().decode(signature))) return null
        val receipt = JSONObject(json)
        // The wire format uses 0 for purchased, 4 for pending. BillingClient's enum differs.
        if (receipt.optInt("purchaseState", -1) != 0 || receipt.optString("packageName") != packageName) return null
        val productIds = receipt.optJSONArray("productIds")
        if (productIds != null && productIds.length() != 1) return null
        val product = productIds?.optString(0) ?: receipt.optString("productId")
        val plan = SupporterPlan.entries.firstOrNull { it.productId == product } ?: return null
        val token = receipt.optString("token").ifBlank { receipt.optString("purchaseToken") }
        val time = receipt.optLong("purchaseTime", 0)
        if (token.isBlank() || time <= 0 || receipt.optInt("quantity", 1) != 1) return null
        VerifiedPurchase(plan, token, time)
    }.getOrNull()
}
