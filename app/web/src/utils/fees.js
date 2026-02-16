/**
 * Frontend Fee Simulation Layer
 *
 * All fees are simulated and displayed but not deducted on-chain.
 * Matches the pattern of utils/interest.js for frontend-only calculations.
 */

import { getAPRForTier } from './interest';

// Fee rates
const ORIGINATION_FEE_RATE = 0.005;   // 0.5% of borrow amount
const WITHDRAWAL_FEE_RATE = 0.001;    // 0.1% of withdrawal value
const LATE_FEE_FLAT = 25;             // $25 USDX equivalent
const EXPRESS_FEE_RATE = 0.002;       // 0.2% for priority processing
const MONTHLY_MAINTENANCE_FEE = 5;    // $5 if inactive 30+ days
const GRACE_PERIOD_DAYS = 30;

/**
 * Calculate origination fee for a borrow amount
 */
export function calculateOriginationFee(amount) {
    const parsed = parseFloat(amount) || 0;
    return parsed * ORIGINATION_FEE_RATE;
}

/**
 * Calculate withdrawal fee based on asset and amount
 */
export function calculateWithdrawalFee(amount, asset, prices) {
    const parsed = parseFloat(amount) || 0;
    if (!prices) return 0;
    const price = asset === 'ETH' ? prices.ethPrice : prices.wbtcPrice;
    const usdValue = parsed * price;
    return usdValue * WITHDRAWAL_FEE_RATE;
}

/**
 * Calculate late fee based on loan data
 * Returns flat $25 if past grace period without payment
 */
export function calculateLateFee(loanData) {
    if (!loanData || !loanData.firstBorrowTime) return 0;
    const now = Date.now();
    const lastActivity = loanData.lastRepayTime || loanData.firstBorrowTime;
    const daysSince = (now - lastActivity) / (1000 * 60 * 60 * 24);
    if (daysSince > GRACE_PERIOD_DAYS) return LATE_FEE_FLAT;
    return 0;
}

/**
 * Get the full fee schedule for display
 */
export function getFeeSchedule() {
    return [
        {
            name: 'Origination Fee',
            rate: ORIGINATION_FEE_RATE,
            description: 'Applied to new borrows',
            display: `${(ORIGINATION_FEE_RATE * 100).toFixed(1)}%`,
        },
        {
            name: 'Withdrawal Fee',
            rate: WITHDRAWAL_FEE_RATE,
            description: 'Applied to collateral withdrawals',
            display: `${(WITHDRAWAL_FEE_RATE * 100).toFixed(1)}%`,
        },
        {
            name: 'Late Payment Fee',
            rate: null,
            description: `Flat fee after ${GRACE_PERIOD_DAYS}-day grace period`,
            display: `$${LATE_FEE_FLAT} USDX`,
        },
        {
            name: 'Express Processing',
            rate: EXPRESS_FEE_RATE,
            description: 'Priority transaction processing',
            display: `${(EXPRESS_FEE_RATE * 100).toFixed(1)}%`,
        },
        {
            name: 'Monthly Maintenance',
            rate: null,
            description: 'Charged if account inactive 30+ days',
            display: `$${MONTHLY_MAINTENANCE_FEE}`,
        },
    ];
}

/**
 * Calculate total borrow cost including origination fee + estimated interest
 */
export function calculateTotalBorrowCost(amount, tier, months) {
    const parsed = parseFloat(amount) || 0;
    const origination = calculateOriginationFee(parsed);
    const apr = getAPRForTier(tier);
    const monthlyRate = apr / 12;
    const days = months * 30;
    const dailyRate = apr / 365;
    const estimatedInterest = parsed * (Math.pow(1 + dailyRate, days) - 1);

    return {
        principal: parsed,
        originationFee: origination,
        estimatedInterest,
        totalCost: parsed + origination + estimatedInterest,
        apr,
        months,
    };
}
