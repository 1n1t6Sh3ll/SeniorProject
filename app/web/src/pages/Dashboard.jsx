import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import Tooltip from '../components/Tooltip';
import HealthFactorGauge from '../components/HealthFactorGauge';
import CreditTierBadge from '../components/CreditTierBadge';
import CreditScoreGauge from '../components/CreditScoreGauge';
import CreditTierRoadmap from '../components/CreditTierRoadmap';
import { SkeletonDashboard } from '../components/Skeleton';
import { getUserPosition, getUserDebts, getOraclePrices, getReadProvider, getWBTCBalance, getUSDXBalance, getUserUSDXCollateral } from '../utils/contracts';
import { calculateAccruedInterest, getAPRForTier, formatAPR } from '../utils/interest';
import { calculateCreditScore } from '../utils/creditScore';
import { calculateEarnedYield } from '../utils/supplyYield';
import { getDailyUsagePercent, getDailyRemaining, getTransferLimits } from '../utils/transferLimits';
import { getAssetCollateralValue, getOwnedAssets } from '../utils/assetPortfolio';

export default function Dashboard() {
    const { address, isConnected } = useWallet();
    const [position, setPosition] = useState(null);
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [walletBalances, setWalletBalances] = useState({ eth: 0, wbtc: 0, usdx: 0 });
    const [debts, setDebts] = useState({ usdxDebt: 0n, ethDebt: 0n, wbtcDebt: 0n });
    const [usdxCollateral, setUsdxCollateral] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isConnected && address) {
            fetchPosition();
            const interval = setInterval(fetchPosition, 15000);
            return () => clearInterval(interval);
        }
    }, [isConnected, address]);

    useEffect(() => {
        if (!isConnected) {
            setPosition(null);
            setError(null);
        }
    }, [isConnected]);

    // Refresh immediately when user navigates back to this page
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && isConnected && address) {
                fetchPosition();
            }
        };
        const handleFocus = () => {
            if (isConnected && address) fetchPosition();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleFocus);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleFocus);
        };
    }, [isConnected, address]);

    const fetchPosition = async () => {
        try {
            setLoading(true);
            const provider = getReadProvider();
            const [pos, oraclePrices, userDebts, ethBal, wbtcBal, usdxBal, usdxCol] = await Promise.all([
                getUserPosition(address, provider),
                getOraclePrices(provider),
                getUserDebts(address, provider).catch(() => ({ usdxDebt: 0n, ethDebt: 0n, wbtcDebt: 0n })),
                provider.getBalance(address),
                getWBTCBalance(address, provider).catch(() => '0'),
                getUSDXBalance(address, provider).catch(() => '0'),
                getUserUSDXCollateral(address, provider).catch(() => '0'),
            ]);
            setPosition(pos);
            setPrices(oraclePrices);
            setDebts(userDebts);
            setUsdxCollateral(parseFloat(usdxCol));
            setWalletBalances({
                eth: parseFloat(ethers.formatEther(ethBal)),
                wbtc: parseFloat(wbtcBal),
                usdx: parseFloat(usdxBal),
            });
            setError(null);
        } catch (err) {
            console.error('Failed to fetch position:', err);
            setError('Unable to load position data');
        } finally {
            setLoading(false);
        }
    };

    const getDisplayValues = () => {
        if (!position) return { totalCollateral: 0, totalBorrowed: 0, availableToBorrow: 0, healthFactor: 0 };

        const ethAmount = parseFloat(ethers.formatEther(position.ethCollateral || 0n));
        const wbtcAmount = parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8));
        const ethValue = ethAmount * prices.ethPrice;
        const wbtcValue = wbtcAmount * prices.wbtcPrice;
        const usdxValue = usdxCollateral; // USDX = $1
        const totalCollateral = ethValue + wbtcValue + usdxValue;
        const totalBorrowed = parseFloat(ethers.formatEther(position.debtAmount || 0n));
        const maxBorrow = parseFloat(ethers.formatEther(position.maxBorrow || 0n));
        const availableToBorrow = Math.max(0, maxBorrow - totalBorrowed);

        let healthFactor = 0;
        if (position.healthFactor) {
            const hfBig = typeof position.healthFactor === 'bigint' ? position.healthFactor : BigInt(position.healthFactor);
            if (hfBig > BigInt('1000000000000000000000')) {
                healthFactor = 999;
            } else {
                healthFactor = parseFloat(ethers.formatEther(hfBig));
            }
        }
        if (totalBorrowed === 0 && totalCollateral > 0) healthFactor = 999;

        let liquidationPrice = null;
        if (totalBorrowed > 0 && ethAmount > 0) {
            const liqPrice = (totalBorrowed / 0.75 - wbtcValue * 0.75) / (ethAmount * 0.75);
            if (liqPrice > 0) liquidationPrice = liqPrice;
        }

        const utilizationPct = maxBorrow > 0 ? (totalBorrowed / maxBorrow) * 100 : 0;

        return { totalCollateral, totalBorrowed, availableToBorrow, healthFactor, ethAmount, wbtcAmount, ethValue, wbtcValue, usdxValue, liquidationPrice, utilizationPct, maxBorrow };
    };

    if (loading && !position) {
        return (
            <main className="dashboard-section">
                <div className="dashboard-container">
                    <SkeletonDashboard />
                </div>
            </main>
        );
    }

    const vals = getDisplayValues();
    const utilColor = vals.utilizationPct > 80 ? 'var(--danger)' : vals.utilizationPct > 50 ? 'var(--warning)' : 'var(--primary)';
    const tier = position?.creditTier || 1;
    const apr = getAPRForTier(tier);
    const assetCollateralVal = getAssetCollateralValue(address);
    const pledgedAssets = getOwnedAssets(address).filter(a => a.isPledged);
    const interestInfo = vals.totalBorrowed > 0 ? calculateAccruedInterest(address, vals.totalBorrowed, tier) : null;

    return (
        <main className="dashboard-section">
            <div className="dashboard-container">
                {error && (
                    <div className="error-banner">
                        <span>{error}</span>
                        <button className="btn-small" onClick={fetchPosition}>Retry</button>
                    </div>
                )}

                {/* Credit Card — TOP */}
                <div className="credit-card">
                    <div className="card-header-row">
                        <div className="card-logo"><Icon name="shield" size={20} /> CryptoCredit</div>
                        <div className="card-chip"><Icon name="lock" size={18} /></div>
                    </div>
                    <div className="card-content">
                        <div className="card-stats">
                            <div className="card-stat">
                                <span className="stat-label">Available to Borrow</span>
                                <span className="stat-value">${vals.availableToBorrow.toFixed(2)}</span>
                            </div>
                            <div className="card-stat">
                                <span className="stat-label">Total Borrowed</span>
                                <span className="stat-value">${vals.totalBorrowed.toFixed(2)}</span>
                            </div>
                            <div className="card-stat">
                                <span className="stat-label">Collateral Value</span>
                                <span className="stat-value">${(vals.totalCollateral + assetCollateralVal).toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="card-holder">
                            <div>
                                <span className="holder-label">Account</span>
                                <span className="holder-value">{address ? `${address.slice(0, 10)}...${address.slice(-6)}` : ''}</span>
                            </div>
                            <div>
                                <span className="holder-label">Credit Tier</span>
                                <span className="holder-value">Tier {tier} ({formatAPR(apr)} APR)</span>
                            </div>
                        </div>

                        {vals.maxBorrow > 0 && (
                            <div className="utilization-bar">
                                <div className="utilization-header">
                                    <span style={{ color: 'var(--text-tertiary)' }}>Borrow Utilization</span>
                                    <span className="mono" style={{ color: utilColor, fontWeight: 700 }}>{vals.utilizationPct.toFixed(1)}%</span>
                                </div>
                                <div className="utilization-track">
                                    <div className="utilization-fill" style={{ width: `${Math.min(vals.utilizationPct, 100)}%`, background: utilColor }} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Wallet Balances */}
                <div className="dashboard-card">
                    <h3 className="card-title">Account Balances</h3>
                    <div className="wallet-balances-grid">
                        <div className="wallet-balance-item">
                            <div className="wallet-balance-icon" style={{ background: 'rgba(98, 126, 234, 0.15)', color: '#627eea' }}>ETH</div>
                            <div className="wallet-balance-info">
                                <div className="wallet-balance-amount mono">{walletBalances.eth.toFixed(4)} ETH</div>
                                <div className="wallet-balance-value text-xs text-muted">${(walletBalances.eth * prices.ethPrice).toFixed(2)}</div>
                            </div>
                        </div>
                        <div className="wallet-balance-item">
                            <div className="wallet-balance-icon" style={{ background: 'rgba(247, 147, 26, 0.15)', color: '#f7931a' }}>BTC</div>
                            <div className="wallet-balance-info">
                                <div className="wallet-balance-amount mono">{walletBalances.wbtc.toFixed(6)} WBTC</div>
                                <div className="wallet-balance-value text-xs text-muted">${(walletBalances.wbtc * prices.wbtcPrice).toFixed(2)}</div>
                            </div>
                        </div>
                        <div className="wallet-balance-item">
                            <div className="wallet-balance-icon" style={{ background: 'rgba(0, 212, 170, 0.15)', color: 'var(--primary)' }}>USD</div>
                            <div className="wallet-balance-info">
                                <div className="wallet-balance-amount mono">{walletBalances.usdx.toFixed(2)} USDX</div>
                                <div className="wallet-balance-value text-xs text-muted">${walletBalances.usdx.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Credit Score + Tier — second row */}
                <div className="dashboard-grid">
                    <div className="dashboard-card">
                        <h3 className="card-title">
                            Credit Score <Tooltip term="creditTier" />
                        </h3>
                        {(() => {
                            const scoreData = calculateCreditScore(position, address);
                            return <CreditScoreGauge score={scoreData.score} breakdown={scoreData.breakdown} size="md" />;
                        })()}
                        <div style={{ marginTop: 'var(--spacing-sm)' }}>
                            <CreditTierBadge
                                tier={position?.creditTier || 1}
                                repayments={position?.successfulRepayments || 0}
                            />
                        </div>
                    </div>

                    {position && (
                        <div className="dashboard-card">
                            <h3 className="card-title">Credit Tier Roadmap</h3>
                            <CreditTierRoadmap
                                currentTier={tier}
                                repayments={position.successfulRepayments || 0}
                            />
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="dashboard-card">
                    <h3 className="card-title">Quick Actions</h3>
                    <div className="actions-grid">
                        <Link to="/deposit" className="action-btn">
                            <div className="action-icon"><Icon name="deposit" size={20} /></div>
                            <div className="action-text">Deposit</div>
                        </Link>
                        <Link to="/borrow" className="action-btn">
                            <div className="action-icon"><Icon name="borrow" size={20} /></div>
                            <div className="action-text">Borrow</div>
                        </Link>
                        <Link to="/repay" className="action-btn">
                            <div className="action-icon"><Icon name="repay" size={20} /></div>
                            <div className="action-text">Repay</div>
                        </Link>
                        <Link to="/withdraw" className="action-btn">
                            <div className="action-icon"><Icon name="withdraw" size={20} /></div>
                            <div className="action-text">Withdraw</div>
                        </Link>
                        <Link to="/exchange" className="action-btn">
                            <div className="action-icon"><Icon name="exchange" size={20} /></div>
                            <div className="action-text">Swap</div>
                        </Link>
                        <Link to="/send" className="action-btn">
                            <div className="action-icon"><Icon name="send" size={20} /></div>
                            <div className="action-text">Send</div>
                        </Link>
                        <Link to="/marketplace" className="action-btn">
                            <div className="action-icon"><Icon name="shop" size={20} /></div>
                            <div className="action-text">Shop</div>
                        </Link>
                        <button className="action-btn" onClick={fetchPosition}>
                            <div className="action-icon"><Icon name="refresh" size={20} /></div>
                            <div className="action-text">Refresh</div>
                        </button>
                    </div>
                </div>

                {/* Position Details Grid */}
                <div className="dashboard-grid">
                    {/* Health Factor */}
                    <div className="dashboard-card health-card">
                        <h3 className="card-title">
                            Health Factor <Tooltip term="healthFactor" />
                        </h3>
                        {position ? (
                            <>
                                <HealthFactorGauge value={vals.healthFactor} />
                                <div className="health-status">
                                    <span className={`status-badge ${vals.healthFactor > 2 ? 'safe' : vals.healthFactor > 1 ? 'warning' : 'danger'}`}>
                                        {vals.healthFactor > 2 ? 'Healthy Position' : vals.healthFactor > 1 ? 'At Risk' : 'Liquidation Risk'}
                                    </span>
                                </div>
                                {vals.liquidationPrice && (
                                    <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginTop: 'var(--spacing-sm)' }}>
                                        <div className="text-xs" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                                            Liquidation Price (ETH) <Tooltip term="liquidation" />
                                        </div>
                                        <div className="mono font-bold" style={{ fontSize: '1.1rem', color: 'var(--danger)' }}>${vals.liquidationPrice.toFixed(2)}</div>
                                        <div className="text-xs" style={{ color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                            {((1 - vals.liquidationPrice / prices.ethPrice) * 100).toFixed(1)}% below current price
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="empty-state-card">
                                <Icon name="deposit" size={32} />
                                <p>No position yet</p>
                                <Link to="/deposit" className="btn btn-primary btn-sm">Deposit Collateral</Link>
                            </div>
                        )}
                    </div>

                    {/* Collateral */}
                    <div className="dashboard-card">
                        <h3 className="card-title">
                            Collateral <Tooltip term="collateral" />
                        </h3>
                        {position && (vals.ethAmount > 0 || vals.wbtcAmount > 0 || usdxCollateral > 0) ? (
                            <div className="collateral-list">
                                {vals.ethAmount > 0 && (
                                    <div className="collateral-item">
                                        <div>
                                            <div className="collateral-asset">ETH</div>
                                            <div className="collateral-amount">{vals.ethAmount.toFixed(4)} ETH</div>
                                        </div>
                                        <div className="collateral-value">${vals.ethValue.toFixed(2)}</div>
                                    </div>
                                )}
                                {vals.wbtcAmount > 0 && (
                                    <div className="collateral-item">
                                        <div>
                                            <div className="collateral-asset">WBTC</div>
                                            <div className="collateral-amount">{vals.wbtcAmount.toFixed(6)} WBTC</div>
                                        </div>
                                        <div className="collateral-value">${vals.wbtcValue.toFixed(2)}</div>
                                    </div>
                                )}
                                {usdxCollateral > 0 && (
                                    <div className="collateral-item">
                                        <div>
                                            <div className="collateral-asset">USDX</div>
                                            <div className="collateral-amount">{usdxCollateral.toFixed(2)} USDX</div>
                                        </div>
                                        <div className="collateral-value">${usdxCollateral.toFixed(2)}</div>
                                    </div>
                                )}
                                {pledgedAssets.length > 0 && (
                                    <div className="collateral-item">
                                        <div>
                                            <div className="collateral-asset">Marketplace Assets</div>
                                            <div className="collateral-amount">{pledgedAssets.length} pledged item{pledgedAssets.length !== 1 ? 's' : ''}</div>
                                        </div>
                                        <div className="collateral-value" style={{ color: 'var(--primary)' }}>${assetCollateralVal.toFixed(2)}</div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="empty-state">No collateral deposited</p>
                        )}
                    </div>

                    {/* Borrowing + Interest */}
                    <div className="dashboard-card">
                        <h3 className="card-title">Borrowing</h3>
                        {position && vals.totalBorrowed > 0 ? (
                            <div className="flex flex-col gap-md">
                                <div className="borrowing-list">
                                    {(() => {
                                        const usdxDebt = parseFloat(ethers.formatEther(debts.usdxDebt || 0n));
                                        const ethDebt = parseFloat(ethers.formatEther(debts.ethDebt || 0n));
                                        const wbtcDebt = parseFloat(ethers.formatUnits(debts.wbtcDebt || 0n, 8));
                                        return (
                                            <>
                                                {usdxDebt > 0 && (
                                                    <div className="borrowing-item">
                                                        <div>
                                                            <div className="borrowing-asset">USDX</div>
                                                            <div className="borrowing-amount">{usdxDebt.toFixed(2)} USDX</div>
                                                        </div>
                                                        <div className="borrowing-value">${usdxDebt.toFixed(2)}</div>
                                                    </div>
                                                )}
                                                {ethDebt > 0 && (
                                                    <div className="borrowing-item">
                                                        <div>
                                                            <div className="borrowing-asset">ETH</div>
                                                            <div className="borrowing-amount">{ethDebt.toFixed(4)} ETH</div>
                                                        </div>
                                                        <div className="borrowing-value">${(ethDebt * prices.ethPrice).toFixed(2)}</div>
                                                    </div>
                                                )}
                                                {wbtcDebt > 0 && (
                                                    <div className="borrowing-item">
                                                        <div>
                                                            <div className="borrowing-asset">WBTC</div>
                                                            <div className="borrowing-amount">{wbtcDebt.toFixed(6)} WBTC</div>
                                                        </div>
                                                        <div className="borrowing-value">${(wbtcDebt * prices.wbtcPrice).toFixed(2)}</div>
                                                    </div>
                                                )}
                                                {usdxDebt === 0 && ethDebt === 0 && wbtcDebt === 0 && (
                                                    <div className="borrowing-item">
                                                        <div>
                                                            <div className="borrowing-asset">Total</div>
                                                            <div className="borrowing-amount">Debt</div>
                                                        </div>
                                                        <div className="borrowing-value">${vals.totalBorrowed.toFixed(2)}</div>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                {interestInfo && (
                                    <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                        <div className="flex justify-between text-xs mb-sm">
                                            <span className="text-muted">Interest Rate</span>
                                            <span className="mono font-bold" style={{ color: 'var(--accent)' }}>{formatAPR(interestInfo.apr)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs mb-sm">
                                            <span className="text-muted">Accrued Interest</span>
                                            <span className="mono" style={{ color: 'var(--accent)' }}>${interestInfo.interest.toFixed(4)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted">Total Owed</span>
                                            <span className="mono font-bold">${interestInfo.totalOwed.toFixed(2)}</span>
                                        </div>
                                        {interestInfo.penaltyApplied && (
                                            <div className="badge badge-danger mt-sm" style={{ fontSize: '0.65rem' }}>Late Penalty Active</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="empty-state">No active loans</p>
                        )}
                    </div>

                    {/* Earnings & Limits */}
                    <div className="dashboard-card">
                        <h3 className="card-title">Earnings & Limits</h3>
                        {(() => {
                            const yieldInfo = calculateEarnedYield(address, vals.ethAmount || 0, vals.wbtcAmount || 0, prices);
                            const limitUsage = getDailyUsagePercent(tier);
                            const remaining = getDailyRemaining(tier);
                            const limits = getTransferLimits(tier);
                            return (
                                <div className="flex flex-col gap-md">
                                    <div>
                                        <div className="text-xs text-muted mb-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Yield Earned</div>
                                        <div className="mono font-bold" style={{ fontSize: '1.5rem', color: 'var(--success)' }}>
                                            ${yieldInfo.totalYieldUSD.toFixed(4)}
                                        </div>
                                        {yieldInfo.ethYield > 0 && <div className="text-xs text-muted">ETH: +{yieldInfo.ethYield.toFixed(6)}</div>}
                                        {yieldInfo.wbtcYield > 0 && <div className="text-xs text-muted">WBTC: +{yieldInfo.wbtcYield.toFixed(8)}</div>}
                                    </div>
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-md)' }}>
                                        <div className="flex justify-between text-xs mb-xs">
                                            <span className="text-muted">Daily Transfer Limit</span>
                                            <span className="mono">${remaining.toLocaleString()} / ${limits.daily.toLocaleString()}</span>
                                        </div>
                                        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                                            <div style={{
                                                height: '100%', borderRadius: 3, transition: 'width 0.3s',
                                                width: `${limitUsage}%`,
                                                background: limitUsage > 80 ? 'var(--danger)' : limitUsage > 50 ? 'var(--warning)' : 'var(--primary)',
                                            }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
        </main>
    );
}
