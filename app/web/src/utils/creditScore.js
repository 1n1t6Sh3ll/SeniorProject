/**
 * Credit Score Simulation Layer
 *
 * FICO-inspired 300-850 credit score computed from on-chain position
 * data and localStorage loan/deposit history.
 */

import { getLoanData } from './interest';
import { getFirstDepositTime } from './supplyYield';

const SCORE_MIN = 300;
const SCORE_MAX = 850;
const SCORE_RANGE = SCORE_MAX - SCORE_MIN;

// Weight distribution (must sum to 1.0)
const WEIGHTS = {
    repaymentHistory: 0.35,
    utilization: 0.30,
    accountAge: 0.15,
    collateralDiversity: 0.10,
    creditTier: 0.10,
};

/**
 * Calculate credit score from position and history
 * @param {Object} position - getUserPosition result with parsed values
 * @param {string} address - user address for localStorage lookups
 * @returns {{ score, breakdown }}
 */
export function calculateCreditScore(position, address) {
    const loanData = getLoanData(address);
    const firstDeposit = getFirstDepositTime(address);

    // 1. Repayment History (35%) - on-time repayments vs missed
    const repayments = position?.successfulRepayments || 0;
    const missedPayments = loanData?.borrows?.length
        ? Math.max(0, loanData.borrows.length - (loanData.repayments?.length || 0))
        : 0;
    const totalEvents = repayments + missedPayments;
    let repaymentScore;
    if (totalEvents === 0) {
        repaymentScore = 0.5; // neutral if no history
    } else {
        repaymentScore = Math.min(1, repayments / Math.max(totalEvents, 1));
        // Bonus for high repayment count
        if (repayments >= 10) repaymentScore = Math.min(1, repaymentScore + 0.1);
    }

    // 2. Utilization Ratio (30%) - lower is better
    const debt = position?.debtAmount ? parseFloat(position.debtAmount) : 0;
    const maxBorrow = position?.maxBorrow ? parseFloat(position.maxBorrow) : 0;
    let utilizationScore;
    if (maxBorrow <= 0) {
        utilizationScore = 1; // no borrowing capacity = perfect (no debt possible)
    } else {
        const utilization = debt / maxBorrow;
        if (utilization <= 0.1) utilizationScore = 1;
        else if (utilization <= 0.3) utilizationScore = 0.9;
        else if (utilization <= 0.5) utilizationScore = 0.7;
        else if (utilization <= 0.7) utilizationScore = 0.5;
        else if (utilization <= 0.9) utilizationScore = 0.3;
        else utilizationScore = 0.1;
    }

    // 3. Account Age (15%) - days since first deposit
    let accountAgeScore = 0;
    if (firstDeposit) {
        const daysActive = (Date.now() - firstDeposit) / (1000 * 60 * 60 * 24);
        if (daysActive >= 365) accountAgeScore = 1;
        else if (daysActive >= 180) accountAgeScore = 0.8;
        else if (daysActive >= 90) accountAgeScore = 0.6;
        else if (daysActive >= 30) accountAgeScore = 0.4;
        else if (daysActive >= 7) accountAgeScore = 0.2;
        else accountAgeScore = 0.1;
    }

    // 4. Collateral Diversity (10%) - bonus for both ETH + WBTC
    const hasEth = position?.ethCollateral > 0;
    const hasWbtc = position?.wbtcCollateral > 0;
    let diversityScore = 0;
    if (hasEth && hasWbtc) diversityScore = 1;
    else if (hasEth || hasWbtc) diversityScore = 0.5;

    // 5. Credit Tier (10%) - direct from contract
    const tier = position?.creditTier || 1;
    const tierScore = tier === 3 ? 1 : tier === 2 ? 0.6 : 0.3;

    // Weighted sum -> [0, 1] -> scale to [300, 850]
    const weightedSum =
        repaymentScore * WEIGHTS.repaymentHistory +
        utilizationScore * WEIGHTS.utilization +
        accountAgeScore * WEIGHTS.accountAge +
        diversityScore * WEIGHTS.collateralDiversity +
        tierScore * WEIGHTS.creditTier;

    const score = Math.round(SCORE_MIN + weightedSum * SCORE_RANGE);

    return {
        score: Math.max(SCORE_MIN, Math.min(SCORE_MAX, score)),
        breakdown: {
            repaymentHistory: { score: repaymentScore, weight: WEIGHTS.repaymentHistory, label: 'Repayment History' },
            utilization: { score: utilizationScore, weight: WEIGHTS.utilization, label: 'Utilization' },
            accountAge: { score: accountAgeScore, weight: WEIGHTS.accountAge, label: 'Account Age' },
            collateralDiversity: { score: diversityScore, weight: WEIGHTS.collateralDiversity, label: 'Collateral Diversity' },
            creditTier: { score: tierScore, weight: WEIGHTS.creditTier, label: 'Credit Tier' },
        },
    };
}

/**
 * Get breakdown as an array for rendering
 */
export function getScoreBreakdown(position, address) {
    const { breakdown } = calculateCreditScore(position, address);
    return Object.values(breakdown);
}

/**
 * Get label for a given score
 */
export function getScoreLabel(score) {
    if (score >= 750) return 'Excellent';
    if (score >= 700) return 'Good';
    if (score >= 650) return 'Fair';
    if (score >= 550) return 'Poor';
    return 'Very Poor';
}

/**
 * Get color for a given score
 */
export function getScoreColor(score) {
    if (score >= 750) return '#10b981'; // green
    if (score >= 700) return '#00d4aa'; // teal
    if (score >= 650) return '#f0b429'; // yellow/amber
    if (score >= 550) return '#f97316'; // orange
    return '#ef4444';                   // red
}
