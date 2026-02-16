import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import Icon from '../components/Icon';
import { getUserPosition, getOraclePrices, getReadProvider } from '../utils/contracts';

export default function Simulator() {
    const { address, isConnected } = useWallet();
    const [position, setPosition] = useState(null);
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [loading, setLoading] = useState(false);

    // Simulator state
    const [addEth, setAddEth] = useState(0);
    const [addWbtc, setAddWbtc] = useState(0);
    const [addBorrow, setAddBorrow] = useState(0);
    const [priceChange, setPriceChange] = useState(0); // percentage change

    useEffect(() => {
        if (isConnected && address) fetchPosition();
    }, [isConnected, address]);

    const fetchPosition = async () => {
        setLoading(true);
        try {
            const provider = getReadProvider();
            const [pos, oraclePrices] = await Promise.all([
                getUserPosition(address, provider),
                getOraclePrices(provider),
            ]);
            setPosition(pos);
            setPrices(oraclePrices);
        } catch (err) {
            console.error('Error fetching position:', err);
        } finally {
            setLoading(false);
        }
    };

    const getCurrentValues = () => {
        if (!position) return { ethAmount: 0, wbtcAmount: 0, debt: 0, maxBorrow: 0 };
        return {
            ethAmount: parseFloat(ethers.formatEther(position.ethCollateral || 0n)),
            wbtcAmount: parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8)),
            debt: parseFloat(ethers.formatEther(position.debtAmount || 0n)),
            maxBorrow: parseFloat(ethers.formatEther(position.maxBorrow || 0n)),
            creditTier: position.creditTier || 1,
        };
    };

    const simulate = () => {
        const current = getCurrentValues();
        const simEthPrice = prices.ethPrice * (1 + priceChange / 100);
        const simWbtcPrice = prices.wbtcPrice * (1 + priceChange / 100);

        const totalEth = current.ethAmount + addEth;
        const totalWbtc = current.wbtcAmount + addWbtc;
        const totalDebt = current.debt + addBorrow;

        const ethValue = totalEth * simEthPrice;
        const wbtcValue = totalWbtc * simWbtcPrice;
        const totalCollateral = ethValue + wbtcValue;

        // LTV based on tier
        const ltvRatio = current.creditTier === 3 ? 0.70 : current.creditTier === 2 ? 0.65 : 0.60;
        const liquidationThreshold = 0.75;

        const simMaxBorrow = totalCollateral * ltvRatio;
        const simHealthFactor = totalDebt > 0 ? (totalCollateral * liquidationThreshold) / totalDebt : 999;

        // Liquidation price for ETH
        let simLiqPrice = null;
        if (totalDebt > 0 && totalEth > 0) {
            const liqPrice = (totalDebt / liquidationThreshold - wbtcValue) / totalEth;
            if (liqPrice > 0) simLiqPrice = liqPrice;
        }

        return {
            totalCollateral,
            totalDebt,
            healthFactor: Math.min(simHealthFactor, 999),
            maxBorrow: simMaxBorrow,
            available: Math.max(0, simMaxBorrow - totalDebt),
            liquidationPrice: simLiqPrice,
            simEthPrice,
            simWbtcPrice,
        };
    };

    if (loading && !position) {
        return (
            <main className="page-section">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading your position...</p>
                </div>
            </main>
        );
    }

    const current = getCurrentValues();
    const sim = simulate();
    const hfColor = sim.healthFactor < 1.0 ? 'var(--danger)' : sim.healthFactor < 1.5 ? 'var(--warning)' : 'var(--success)';

    return (
        <main className="page-section">
            <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title"><Icon name="simulator" size={22} /> Position Simulator</h1>
                        <p className="page-subtitle">Model what-if scenarios for your position</p>
                    </div>

                    <div className="simulator-grid">
                        {/* Controls */}
                        <div className="dashboard-card">
                            <h3 className="card-title">Scenario Controls</h3>

                            <div className="slider-group">
                                <div className="slider-label">
                                    <span>Add ETH Collateral</span>
                                    <span>{addEth.toFixed(2)} ETH</span>
                                </div>
                                <input type="range" min="0" max="100" step="0.1" value={addEth} onChange={e => setAddEth(parseFloat(e.target.value))} />
                            </div>

                            <div className="slider-group">
                                <div className="slider-label">
                                    <span>Add WBTC Collateral</span>
                                    <span>{addWbtc.toFixed(4)} WBTC</span>
                                </div>
                                <input type="range" min="0" max="5" step="0.01" value={addWbtc} onChange={e => setAddWbtc(parseFloat(e.target.value))} />
                            </div>

                            <div className="slider-group">
                                <div className="slider-label">
                                    <span>Additional Borrow</span>
                                    <span>${addBorrow.toFixed(2)}</span>
                                </div>
                                <input type="range" min="0" max={Math.max(sim.available, 0)} step="10" value={addBorrow} onChange={e => setAddBorrow(parseFloat(e.target.value))} />
                            </div>

                            <div className="slider-group">
                                <div className="slider-label">
                                    <span>Price Change</span>
                                    <span style={{ color: priceChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>{priceChange >= 0 ? '+' : ''}{priceChange}%</span>
                                </div>
                                <input type="range" min="-80" max="100" step="1" value={priceChange} onChange={e => setPriceChange(parseFloat(e.target.value))} />
                            </div>

                            <button className="btn btn-secondary w-full" onClick={() => { setAddEth(0); setAddWbtc(0); setAddBorrow(0); setPriceChange(0); }}>
                                Reset All
                            </button>

                            <div style={{ marginTop: 'var(--spacing-lg)', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                <div className="text-xs" style={{ color: 'var(--text-tertiary)', marginBottom: '6px' }}>Current Position</div>
                                <div className="flex justify-between text-sm mb-sm">
                                    <span style={{ color: 'var(--text-secondary)' }}>ETH</span>
                                    <span className="mono font-bold">{current.ethAmount.toFixed(4)}</span>
                                </div>
                                <div className="flex justify-between text-sm mb-sm">
                                    <span style={{ color: 'var(--text-secondary)' }}>WBTC</span>
                                    <span className="mono font-bold">{current.wbtcAmount.toFixed(6)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span style={{ color: 'var(--text-secondary)' }}>Debt</span>
                                    <span className="mono font-bold">${current.debt.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Results */}
                        <div className="dashboard-card">
                            <h3 className="card-title">Simulated Results</h3>

                            <div className="sim-result">
                                <div className="sim-result-label">Health Factor</div>
                                <div className="sim-result-value" style={{ color: hfColor }}>
                                    {sim.healthFactor >= 999 ? '\u221E' : sim.healthFactor.toFixed(2)}
                                </div>
                                {sim.healthFactor < 1.0 && (
                                    <div className="badge badge-danger mt-sm">LIQUIDATABLE</div>
                                )}
                            </div>

                            <div className="sim-result">
                                <div className="sim-result-label">Total Collateral Value</div>
                                <div className="sim-result-value" style={{ color: 'var(--text-primary)' }}>
                                    ${sim.totalCollateral.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>

                            <div className="sim-result">
                                <div className="sim-result-label">Total Debt</div>
                                <div className="sim-result-value" style={{ color: sim.totalDebt > 0 ? 'var(--accent)' : 'var(--text-primary)' }}>
                                    ${sim.totalDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>

                            <div className="sim-result">
                                <div className="sim-result-label">Max Borrowable</div>
                                <div className="sim-result-value" style={{ color: 'var(--primary)' }}>
                                    ${sim.maxBorrow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>

                            <div className="sim-result">
                                <div className="sim-result-label">Available to Borrow</div>
                                <div className="sim-result-value" style={{ color: 'var(--primary)' }}>
                                    ${sim.available.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>

                            {sim.liquidationPrice && (
                                <div className="sim-result">
                                    <div className="sim-result-label">ETH Liquidation Price</div>
                                    <div className="sim-result-value" style={{ color: 'var(--danger)' }}>
                                        ${sim.liquidationPrice.toFixed(2)}
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                        Simulated ETH price: ${sim.simEthPrice.toFixed(2)}
                                    </div>
                                </div>
                            )}

                            {priceChange !== 0 && (
                                <div style={{ marginTop: 'var(--spacing-md)', padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                    <div className="text-xs" style={{ color: 'var(--text-tertiary)', marginBottom: '6px' }}>Simulated Prices</div>
                                    <div className="flex justify-between text-sm mb-sm">
                                        <span style={{ color: 'var(--text-secondary)' }}>ETH</span>
                                        <span className="mono font-bold" style={{ color: priceChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                            ${sim.simEthPrice.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span style={{ color: 'var(--text-secondary)' }}>WBTC</span>
                                        <span className="mono font-bold" style={{ color: priceChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                            ${sim.simWbtcPrice.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="info-box info mt-lg">
                                <strong>How it works:</strong> Adjust the sliders to model adding collateral, borrowing more, or price changes. The results update in real-time based on protocol parameters.
                            </div>
                        </div>
                    </div>
                </div>
        </main>
    );
}
