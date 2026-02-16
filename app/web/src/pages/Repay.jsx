import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { ethers } from 'ethers';
import Tooltip from '../components/Tooltip';
import ConfirmationModal from '../components/ConfirmationModal';
import CreditTierRoadmap from '../components/CreditTierRoadmap';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { repayUSDX, repayETH, repayWBTC, getUserPosition, getUserDebts, getUSDXBalance, getWBTCBalance, getOraclePrices, getReadProvider } from '../utils/contracts';
import {
    recordRepayment, calculateAccruedInterest, generateRepaymentPlans,
    calculateMinimumPayment, getAPRForTier, formatAPR, getLoanData
} from '../utils/interest';
import { calculateLateFee } from '../utils/fees';

export default function Repay() {
    const { address, isConnected } = useWallet();
    const { getSigner: getSignerFn } = useWalletSigner();
    const toast = useToast();

    const [amount, setAmount] = useState('');
    const [repayAsset, setRepayAsset] = useState('USDX');
    const [loading, setLoading] = useState(false);
    const [position, setPosition] = useState(null);
    const [debts, setDebts] = useState({ usdxDebt: 0n, ethDebt: 0n, wbtcDebt: 0n });
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [usdxBalance, setUSDXBalance] = useState('0');
    const [ethBalance, setEthBalance] = useState('0');
    const [wbtcBalance, setWbtcBalance] = useState('0');
    const [showConfirm, setShowConfirm] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);

    useEffect(() => {
        if (isConnected && address) fetchData();
    }, [isConnected, address]);

    const fetchData = async () => {
        try {
            const provider = getReadProvider();
            const [pos, userDebts, oraclePrices, usdxBal, ethBal, wbtcBal] = await Promise.all([
                getUserPosition(address, provider),
                getUserDebts(address, provider),
                getOraclePrices(provider),
                getUSDXBalance(address, provider).catch(() => '0'),
                provider.getBalance(address),
                getWBTCBalance(address, provider).catch(() => '0'),
            ]);
            setPosition(pos);
            setDebts(userDebts);
            setPrices(oraclePrices);
            setUSDXBalance(usdxBal);
            setEthBalance(ethers.formatEther(ethBal));
            setWbtcBalance(wbtcBal);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const getDebtForAsset = () => {
        if (repayAsset === 'ETH') return parseFloat(ethers.formatEther(debts.ethDebt || 0n));
        if (repayAsset === 'WBTC') return parseFloat(ethers.formatUnits(debts.wbtcDebt || 0n, 8));
        return parseFloat(ethers.formatEther(debts.usdxDebt || 0n));
    };

    const getBalanceForAsset = () => {
        if (repayAsset === 'ETH') return parseFloat(ethBalance);
        if (repayAsset === 'WBTC') return parseFloat(wbtcBalance);
        return parseFloat(usdxBalance);
    };

    const getTotalDebtUSD = () => {
        const usdx = parseFloat(ethers.formatEther(debts.usdxDebt || 0n));
        const eth = parseFloat(ethers.formatEther(debts.ethDebt || 0n)) * prices.ethPrice;
        const wbtc = parseFloat(ethers.formatUnits(debts.wbtcDebt || 0n, 8)) * prices.wbtcPrice;
        return usdx + eth + wbtc;
    };

    const handleRepayClick = (e) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) { toast.warning('Invalid Amount', 'Please enter a valid amount'); return; }
        if (!position) { toast.error('Error', 'Unable to fetch your position'); return; }
        const currentDebt = getDebtForAsset();
        if (parseFloat(amount) > currentDebt * 1.001) { toast.error('Exceeds Debt', `Your ${repayAsset} debt is only ${currentDebt.toFixed(repayAsset === 'WBTC' ? 6 : 4)} ${repayAsset}`); return; }
        const balance = getBalanceForAsset();
        if (parseFloat(amount) > balance) { toast.error('Insufficient Balance', `You only have ${balance.toFixed(repayAsset === 'WBTC' ? 6 : 4)} ${repayAsset}`); return; }
        if (!isConnected) { toast.error('Error', 'Please connect your wallet'); return; }
        setShowConfirm(true);
    };

    const executeRepay = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            const signer = await getSignerFn();
            let tx;
            if (repayAsset === 'ETH') {
                tx = await repayETH(amount, signer);
            } else if (repayAsset === 'WBTC') {
                tx = await repayWBTC(amount, signer);
            } else {
                tx = await repayUSDX(amount, signer);
            }
            const txHash = tx?.hash || tx?.transactionHash || '';
            const repayValueUSD = repayAsset === 'ETH' ? parseFloat(amount) * prices.ethPrice
                : repayAsset === 'WBTC' ? parseFloat(amount) * prices.wbtcPrice
                : parseFloat(amount);
            recordRepayment(address, repayValueUSD.toString());
            toast.tx('Repayment Successful', `Repaid ${amount} ${repayAsset}`, txHash);
            setAmount('');
            await fetchData();
        } catch (err) {
            toast.error('Repayment Failed', err.reason || err.message || 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    if (!position) {
        return (
            <>
                <main className="page-section">
                    <div className="page-container">
                        <div className="dashboard-grid">
                            <SkeletonCard height={400} />
                            <SkeletonCard height={400} />
                        </div>
                    </div>
                </main>
            </>
        );
    }

    const currentDebt = getDebtForAsset();
    const totalDebtUSD = getTotalDebtUSD();
    const remainingDebt = Math.max(0, currentDebt - (parseFloat(amount) || 0));
    const repaymentPct = currentDebt > 0 ? ((parseFloat(amount) || 0) / currentDebt) * 100 : 0;
    const tier = position.creditTier || 1;
    const apr = getAPRForTier(tier);
    const balance = getBalanceForAsset();

    // Debt breakdown
    const usdxDebtAmt = parseFloat(ethers.formatEther(debts.usdxDebt || 0n));
    const ethDebtAmt = parseFloat(ethers.formatEther(debts.ethDebt || 0n));
    const wbtcDebtAmt = parseFloat(ethers.formatUnits(debts.wbtcDebt || 0n, 8));
    const hasMultiDebt = (usdxDebtAmt > 0 ? 1 : 0) + (ethDebtAmt > 0 ? 1 : 0) + (wbtcDebtAmt > 0 ? 1 : 0) > 1;

    // Interest calculations (based on total USD debt)
    const interestInfo = calculateAccruedInterest(address, totalDebtUSD, tier);
    const minPayment = calculateMinimumPayment(totalDebtUSD, apr);
    const repayPlans = generateRepaymentPlans(interestInfo.totalOwed, apr);
    const loanData = getLoanData(address);
    const lateFee = calculateLateFee(loanData);

    const repayAmtUSD = repayAsset === 'ETH' ? (parseFloat(amount) || 0) * prices.ethPrice
        : repayAsset === 'WBTC' ? (parseFloat(amount) || 0) * prices.wbtcPrice
        : (parseFloat(amount) || 0);

    const confirmDetails = [
        { label: 'Repay Amount', value: `${parseFloat(amount || 0).toFixed(repayAsset === 'WBTC' ? 6 : 4)} ${repayAsset}` },
        ...(repayAsset !== 'USDX' ? [{ label: 'USD Value', value: `$${repayAmtUSD.toFixed(2)}` }] : []),
        { label: `Remaining ${repayAsset} Debt`, value: `${remainingDebt.toFixed(repayAsset === 'WBTC' ? 6 : 4)} ${repayAsset}` },
        { label: 'Repayment Progress', value: `${repaymentPct.toFixed(1)}%` },
    ];
    if (lateFee > 0) {
        confirmDetails.push({ label: 'Late Payment Fee', value: `$${lateFee.toFixed(2)}`, style: { color: 'var(--danger)' } });
    }
    if (repaymentPct >= 100) {
        confirmDetails.push({ label: 'Status', value: `Full ${repayAsset} Repayment - Tier Progress +1`, style: { color: 'var(--success)' } });
    }

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Repay Loan</h1>
                        <p className="page-subtitle">Repay your debt to improve your health factor</p>
                    </div>

                    <div className="dashboard-grid">
                        <div className="dashboard-card">
                            <h3 className="card-title">Repay {repayAsset}</h3>
                            <form onSubmit={handleRepayClick} className="flex flex-col gap-lg">
                                <div className="form-group">
                                    <label className="form-label">Asset to Repay</label>
                                    <div className="flex gap-sm">
                                        {['USDX', 'ETH', 'WBTC'].map(a => {
                                            const assetDebt = a === 'ETH' ? ethDebtAmt : a === 'WBTC' ? wbtcDebtAmt : usdxDebtAmt;
                                            return (
                                                <button key={a} type="button"
                                                    className={`btn ${repayAsset === a ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                                    style={{ flex: 1, position: 'relative' }}
                                                    onClick={() => { setRepayAsset(a); setAmount(''); }}>
                                                    {a}
                                                    {assetDebt > 0 && (
                                                        <span style={{ display: 'block', fontSize: '0.65rem', opacity: 0.7 }}>
                                                            {assetDebt.toFixed(a === 'WBTC' ? 4 : a === 'ETH' ? 3 : 2)}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Amount to Repay</label>
                                    <div className="input-group">
                                        <input type="number" className="form-input" placeholder="0.0" step={repayAsset === 'WBTC' ? '0.000001' : '0.01'} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={loading} />
                                        <span className="input-addon">{repayAsset}</span>
                                    </div>
                                    <div className="flex justify-between mt-sm text-sm text-muted">
                                        <span>Debt: {currentDebt.toFixed(repayAsset === 'WBTC' ? 6 : repayAsset === 'ETH' ? 4 : 2)} {repayAsset}</span>
                                        <button type="button" onClick={() => setAmount(Math.min(currentDebt, balance).toFixed(repayAsset === 'WBTC' ? 6 : repayAsset === 'ETH' ? 4 : 2))} disabled={loading || currentDebt === 0}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                                            PAY ALL
                                        </button>
                                    </div>
                                    <div className="text-xs text-muted mt-sm">
                                        Balance: {balance.toFixed(repayAsset === 'WBTC' ? 6 : repayAsset === 'ETH' ? 4 : 2)} {repayAsset}
                                    </div>
                                </div>

                                {/* Quick amount buttons */}
                                {currentDebt > 0 && (
                                    <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                        {repayAsset === 'USDX' && (
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount(minPayment.toFixed(2))} disabled={loading}>
                                                Min (${minPayment.toFixed(2)})
                                            </button>
                                        )}
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount((currentDebt * 0.25).toFixed(repayAsset === 'WBTC' ? 6 : 4))} disabled={loading}>
                                            25%
                                        </button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount((currentDebt * 0.5).toFixed(repayAsset === 'WBTC' ? 6 : 4))} disabled={loading}>
                                            50%
                                        </button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount((currentDebt * 0.75).toFixed(repayAsset === 'WBTC' ? 6 : 4))} disabled={loading}>
                                            75%
                                        </button>
                                    </div>
                                )}

                                {amount && parseFloat(amount) > 0 && (
                                    <div style={{
                                        padding: 'var(--spacing-md)',
                                        background: 'rgba(16,185,129,0.06)',
                                        borderRadius: 'var(--radius-lg)',
                                        border: '1px solid rgba(16,185,129,0.2)',
                                    }}>
                                        <div className="flex justify-between text-sm mb-sm">
                                            <span className="text-muted">Remaining {repayAsset} Debt</span>
                                            <span className="mono font-bold" style={{ fontSize: '1.1rem', color: 'var(--success)' }}>
                                                {remainingDebt.toFixed(repayAsset === 'WBTC' ? 6 : 4)} {repayAsset}
                                            </span>
                                        </div>
                                        {repayAsset !== 'USDX' && (
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">USD Value</span>
                                                <span className="mono">${repayAmtUSD.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">Repayment</span>
                                            <span className="mono font-bold">{repaymentPct.toFixed(1)}%</span>
                                        </div>
                                        {repaymentPct >= 100 && (
                                            <div className="badge badge-success mt-sm">Full Repayment</div>
                                        )}
                                    </div>
                                )}

                                <button type="submit" className="btn btn-success w-full" disabled={loading || !amount || parseFloat(amount) <= 0 || currentDebt === 0}>
                                    {loading ? <><span className="loading"></span> Repaying...</> : `Repay ${repayAsset}`}
                                </button>
                            </form>
                        </div>

                        <div className="dashboard-card">
                            <h3 className="card-title">Loan Details</h3>
                            <div className="flex flex-col gap-lg">
                                {/* Per-asset debt breakdown */}
                                <div>
                                    <div className="text-sm text-muted mb-sm">Total Debt (USD)</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                        ${totalDebtUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>

                                {(usdxDebtAmt > 0 || ethDebtAmt > 0 || wbtcDebtAmt > 0) && (
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                        <div className="text-xs text-muted mb-md" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Debt Breakdown</div>
                                        {usdxDebtAmt > 0 && (
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">USDX</span>
                                                <span className="mono font-bold">{usdxDebtAmt.toFixed(2)} <span className="text-xs text-muted">(${usdxDebtAmt.toFixed(2)})</span></span>
                                            </div>
                                        )}
                                        {ethDebtAmt > 0 && (
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">ETH</span>
                                                <span className="mono font-bold">{ethDebtAmt.toFixed(4)} <span className="text-xs text-muted">(${(ethDebtAmt * prices.ethPrice).toFixed(2)})</span></span>
                                            </div>
                                        )}
                                        {wbtcDebtAmt > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted">WBTC</span>
                                                <span className="mono font-bold">{wbtcDebtAmt.toFixed(6)} <span className="text-xs text-muted">(${(wbtcDebtAmt * prices.wbtcPrice).toFixed(2)})</span></span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Interest Accrual Section */}
                                {totalDebtUSD > 0 && (
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                        <div className="text-sm text-muted mb-sm">
                                            Accrued Interest <Tooltip term="healthFactor" />
                                        </div>
                                        <div className="mono font-bold" style={{ fontSize: '1.25rem', color: 'var(--accent)' }}>
                                            ${interestInfo.interest.toFixed(4)}
                                        </div>
                                        <div className="flex justify-between text-xs text-muted mt-sm">
                                            <span>APR: {formatAPR(interestInfo.apr)}</span>
                                            <span>{interestInfo.daysActive} days active</span>
                                        </div>
                                        {interestInfo.penaltyApplied && (
                                            <div className="badge badge-danger mt-sm" style={{ fontSize: '0.7rem' }}>
                                                Late Penalty: +{(interestInfo.penaltyAPR * 100).toFixed(0)}% APR applied
                                            </div>
                                        )}
                                        {!interestInfo.penaltyApplied && interestInfo.daysUntilPenalty < 15 && interestInfo.daysUntilPenalty > 0 && (
                                            <div className="text-xs mt-sm" style={{ color: 'var(--warning)' }}>
                                                Late penalty in {interestInfo.daysUntilPenalty} days - repay to reset timer
                                            </div>
                                        )}
                                    </div>
                                )}

                                {lateFee > 0 && (
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                        <div className="text-sm text-muted mb-sm">Late Payment Fee</div>
                                        <div className="mono font-bold" style={{ fontSize: '1.25rem', color: 'var(--danger)' }}>
                                            ${lateFee.toFixed(2)}
                                        </div>
                                        <div className="text-xs text-muted mt-sm">Assessed for exceeding 30-day grace period</div>
                                    </div>
                                )}

                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm text-muted mb-sm">
                                        Total Owed (Principal + Interest{lateFee > 0 ? ' + Late Fee' : ''})
                                    </div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>
                                        ${(interestInfo.totalOwed + lateFee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm text-muted mb-sm">Minimum Payment</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.25rem' }}>
                                        ${minPayment.toFixed(2)} <span className="text-xs text-muted">/month</span>
                                    </div>
                                    <div className="text-xs text-muted mt-sm">Interest-only - covers monthly interest charges</div>
                                </div>

                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm text-muted mb-sm">Successful Repayments</div>
                                    <div className="mono font-bold" style={{ fontSize: '2rem' }}>
                                        {position.successfulRepayments || 0}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Repayment Plans */}
                    {totalDebtUSD > 0 && repayPlans.length > 0 && (
                        <div className="dashboard-card mt-lg">
                            <h3 className="card-title">Repayment Plans</h3>
                            <p className="text-sm text-muted mb-lg">Choose a repayment strategy to pay off your loan</p>

                            <div className="grid grid-3" style={{ gap: 'var(--spacing-lg)' }}>
                                {repayPlans.map(plan => (
                                    <div
                                        key={plan.months}
                                        onClick={() => setSelectedPlan(selectedPlan === plan.months ? null : plan.months)}
                                        style={{
                                            padding: 'var(--spacing-lg)',
                                            background: selectedPlan === plan.months ? 'rgba(0,212,170,0.06)' : 'var(--bg-tertiary)',
                                            borderRadius: 'var(--radius-lg)',
                                            border: `1px solid ${selectedPlan === plan.months ? 'var(--primary)' : 'var(--border)'}`,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <div className="flex justify-between items-center mb-md">
                                            <div className="font-bold">{plan.months}-Month</div>
                                            <div className="badge badge-info">{plan.label}</div>
                                        </div>
                                        <div className="mono font-bold" style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: 'var(--spacing-sm)' }}>
                                            ${plan.monthlyPayment.toFixed(2)}
                                            <span className="text-xs text-muted" style={{ fontWeight: 400 }}>/mo</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-muted mb-sm">
                                            <span>Total Interest</span>
                                            <span className="mono">${plan.totalInterest.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-muted">
                                            <span>Total Payment</span>
                                            <span className="mono">${plan.totalPayment.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Amortization Schedule */}
                            {selectedPlan && (() => {
                                const plan = repayPlans.find(p => p.months === selectedPlan);
                                if (!plan) return null;
                                return (
                                    <div style={{ marginTop: 'var(--spacing-lg)', overflow: 'auto' }}>
                                        <div className="text-sm font-bold mb-md">Amortization Schedule ({plan.months}-Month Plan)</div>
                                        <table className="scanner-table">
                                            <thead>
                                                <tr>
                                                    <th>Month</th>
                                                    <th style={{ textAlign: 'right' }}>Payment</th>
                                                    <th style={{ textAlign: 'right' }}>Principal</th>
                                                    <th style={{ textAlign: 'right' }}>Interest</th>
                                                    <th style={{ textAlign: 'right' }}>Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {plan.schedule.map(row => (
                                                    <tr key={row.month}>
                                                        <td>{row.month}</td>
                                                        <td className="text-right mono">${row.payment.toFixed(2)}</td>
                                                        <td className="text-right mono">${row.principal.toFixed(2)}</td>
                                                        <td className="text-right mono" style={{ color: 'var(--accent)' }}>${row.interest.toFixed(2)}</td>
                                                        <td className="text-right mono font-bold">${row.balance.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Credit Tier Roadmap */}
                    <div className="dashboard-card mt-lg">
                        <h3 className="card-title">Your Credit Journey</h3>
                        <CreditTierRoadmap
                            currentTier={tier}
                            repayments={position.successfulRepayments || 0}
                        />
                    </div>
                </div>
            </main>

            <ConfirmationModal
                isOpen={showConfirm}
                onConfirm={executeRepay}
                onCancel={() => setShowConfirm(false)}
                title="Confirm Repayment"
                details={confirmDetails}
                confirmText={`Confirm Repay ${repayAsset}`}
                confirmVariant="primary"
                loading={loading}
            />
        </>
    );
}
