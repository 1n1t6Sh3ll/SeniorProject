import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import Icon from '../components/Icon';
import { getTransactionHistory, getUserPosition, getOraclePrices, getReadProvider } from '../utils/contracts';
import { calculateAccruedInterest, getLoanData } from '../utils/interest';
import { calculateEarnedYield } from '../utils/supplyYield';
import { getFeeSchedule } from '../utils/fees';

export default function Statements() {
    const { address, isConnected } = useWallet();
    const [transactions, setTransactions] = useState([]);
    const [position, setPosition] = useState(null);
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [loading, setLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    useEffect(() => {
        if (isConnected && address) fetchData();
    }, [isConnected, address]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const provider = getReadProvider();
            const [txs, pos, oraclePrices] = await Promise.all([
                getTransactionHistory(address, provider),
                getUserPosition(address, provider),
                getOraclePrices(provider),
            ]);
            setTransactions(txs);
            setPosition(pos);
            setPrices(oraclePrices);
        } catch (err) {
            console.error('Failed to fetch statement data:', err);
        } finally {
            setLoading(false);
        }
    };

    const getMonthOptions = () => {
        const options = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            options.push({ value: val, label });
        }
        return options;
    };

    const getFilteredTransactions = () => {
        const [year, month] = selectedMonth.split('-').map(Number);
        return transactions.filter(tx => {
            const date = new Date(Number(tx.timestamp) * 1000);
            return date.getFullYear() === year && date.getMonth() + 1 === month;
        });
    };

    const getStatementSummary = () => {
        const filtered = getFilteredTransactions();
        const summary = { deposits: 0, withdrawals: 0, borrows: 0, repayments: 0, count: filtered.length };

        filtered.forEach(tx => {
            const amt = parseFloat(tx.amount) || 0;
            if (tx.type === 'CollateralDeposited') summary.deposits += amt;
            else if (tx.type === 'CollateralWithdrawn') summary.withdrawals += amt;
            else if (tx.type === 'Borrowed') summary.borrows += amt;
            else if (tx.type === 'Repaid') summary.repayments += amt;
        });

        return summary;
    };

    const exportCSV = () => {
        const filtered = getFilteredTransactions();
        if (filtered.length === 0) return;

        const headers = ['Date', 'Type', 'Amount', 'Asset', 'Tx Hash'];
        const rows = filtered.map(tx => [
            new Date(Number(tx.timestamp) * 1000).toLocaleString(),
            tx.type.replace(/([A-Z])/g, ' $1').trim(),
            tx.amount || '',
            tx.asset || '',
            tx.txHash || '',
        ]);

        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `statement_${selectedMonth}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handlePrint = () => {
        window.print();
    };

    const filtered = getFilteredTransactions();
    const summary = getStatementSummary();
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthLabel = new Date(year, month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

    const tier = position?.creditTier || 1;
    const debt = position ? parseFloat(ethers.formatEther(position.debtAmount || 0n)) : 0;
    const interestInfo = debt > 0 ? calculateAccruedInterest(address, debt, tier) : null;
    const ethDeposited = position ? parseFloat(ethers.formatEther(position.ethCollateral || 0n)) : 0;
    const wbtcDeposited = position ? parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8)) : 0;
    const yieldInfo = calculateEarnedYield(address, ethDeposited, wbtcDeposited, prices);

    return (
        <main className="page-section">
            <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Account Statements</h1>
                        <p className="page-subtitle">Monthly account summaries and transaction records</p>
                    </div>

                    {/* Controls */}
                    <div className="dashboard-card mb-lg">
                        <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
                            <div className="flex items-center gap-md">
                                <label className="form-label" style={{ margin: 0 }}>Statement Period:</label>
                                <select className="form-input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                                    style={{ width: 'auto' }}>
                                    {getMonthOptions().map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-sm">
                                <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={filtered.length === 0}>
                                    <Icon name="download" size={14} /> Export CSV
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
                                    Print
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Statement */}
                    <div className="statement-document">
                        <div className="statement-header-section">
                            <div className="flex justify-between items-start" style={{ flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
                                <div>
                                    <h2 className="statement-bank-name">CRYPTOCREDIT BANK</h2>
                                    <div className="text-sm text-muted">Monthly Account Statement</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="font-bold">{monthLabel}</div>
                                    <div className="mono text-xs text-muted mt-xs">
                                        {address ? `${address.slice(0, 10)}...${address.slice(-8)}` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Account Summary */}
                        <div className="statement-section">
                            <h3 className="statement-section-title">Account Summary</h3>
                            <div className="grid grid-2" style={{ gap: 'var(--spacing-lg)' }}>
                                <div>
                                    <div className="statement-summary-row">
                                        <span>Collateral (ETH)</span>
                                        <span className="mono">{ethDeposited.toFixed(4)} ETH</span>
                                    </div>
                                    <div className="statement-summary-row">
                                        <span>Collateral (WBTC)</span>
                                        <span className="mono">{wbtcDeposited.toFixed(6)} WBTC</span>
                                    </div>
                                    <div className="statement-summary-row">
                                        <span>Total Collateral Value</span>
                                        <span className="mono font-bold">${(ethDeposited * prices.ethPrice + wbtcDeposited * prices.wbtcPrice).toFixed(2)}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="statement-summary-row">
                                        <span>Outstanding Debt</span>
                                        <span className="mono">${debt.toFixed(2)}</span>
                                    </div>
                                    <div className="statement-summary-row">
                                        <span>Accrued Interest</span>
                                        <span className="mono" style={{ color: 'var(--accent)' }}>${interestInfo ? interestInfo.interest.toFixed(4) : '0.00'}</span>
                                    </div>
                                    <div className="statement-summary-row">
                                        <span>Yield Earned</span>
                                        <span className="mono" style={{ color: 'var(--success)' }}>${yieldInfo.totalYieldUSD.toFixed(4)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Activity Summary */}
                        <div className="statement-section">
                            <h3 className="statement-section-title">Activity Summary — {monthLabel}</h3>
                            <div className="grid grid-2" style={{ gap: 'var(--spacing-lg)' }}>
                                <div className="statement-summary-row">
                                    <span>Total Deposits</span>
                                    <span className="mono" style={{ color: 'var(--primary)' }}>{summary.deposits > 0 ? summary.deposits.toFixed(4) : '—'}</span>
                                </div>
                                <div className="statement-summary-row">
                                    <span>Total Withdrawals</span>
                                    <span className="mono" style={{ color: 'var(--warning)' }}>{summary.withdrawals > 0 ? summary.withdrawals.toFixed(4) : '—'}</span>
                                </div>
                                <div className="statement-summary-row">
                                    <span>Total Borrows</span>
                                    <span className="mono">{summary.borrows > 0 ? summary.borrows.toFixed(2) : '—'}</span>
                                </div>
                                <div className="statement-summary-row">
                                    <span>Total Repayments</span>
                                    <span className="mono" style={{ color: 'var(--success)' }}>{summary.repayments > 0 ? summary.repayments.toFixed(2) : '—'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Fee Schedule */}
                        <div className="statement-section">
                            <h3 className="statement-section-title">Fee Schedule</h3>
                            <table className="scanner-table">
                                <thead>
                                    <tr>
                                        <th>Fee Type</th>
                                        <th>Rate</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getFeeSchedule().map((fee, i) => (
                                        <tr key={i}>
                                            <td className="font-bold">{fee.name}</td>
                                            <td className="mono">{fee.display}</td>
                                            <td className="text-muted">{fee.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Transaction List */}
                        <div className="statement-section">
                            <h3 className="statement-section-title">
                                Transactions ({filtered.length})
                            </h3>
                            {filtered.length === 0 ? (
                                <div className="text-center text-muted" style={{ padding: 'var(--spacing-xl)' }}>
                                    No transactions for this period
                                </div>
                            ) : (
                                <table className="scanner-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Type</th>
                                            <th style={{ textAlign: 'right' }}>Amount</th>
                                            <th>Asset</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((tx, i) => (
                                            <tr key={i}>
                                                <td className="mono text-xs">
                                                    {new Date(Number(tx.timestamp) * 1000).toLocaleDateString()}
                                                </td>
                                                <td>{tx.type.replace(/([A-Z])/g, ' $1').trim()}</td>
                                                <td className="text-right mono font-bold">
                                                    {tx.amount ? parseFloat(tx.amount).toFixed(tx.asset === 'WBTC' ? 6 : 4) : '—'}
                                                </td>
                                                <td>{tx.asset || ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
        </main>
    );
}
