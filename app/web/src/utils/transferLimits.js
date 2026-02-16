/**
 * Transfer Limits Simulation Layer
 *
 * Daily and per-transaction limits based on credit tier.
 * Tracks daily totals in localStorage, auto-resets at midnight.
 */

const STORAGE_KEY = 'cryptocredit_daily_transfers';

const TIER_LIMITS = {
    1: { perTx: 1000, daily: 5000 },
    2: { perTx: 5000, daily: 25000 },
    3: { perTx: 25000, daily: 100000 },
};

/**
 * Get transfer limits for a tier
 */
export function getTransferLimits(tier) {
    return TIER_LIMITS[tier] || TIER_LIMITS[1];
}

/**
 * Get today's transfer data, auto-reset if stale
 */
function getTodayData() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const today = new Date().toISOString().split('T')[0];
        if (data.date !== today) {
            return { date: today, totalUSD: 0, transfers: [] };
        }
        return data;
    } catch {
        return { date: new Date().toISOString().split('T')[0], totalUSD: 0, transfers: [] };
    }
}

function saveTodayData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
}

/**
 * Check if a transfer is within limits
 * Returns { allowed, reason, perTxLimit, dailyLimit, dailyUsed, dailyRemaining }
 */
export function checkTransferLimit(amountUSD, tier) {
    const limits = getTransferLimits(tier);
    const data = getTodayData();
    const dailyRemaining = Math.max(0, limits.daily - data.totalUSD);

    if (amountUSD > limits.perTx) {
        return {
            allowed: false,
            reason: `Exceeds per-transaction limit of $${limits.perTx.toLocaleString()}`,
            perTxLimit: limits.perTx,
            dailyLimit: limits.daily,
            dailyUsed: data.totalUSD,
            dailyRemaining,
        };
    }

    if (amountUSD > dailyRemaining) {
        return {
            allowed: false,
            reason: `Exceeds daily limit. Remaining: $${dailyRemaining.toLocaleString()}`,
            perTxLimit: limits.perTx,
            dailyLimit: limits.daily,
            dailyUsed: data.totalUSD,
            dailyRemaining,
        };
    }

    return {
        allowed: true,
        reason: null,
        perTxLimit: limits.perTx,
        dailyLimit: limits.daily,
        dailyUsed: data.totalUSD,
        dailyRemaining,
    };
}

/**
 * Get daily remaining transfer amount
 */
export function getDailyRemaining(tier) {
    const limits = getTransferLimits(tier);
    const data = getTodayData();
    return Math.max(0, limits.daily - data.totalUSD);
}

/**
 * Record a transfer (call after successful send)
 */
export function recordTransfer(amountUSD) {
    const data = getTodayData();
    data.totalUSD += parseFloat(amountUSD) || 0;
    data.transfers.push({ amount: parseFloat(amountUSD), timestamp: Date.now() });
    saveTodayData(data);
}

/**
 * Get daily usage percentage
 */
export function getDailyUsagePercent(tier) {
    const limits = getTransferLimits(tier);
    const data = getTodayData();
    return Math.min(100, (data.totalUSD / limits.daily) * 100);
}
