/**
 * Supply Yield Simulation Layer
 *
 * Simulates savings/yield on deposited collateral.
 * ETH earns staking yield, WBTC earns lending market yield.
 * Tracks deposits in localStorage for yield calculation.
 */

const STORAGE_KEY = 'cryptocredit_deposits';

const SUPPLY_APY = {
    ETH: 0.025,   // 2.5% APY (staking yield)
    WBTC: 0.008,  // 0.8% APY (lending market)
};

/**
 * Get supply APY for an asset
 */
export function getSupplyAPY(asset) {
    return SUPPLY_APY[asset] || 0;
}

/**
 * Record a deposit event
 */
export function recordDeposit(asset, amount, address) {
    if (!address || !amount) return;
    try {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const key = address.toLowerCase();
        if (!all[key]) all[key] = { deposits: [], firstDepositTime: null };

        const now = Date.now();
        all[key].deposits.push({
            asset,
            amount: parseFloat(amount),
            timestamp: now,
        });
        if (!all[key].firstDepositTime) all[key].firstDepositTime = now;

        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {}
}

/**
 * Get deposit history for an address
 */
export function getDepositHistory(address) {
    if (!address) return null;
    try {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return all[address.toLowerCase()] || null;
    } catch {
        return null;
    }
}

/**
 * Get the first deposit timestamp for an address
 */
export function getFirstDepositTime(address) {
    const data = getDepositHistory(address);
    return data?.firstDepositTime || null;
}

/**
 * Calculate earned yield on deposited collateral
 * Uses daily compounding: earned = principal * ((1 + apy/365)^days - 1)
 */
export function calculateEarnedYield(address, currentEthDeposited, currentWbtcDeposited, prices) {
    const data = getDepositHistory(address);
    if (!data || !data.firstDepositTime) {
        return { ethYield: 0, wbtcYield: 0, totalYieldUSD: 0 };
    }

    const now = Date.now();
    const daysSinceFirst = (now - data.firstDepositTime) / (1000 * 60 * 60 * 24);

    const ethApy = SUPPLY_APY.ETH;
    const wbtcApy = SUPPLY_APY.WBTC;

    const ethYield = (currentEthDeposited || 0) * (Math.pow(1 + ethApy / 365, daysSinceFirst) - 1);
    const wbtcYield = (currentWbtcDeposited || 0) * (Math.pow(1 + wbtcApy / 365, daysSinceFirst) - 1);

    const totalYieldUSD = (ethYield * (prices?.ethPrice || 0)) + (wbtcYield * (prices?.wbtcPrice || 0));

    return { ethYield, wbtcYield, totalYieldUSD, daysSinceFirst: Math.floor(daysSinceFirst) };
}

/**
 * Calculate projected yield for a given amount and time period
 */
export function getProjectedYield(amount, asset, days) {
    const parsed = parseFloat(amount) || 0;
    const apy = SUPPLY_APY[asset] || 0;
    const earned = parsed * (Math.pow(1 + apy / 365, days) - 1);
    return { earned, apy, days, principal: parsed };
}
