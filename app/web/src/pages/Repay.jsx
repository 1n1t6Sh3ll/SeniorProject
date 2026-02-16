import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { ethers } from 'ethers';
import Tooltip from '../components/Tooltip';
import ConfirmationModal from '../components/ConfirmationModal';
import CreditTierRoadmap from '../components/CreditTierRoadmap';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { repayUSDX, getUserPosition, getUSDXBalance, getReadProvider } from '../utils/contracts';
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
    const [loading, setLoading] = useState(false);
    const [position, setPosition] = useState(null);
    const [usdxBalance, setUSDXBalance] = useState('0');
    const [showConfirm, setShowConfirm] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);

    useEffect(() => {
        if (isConnected && address) fetchData();
    }, [isConnected, address]);

    const fetchData = async () => {
        try {
            const provider = getReadProvider();
            const pos = await getUserPosition(address, provider);
            const balance = await getUSDXBalance(address, provider);
            setPosition(pos);
            setUSDXBalance(balance);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const handleRepayClick = (e) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) { toast.warning('Invalid Amount', 'Please enter a valid amount'); return; }
        if (!position) { toast.error('Error', 'Unable to fetch your position'); return; }
        const currentDebt = parseFloat(ethers.formatEther(position.debtAmount || 0n));
        if (parseFloat(amount) > currentDebt) { toast.error('Exceeds Debt', `Your debt is only ${currentDebt.toFixed(2)} USDX`); return; }
        if (parseFloat(amount) > parseFloat(usdxBalance)) { toast.error('Insufficient Balance', `You only have ${parseFloat(usdxBalance).toFixed(2)} USDX`); return; }
        if (!isConnected) { toast.error('Error', 'Please connect your wallet'); return; }
        setShowConfirm(true);
    };

    const executeRepay = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            const signer = await getSignerFn();
            const tx = await repayUSDX(amount, signer);
            const txHash = tx?.hash || tx?.transactionHash || '';
            recordRepayment(address, amount);
            toast.tx('Repayment Successful', `Repaid ${amount} USDX`, txHash);
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

    const currentDebt = parseFloat(ethers.formatEther(position.debtAmount || 0n));
    const remainingDebt = Math.max(0, currentDebt - (parseFloat(amount) || 0));
    const repaymentPct = currentDebt > 0 ? ((parseFloat(amount) || 0) / currentDebt) * 100 : 0;
    const tier = position.creditTier || 1;
    const apr = getAPRForTier(tier);

    // Interest calculations
    const interestInfo = calculateAccruedInterest(address, currentDebt, tier);
    const minPayment = calculateMinimumPayment(currentDebt, apr);
    const repayPlans = generateRepaymentPlans(interestInfo.totalOwed, apr);
    const loanData = getLoanData(address);
    const lateFee = calculateLateFee(loanData);

    const confirmDetails = [
        { label: 'Repay Amount', value: `${parseFloat(amount || 0).toFixed(2)} USDX` },
        { label: 'Remaining Debt', value: `$${remainingDebt.toFixed(2)}` },
        { label: 'Repayment Progress', value: `${repaymentPct.toFixed(1)}%` },
    ];
    if (lateFee > 0) {
        confirmDetails.push({ label: 'Late Payment Fee', value: `$${lateFee.toFixed(2)}`, style: { color: 'var(--danger)' } });
    }
    if (repaymentPct >= 100) {
        confirmDetails.push({ label: 'Status', value: 'Full Repayment - Tier Progress +1', style: { color: 'var(--success)' } });
    }

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Repay Loan</h1>
                        <p className="page-subtitle">Repay your USDX debt to improve your health factor</p>
                    </div>

                    <div className="dashboard-grid">
                        <div className="dashboard-card">
                            <h3 className="card-title">Repay USDX</h3>
                            <form onSubmit={handleRepayClick} className="flex flex-col gap-lg">
                                <div className="form-group">
                                    <label className="form-label">Amount to Repay</label>
                                    <div className="input-group">
                                        <input type="number" className="form-input" placeholder="0.0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={loading} />
                                        <span className="input-addon">USDX</span>
                                    </div>
                                    <div className="flex justify-between mt-sm text-sm text-muted">
                                        <span>Debt: {currentDebt.toFixed(2)} USDX</span>
                                        <button type="button" onClick={() => setAmount(Math.min(currentDebt, parseFloat(usdxBalance)).toFixed(2))} disabled={loading || currentDebt === 0}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                                            PAY ALL
                                        </button>
                                    </div>
                                    <div className="text-xs text-muted mt-sm">
                                        Balance: {parseFloat(usdxBalance).toFixed(2)} USDX
                                    </div>
                                </div>

                                {/* Quick amount buttons */}
                                {currentDebt > 0 && (
                                    <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount(minPayment.toFixed(2))} disabled={loading}>
                                            Min (${minPayment.toFixed(2)})
                                        </button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount((currentDebt * 0.25).toFixed(2))} disabled={loading}>
                                            25%
                                        </button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount((currentDebt * 0.5).toFixed(2))} disabled={loading}>
                                            50%
                                        </button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount((currentDebt * 0.75).toFixed(2))} disabled={loading}>
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
                                            <span className="text-muted">Remaining Debt</span>
                                            <span className="mono font-bold" style={{ fontSize: '1.1rem', color: 'var(--success)' }}>
                                                ${remainingDebt.toFixed(2)}
                                            </span>
                                        </div>
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
                                    {loading ? <><span className="loading"></span> Repaying...</> : 'Repay USDX'}
                                </button>
                            </form>
                        </div>

                        <div className="dashboard-card">
                            <h3 className="card-title">Loan Details</h3>
                            <div className="flex flex-col gap-lg">
                                <div>
                                    <div className="text-sm text-muted mb-sm">Principal Debt</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                        ${currentDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>

                                {/* Interest Accrual Section */}
                                {currentDebt > 0 && (
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
                                            ${lateFee.toFixed(2)} USDX
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
                    {currentDebt > 0 && repayPlans.length > 0 && (
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
                confirmText="Confirm Repay"
                confirmVariant="primary"
                loading={loading}
            />
        </>
    );
}
