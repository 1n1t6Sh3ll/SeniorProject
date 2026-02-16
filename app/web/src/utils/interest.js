/**
 * Frontend Interest Simulation Layer
 *
 * The smart contracts have no interest mechanics - debt is static.
 * This module simulates realistic DeFi interest rates, accrual,
 * repayment plans, and late payment penalties using localStorage
 * to track borrow timestamps.
 */

const STORAGE_KEY = 'cryptocredit_loan_data';

// Annual Percentage Rates by Credit Tier (lower tier = higher risk = higher rate)
const TIER_APR = {
    1: 0.12,    // 12% APR - Bronze (new borrowers, highest risk)
    2: 0.08,    // 8% APR  - Silver (3+ repayments)
    3: 0.05,    // 5% APR  - Gold (10+ repayments, lowest risk)
};

// Penalty rates
const LATE_PENALTY_RATE = 0.02;     // +2% penalty APR after grace period
const GRACE_PERIOD_DAYS = 30;       // Days before late penalties apply
const COMPOUND_INTERVAL = 86400;    // Compound daily (seconds)

// Repayment plan options
const PLAN_DURATIONS = [3, 6, 12];  // months

/**
 * Get stored loan data for an address
 */
export function getLoanData(address) {
    if (!address) return null;
    try {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return all[address.toLowerCase()] || null;
    } catch {
        return null;
    }
}

/**
 * Save loan data for an address
 */
function saveLoanData(address, data) {
    if (!address) return;
    try {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        all[address.toLowerCase()] = data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {}
}

/**
 * Record a new borrow event (call after successful borrow tx)
 */
export function recordBorrow(address, amount, creditTier) {
    const existing = getLoanData(address) || {
        borrows: [],
        repayments: [],
        totalBorrowed: 0,
        totalRepaid: 0,
        firstBorrowTime: null,
        lastRepayTime: null,
    };

    const now = Date.now();
    existing.borrows.push({
        amount: parseFloat(amount),
        timestamp: now,
        tier: creditTier || 1,
    });
    existing.totalBorrowed += parseFloat(amount);
    if (!existing.firstBorrowTime) existing.firstBorrowTime = now;

    saveLoanData(address, existing);
}

/**
 * Record a repayment event (call after successful repay tx)
 */
export function recordRepayment(address, amount) {
    const existing = getLoanData(address);
    if (!existing) return;

    const now = Date.now();
    existing.repayments.push({
        amount: parseFloat(amount),
        timestamp: now,
    });
    existing.totalRepaid += parseFloat(amount);
    existing.lastRepayTime = now;

    // If fully repaid, clear borrows
    if (existing.totalRepaid >= existing.totalBorrowed) {
        existing.borrows = [];
        existing.totalBorrowed = 0;
        existing.totalRepaid = 0;
        existing.firstBorrowTime = null;
    }

    saveLoanData(address, existing);
}

/**
 * Calculate accrued interest on current debt
 * Uses continuous compounding: A = P * e^(rt)
 */
export function calculateAccruedInterest(address, currentDebt, creditTier) {
    if (!currentDebt || currentDebt <= 0) return {
        principal: 0,
        interest: 0,
        totalOwed: 0,
        dailyRate: 0,
        apr: 0,
        penaltyApplied: false,
        daysActive: 0,
        daysSinceRepayment: null,
    };

    const loanData = getLoanData(address);
    const now = Date.now();
    const tier = creditTier || 1;
    const baseAPR = TIER_APR[tier] || TIER_APR[1];

    // If no tracked borrow data, estimate from first borrow = 7 days ago
    let borrowStart = now - (7 * 24 * 60 * 60 * 1000);
    if (loanData && loanData.firstBorrowTime) {
        borrowStart = loanData.firstBorrowTime;
    }

    const elapsedMs = now - borrowStart;
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    const elapsedYears = elapsedDays / 365;

    // Check for late penalty
    let penaltyApplied = false;
    let effectiveAPR = baseAPR;

    if (loanData) {
        const lastActivity = loanData.lastRepayTime || loanData.firstBorrowTime;
        if (lastActivity) {
            const daysSinceLast = (now - lastActivity) / (1000 * 60 * 60 * 24);
            if (daysSinceLast > GRACE_PERIOD_DAYS) {
                effectiveAPR += LATE_PENALTY_RATE;
                penaltyApplied = true;
            }
        }
    }

    // Daily compound interest: A = P * (1 + r/365)^(days)
    const dailyRate = effectiveAPR / 365;
    const compoundFactor = Math.pow(1 + dailyRate, elapsedDays);
    const totalOwed = currentDebt * compoundFactor;
    const interest = totalOwed - currentDebt;

    const daysSinceRepayment = loanData?.lastRepayTime
        ? Math.floor((now - loanData.lastRepayTime) / (1000 * 60 * 60 * 24))
        : null;

    return {
        principal: currentDebt,
        interest: Math.max(0, interest),
        totalOwed,
        dailyRate,
        apr: effectiveAPR,
        baseAPR,
        penaltyAPR: penaltyApplied ? LATE_PENALTY_RATE : 0,
        penaltyApplied,
        daysActive: Math.floor(elapsedDays),
        daysSinceRepayment,
        gracePeriodDays: GRACE_PERIOD_DAYS,
        daysUntilPenalty: penaltyApplied ? 0 : Math.max(0, GRACE_PERIOD_DAYS - (daysSinceRepayment || Math.floor(elapsedDays))),
    };
}

/**
 * Generate repayment plan options
 * Returns plans for 3, 6, and 12 month durations
 */
export function generateRepaymentPlans(totalOwed, apr) {
    if (!totalOwed || totalOwed <= 0) return [];

    const monthlyRate = apr / 12;

    return PLAN_DURATIONS.map(months => {
        // Monthly payment using amortization formula:
        // M = P * [r(1+r)^n] / [(1+r)^n - 1]
        let monthlyPayment;
        if (monthlyRate === 0) {
            monthlyPayment = totalOwed / months;
        } else {
            const factor = Math.pow(1 + monthlyRate, months);
            monthlyPayment = totalOwed * (monthlyRate * factor) / (factor - 1);
        }

        const totalPayment = monthlyPayment * months;
        const totalInterest = totalPayment - totalOwed;

        // Generate schedule
        const schedule = [];
        let balance = totalOwed;
        for (let i = 1; i <= months; i++) {
            const interestPayment = balance * monthlyRate;
            const principalPayment = monthlyPayment - interestPayment;
            balance = Math.max(0, balance - principalPayment);
            schedule.push({
                month: i,
                payment: monthlyPayment,
                principal: principalPayment,
                interest: interestPayment,
                balance,
            });
        }

        return {
            months,
            monthlyPayment,
            totalPayment,
            totalInterest,
            schedule,
            label: months === 3 ? 'Aggressive' : months === 6 ? 'Standard' : 'Extended',
        };
    });
}

/**
 * Calculate minimum payment (interest-only for the period)
 */
export function calculateMinimumPayment(currentDebt, apr) {
    if (!currentDebt || currentDebt <= 0) return 0;
    // Minimum = 1 month of interest or $1, whichever is greater
    const monthlyInterest = currentDebt * (apr / 12);
    return Math.max(monthlyInterest, 1);
}

/**
 * Get APR for a given credit tier
 */
export function getAPRForTier(tier) {
    return TIER_APR[tier] || TIER_APR[1];
}

/**
 * Get all tier rates for display
 */
export function getAllTierRates() {
    return [
        { tier: 1, name: 'Bronze', apr: TIER_APR[1], ltvBonus: 0 },
        { tier: 2, name: 'Silver', apr: TIER_APR[2], ltvBonus: 5 },
        { tier: 3, name: 'Gold', apr: TIER_APR[3], ltvBonus: 10 },
    ];
}

/**
 * Format APR as percentage string
 */
export function formatAPR(apr) {
    return (apr * 100).toFixed(1) + '%';
}

/**
 * Estimate interest for a given amount over time (for borrow preview)
 */
export function estimateInterest(amount, tier, days) {
    const apr = TIER_APR[tier] || TIER_APR[1];
    const dailyRate = apr / 365;
    const interest = amount * (Math.pow(1 + dailyRate, days) - 1);
    return { interest, total: amount + interest, apr, dailyRate };
}
