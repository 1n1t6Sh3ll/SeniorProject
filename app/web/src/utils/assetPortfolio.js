// Asset Portfolio — collateral, valuation, risk, enforcement (frontend-simulated, localStorage-based)

const LS_PURCHASES = 'cryptocredit_purchases';
const LS_COLLATERAL = 'cryptocredit_asset_collateral';
const LS_ENFORCEMENT = 'cryptocredit_enforcement';
const LS_ENFORCEMENT_HISTORY = 'cryptocredit_enforcement_history';

// Category appreciation/depreciation rates (annual, as decimal)
const CATEGORY_RATES = {
    nft:         { min: -0.30, max: 0.30 },   // volatile
    realestate:  { min: 0.05,  max: 0.15 },   // stable appreciation
    vehicles:    { min: -0.20, max: -0.10 },   // depreciation
    electronics: { min: -0.40, max: -0.20 },   // fast depreciation
    gaming:      { min: -0.25, max: 0.25 },    // volatile
    luxury:      { min: 0.03,  max: 0.08 },    // slow appreciation
};

// Loan-to-Value ratios per category
const CATEGORY_LTV = {
    realestate:  0.50,
    luxury:      0.40,
    vehicles:    0.35,
    nft:         0.30,
    gaming:      0.25,
    electronics: 0.20,
};

// Deterministic hash for stable pseudo-random values
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash |= 0;
    }
    return hash;
}

// Returns a deterministic float in [0,1) from a seed string
function seededRandom(seed) {
    const h = Math.abs(hashCode(seed));
    return (h % 10000) / 10000;
}

// ---- localStorage helpers ----

function getPurchases() {
    try { return JSON.parse(localStorage.getItem(LS_PURCHASES) || '[]'); } catch { return []; }
}

function getCollateralState() {
    try { return JSON.parse(localStorage.getItem(LS_COLLATERAL) || '{}'); } catch { return {}; }
}
function saveCollateralState(state) {
    try { localStorage.setItem(LS_COLLATERAL, JSON.stringify(state)); } catch {}
}

function getEnforcementState() {
    try { return JSON.parse(localStorage.getItem(LS_ENFORCEMENT) || '{}'); } catch { return {}; }
}
function saveEnforcementState(state) {
    try { localStorage.setItem(LS_ENFORCEMENT, JSON.stringify(state)); } catch {}
}

// ---- Asset Key ----
function makeAssetKey(purchase) {
    return `${purchase.productId}_${purchase.timestamp}`;
}

// ---- Core Functions ----

/**
 * Calculate the current value of a purchase using deterministic pseudo-random appreciation.
 * Value is stable across reloads for the same product+timestamp.
 */
export function calculateCurrentValue(purchase) {
    const category = purchase.category || 'electronics';
    const rates = CATEGORY_RATES[category] || CATEGORY_RATES.electronics;
    const seed = `${purchase.productId}_${purchase.timestamp}`;
    const rand = seededRandom(seed);
    // Interpolate between min and max rate
    const annualRate = rates.min + rand * (rates.max - rates.min);
    // Time elapsed in years
    const elapsed = (Date.now() - purchase.timestamp) / (365.25 * 24 * 3600 * 1000);
    const factor = 1 + annualRate * Math.min(elapsed, 5); // cap at 5 years
    return Math.max(purchase.priceUSD * factor, purchase.priceUSD * 0.05); // floor at 5% of purchase price
}

/**
 * Returns all owned assets for an address, enriched with live data.
 */
export function getOwnedAssets(address) {
    if (!address) return [];
    const addr = address.toLowerCase();
    const purchases = getPurchases();
    const collateral = getCollateralState();
    const addrCollateral = collateral[addr] || {};
    const enforcement = getEnforcementState();
    const addrEnforcement = enforcement[addr] || {};

    return purchases
        .filter(p => {
            // Match purchases to address — backward-compatible
            if (p.buyerAddress) return p.buyerAddress === addr;
            return true; // old purchases without buyerAddress treated as current
        })
        .map(p => {
            const assetKey = makeAssetKey(p);
            const currentValue = calculateCurrentValue(p);
            const changePercent = ((currentValue - p.priceUSD) / p.priceUSD) * 100;
            const ltv = CATEGORY_LTV[p.category] || 0.20;
            const pledgeState = addrCollateral[assetKey] || {};
            const isPledged = pledgeState.pledged === true;
            const isSeized = addrEnforcement[assetKey]?.seized === true;

            return {
                ...p,
                assetKey,
                currentValue,
                changePercent,
                ltvRatio: ltv,
                collateralValue: currentValue * ltv,
                isPledged,
                isSeized,
            };
        })
        .filter(a => !a.isSeized); // Seized assets are no longer "owned"
}

/**
 * Pledge an asset as collateral.
 */
export function pledgeAsset(address, assetKey) {
    if (!address) return;
    const addr = address.toLowerCase();
    const state = getCollateralState();
    if (!state[addr]) state[addr] = {};
    state[addr][assetKey] = { pledged: true, pledgedAt: Date.now() };
    saveCollateralState(state);
}

/**
 * Unpledge an asset.
 */
export function unpledgeAsset(address, assetKey) {
    if (!address) return;
    const addr = address.toLowerCase();
    const state = getCollateralState();
    if (state[addr]) {
        delete state[addr][assetKey];
        saveCollateralState(state);
    }
}

/**
 * Total collateral value from pledged marketplace assets.
 */
export function getAssetCollateralValue(address) {
    const assets = getOwnedAssets(address);
    return assets
        .filter(a => a.isPledged)
        .reduce((sum, a) => sum + a.collateralValue, 0);
}

/**
 * Customer net worth breakdown with financed vs owned-outright split.
 */
export function getCustomerWorth(address, cryptoCollateralUSD = 0, debtUSD = 0) {
    const assets = getOwnedAssets(address);
    const totalAssetValue = assets.reduce((sum, a) => sum + a.currentValue, 0);
    const pledgedAssetValue = assets.filter(a => a.isPledged).reduce((sum, a) => sum + a.currentValue, 0);
    const pledgedCollateralValue = assets.filter(a => a.isPledged).reduce((sum, a) => sum + a.collateralValue, 0);

    // Financed vs owned-outright breakdown
    const financedAssets = assets.filter(a => a.financed === true);
    const ownedOutrightAssets = assets.filter(a => !a.financed);
    const financedValue = financedAssets.reduce((sum, a) => sum + a.currentValue, 0);
    const ownedOutrightValue = ownedOutrightAssets.reduce((sum, a) => sum + a.currentValue, 0);
    const totalOriginalLoanAmount = financedAssets.reduce((sum, a) => sum + (a.loanAmount || 0), 0);

    // Equity in financed assets = current value - original loan amount (simplified)
    const financedEquity = Math.max(0, financedValue - totalOriginalLoanAmount);

    // Net worth: crypto collateral + owned outright assets + equity in financed assets - non-asset debt
    // Debt from financing is already factored into the contract debt, so we subtract total debt
    const netWorth = cryptoCollateralUSD + totalAssetValue - debtUSD;

    return {
        cryptoCollateralUSD,
        totalAssetValue,
        pledgedAssetValue,
        pledgedCollateralValue,
        debtUSD,
        netWorth,
        assetCount: assets.length,
        pledgedCount: assets.filter(a => a.isPledged).length,
        // Financed breakdown
        financedCount: financedAssets.length,
        financedValue,
        ownedOutrightCount: ownedOutrightAssets.length,
        ownedOutrightValue,
        totalOriginalLoanAmount,
        financedEquity,
    };
}

/**
 * Risk assessment score 0-100.
 * - Concentration (30pts): single-category dominance
 * - Volatile exposure (35pts): % in NFTs/gaming
 * - Depreciation exposure (20pts): % in electronics/vehicles
 * - Diversity (15pts): fewer categories = higher risk
 */
export function calculateAssetRisk(address) {
    const assets = getOwnedAssets(address);
    if (assets.length === 0) return { riskScore: 0, riskLevel: 'None', riskColor: 'var(--text-muted)', factors: {} };

    const totalValue = assets.reduce((s, a) => s + a.currentValue, 0);
    if (totalValue === 0) return { riskScore: 0, riskLevel: 'None', riskColor: 'var(--text-muted)', factors: {} };

    // Category breakdown
    const catValues = {};
    assets.forEach(a => {
        catValues[a.category] = (catValues[a.category] || 0) + a.currentValue;
    });
    const categories = Object.keys(catValues);

    // 1. Concentration (30pts) — max single-category share
    const maxShare = Math.max(...Object.values(catValues)) / totalValue;
    const concentrationScore = Math.round(maxShare * 30);

    // 2. Volatile exposure (35pts) — NFTs + gaming
    const volatileValue = (catValues.nft || 0) + (catValues.gaming || 0);
    const volatileShare = volatileValue / totalValue;
    const volatileScore = Math.round(volatileShare * 35);

    // 3. Depreciation exposure (20pts) — electronics + vehicles
    const depValue = (catValues.electronics || 0) + (catValues.vehicles || 0);
    const depShare = depValue / totalValue;
    const depScore = Math.round(depShare * 20);

    // 4. Diversity (15pts) — fewer categories = higher risk
    const diversityScore = Math.round(Math.max(0, (1 - categories.length / 6)) * 15);

    const riskScore = concentrationScore + volatileScore + depScore + diversityScore;

    let riskLevel, riskColor;
    if (riskScore <= 25) { riskLevel = 'Low'; riskColor = 'var(--success)'; }
    else if (riskScore <= 50) { riskLevel = 'Medium'; riskColor = 'var(--accent)'; }
    else if (riskScore <= 75) { riskLevel = 'High'; riskColor = 'var(--warning)'; }
    else { riskLevel = 'Critical'; riskColor = 'var(--danger)'; }

    return {
        riskScore,
        riskLevel,
        riskColor,
        factors: {
            concentration: concentrationScore,
            volatility: volatileScore,
            depreciation: depScore,
            diversity: diversityScore,
        },
    };
}

/**
 * Available enforcement options based on health factor.
 */
export function getEnforcementOptions(address, healthFactor, debtUSD) {
    const options = [];
    const assets = getOwnedAssets(address);
    const pledged = assets.filter(a => a.isPledged);
    const pledgedValue = pledged.reduce((s, a) => s + a.currentValue, 0);

    if (healthFactor < 1.0 && pledged.length > 0) {
        options.push({
            id: 'seize',
            label: 'Seize Pledged Assets',
            description: `Recover $${pledgedValue.toFixed(2)} from ${pledged.length} pledged asset(s)`,
            severity: 'danger',
            icon: 'warning',
        });
    }
    if (healthFactor < 1.5 && debtUSD > 0) {
        options.push({
            id: 'legal',
            label: 'File Legal Claim',
            description: `Initiate legal proceedings for $${debtUSD.toFixed(2)} debt recovery`,
            severity: 'warning',
            icon: 'shield',
        });
        options.push({
            id: 'settlement',
            label: 'Offer Settlement',
            description: `Propose settlement at 70% ($${(debtUSD * 0.7).toFixed(2)}) to resolve debt`,
            severity: 'info',
            icon: 'check',
        });
    }
    return options;
}

/**
 * Seize all pledged assets for an address.
 */
export function seizeAssets(address) {
    if (!address) return { seized: 0, recoveredValue: 0 };
    const addr = address.toLowerCase();
    const assets = getOwnedAssets(address);
    const pledged = assets.filter(a => a.isPledged);
    if (pledged.length === 0) return { seized: 0, recoveredValue: 0 };

    const recoveredValue = pledged.reduce((s, a) => s + a.currentValue, 0);

    // Mark as seized
    const enforcement = getEnforcementState();
    if (!enforcement[addr]) enforcement[addr] = {};
    pledged.forEach(a => {
        enforcement[addr][a.assetKey] = { seized: true, seizedAt: Date.now(), value: a.currentValue };
    });
    saveEnforcementState(enforcement);

    // Remove pledge state
    const collateral = getCollateralState();
    if (collateral[addr]) {
        pledged.forEach(a => { delete collateral[addr][a.assetKey]; });
        saveCollateralState(collateral);
    }

    // Log to history
    logEnforcementAction(addr, {
        type: 'seizure',
        status: 'completed',
        assetsSeized: pledged.length,
        recoveredValue,
        assetNames: pledged.map(a => a.productName),
    });

    return { seized: pledged.length, recoveredValue };
}

/**
 * File a legal claim against a defaulter.
 */
export function fileLegalClaim(address, debtUSD) {
    if (!address) return null;
    const addr = address.toLowerCase();
    const claim = {
        type: 'legal_claim',
        status: 'filed',
        debtAmount: debtUSD,
        filedAt: Date.now(),
        stages: [
            { stage: 'Filed', date: Date.now(), complete: true },
            { stage: 'In Review', date: null, complete: false },
            { stage: 'Judgment', date: null, complete: false },
        ],
    };
    logEnforcementAction(addr, claim);
    return claim;
}

/**
 * Offer a settlement at 70% of debt.
 */
export function offerSettlement(address, debtUSD) {
    if (!address) return null;
    const addr = address.toLowerCase();
    const settlement = {
        type: 'settlement',
        status: 'offered',
        originalDebt: debtUSD,
        settlementAmount: debtUSD * 0.7,
        discount: 30,
    };
    logEnforcementAction(addr, settlement);
    return settlement;
}

/**
 * Get enforcement history for an address.
 */
export function getEnforcementHistory(address) {
    if (!address) return [];
    const addr = address.toLowerCase();
    try {
        const history = JSON.parse(localStorage.getItem(LS_ENFORCEMENT_HISTORY) || '{}');
        return (history[addr] || []).sort((a, b) => b.timestamp - a.timestamp);
    } catch { return []; }
}

// Internal: log an enforcement action
function logEnforcementAction(addr, action) {
    try {
        const history = JSON.parse(localStorage.getItem(LS_ENFORCEMENT_HISTORY) || '{}');
        if (!history[addr]) history[addr] = [];
        history[addr].push({ ...action, timestamp: Date.now() });
        localStorage.setItem(LS_ENFORCEMENT_HISTORY, JSON.stringify(history));
    } catch {}
}
