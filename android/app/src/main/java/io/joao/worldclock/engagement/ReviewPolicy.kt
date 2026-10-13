package io.joao.worldclock.engagement

/** Local-only pacing. A dismissed or quota-hidden request has the same cooldown as a shown one. */
object ReviewPolicy {
    private const val DAY = 86_400_000L
    fun eligible(now: Long, firstUse: Long, activeDays: Int, meaningfulUses: Int, lastAttempt: Long): Boolean =
        now >= firstUse && now - firstUse >= 7 * DAY && activeDays >= 3 && meaningfulUses >= 5 &&
            (lastAttempt == 0L || now >= lastAttempt && now - lastAttempt >= 180 * DAY)
}
