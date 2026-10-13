package io.joao.worldclock

import io.joao.worldclock.billing.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

/** Real RSA signatures exercise the trust boundary; no production unlock or fake billing mode. */
class SupporterBillingTest {
    private val verifier = PurchaseVerifier(publicKey, "io.joao.worldclock")
    private fun receipt(plan: SupporterPlan = SupporterPlan.YEARLY) = JSONObject()
        .put("packageName", "io.joao.worldclock").put("productId", plan.productId)
        .put("purchaseState", 0).put("purchaseToken", "test-receipt-token")
        .put("purchaseTime", 1_800_000_000_000L).put("quantity", 1)
    private fun sign(json: String): String = Signature.getInstance("SHA1withRSA").run {
        initSign(pair.private); update(json.toByteArray(Charsets.UTF_8))
        Base64.getEncoder().encodeToString(sign())
    }
    private fun verified(json: JSONObject): VerifiedPurchase? = json.toString().let { verifier.verify(it, sign(it)) }

    @Test fun acceptsBothProductsOnlyWithValidPlayStyleSignature() {
        SupporterPlan.entries.forEach { plan ->
            val proof = verified(receipt(plan))!!
            assertEquals(plan, proof.plan)
            assertEquals("test-receipt-token", proof.token)
        }
    }

    @Test fun handlesProductArrayAndLegacyTokenWithoutAllowingBundles() {
        val value = receipt().apply {
            remove("productId"); remove("purchaseToken")
            put("productIds", JSONArray().put(SupporterPlan.YEARLY.productId)); put("token", "legacy")
        }
        assertEquals("legacy", verified(value)?.token)
        value.getJSONArray("productIds").put(SupporterPlan.MONTHLY.productId)
        assertNull(verified(value))
    }

    @Test fun tamperedUnsignedAndWrongKeyReceiptsNeverUnlock() {
        val json = receipt().toString()
        assertNull(verifier.verify(json.replace("supporter_yearly", "supporter_monthly"), sign(json)))
        assertNull(verifier.verify(json, ""))
        assertNull(verifier.verify(json, "not base64"))
        val other = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        assertNull(PurchaseVerifier(Base64.getEncoder().encodeToString(other.public.encoded), "io.joao.worldclock").verify(json, sign(json)))
        assertFalse(PurchaseVerifier("", "io.joao.worldclock").configured)
        assertFalse(PurchaseVerifier("missing-console-key", "io.joao.worldclock").configured)
    }

    @Test fun pendingCancelledForeignOrMalformedReceiptsNeverUnlock() {
        assertNull(verified(receipt().put("purchaseState", 4)))
        assertNull(verified(receipt().put("purchaseState", 1)))
        assertNull(verified(receipt().apply { remove("purchaseState") }))
        assertNull(verified(receipt().put("packageName", "another.app")))
        assertNull(verified(receipt().put("productId", "unknown")))
        assertNull(verified(receipt().put("purchaseToken", "")))
        assertNull(verified(receipt().put("purchaseTime", 0)))
        assertNull(verified(receipt().put("quantity", 2)))
        assertNull(verifier.verify("not-json", sign("not-json")))
    }

    @Test fun bothSubscriptionsRequireRecentActiveQueryAndRejectClockRollback() {
        val checked = 1_800_000_000_000L
        assertEquals(SupporterAccess.FREE, EntitlementPolicy.access(null, null, checked))
        listOf(SupporterAccess.YEARLY, SupporterAccess.MONTHLY).forEach { access ->
            fun at(now: Long) = EntitlementPolicy.access(
                checked.takeIf { access == SupporterAccess.YEARLY }, checked.takeIf { access == SupporterAccess.MONTHLY }, now)
            assertEquals(access, at(checked))
            assertEquals(access, at(checked + EntitlementPolicy.SUBSCRIPTION_OFFLINE_MS - 1))
            assertEquals(SupporterAccess.FREE, at(checked + EntitlementPolicy.SUBSCRIPTION_OFFLINE_MS))
            assertEquals(SupporterAccess.FREE, at(checked - 1))
        }
    }

    @Test fun yearlyNeverGrantsPermanentAccessAndExpiredYearlyDoesNotMaskMonthly() {
        val checked = 1_800_000_000_000L
        assertEquals(SupporterAccess.YEARLY, EntitlementPolicy.access(checked, checked, checked))
        assertEquals(SupporterAccess.FREE, EntitlementPolicy.access(checked, null, Long.MAX_VALUE))
        assertEquals(SupporterAccess.MONTHLY, EntitlementPolicy.access(checked - EntitlementPolicy.SUBSCRIPTION_OFFLINE_MS, checked, checked))
        assertFalse(SupporterState().hasAccess)
        assertTrue(SupporterState(access = SupporterAccess.MONTHLY).hasAccess)
        assertTrue(SupporterState(access = SupporterAccess.YEARLY).hasAccess)
    }

    @Test fun retiredLifetimeProductCannotBeRestoredAsAYearlySubscription() {
        assertNull(verified(receipt().put("productId", "supporter_lifetime")))
    }

    companion object {
        private val pair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        private val publicKey = Base64.getEncoder().encodeToString(pair.public.encoded)
    }
}
