import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import TransactionReceipt from '../components/TransactionReceipt';
import { getTransactionHistory, getUserPosition, getOraclePrices, getUserUSDXCollateral, getReadProvider } from '../utils/contracts';
import { calculateAccruedInterest } from '../utils/interest';
import { calculateEarnedYield } from '../utils/supplyYield';
import { getOwnedAssets, getAssetCollateralValue } from '../utils/assetPortfolio';

export default function Portfolio() {
    const { address, isConnected } = useWallet();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [position, setPosition] = useState(null);
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [usdxCol, setUsdxCol] = useState(0);

    // Filters
    const [typeFilter, setTypeFilter] = useState('all');
    const [assetFilter, setAssetFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTx, setSelectedTx] = useState(null);

    useEffect(() => {
        if (isConnected && address) fetchData();
    }, [isConnected, address]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const provider = getReadProvider();
            const [txs, pos, oraclePrices, usdxCollateral] = await Promise.all([
                getTransactionHistory(address, provider),
                getUserPosition(address, provider),
                getOraclePrices(provider),
                getUserUSDXCollateral(address, provider).catch(() => '0'),
            ]);
            setTransactions(txs);
            setPosition(pos);
            setPrices(oraclePrices);
            setUsdxCol(parseFloat(usdxCollateral));
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getEventIcon = (type) => {
        const iconNames = {
            CollateralDeposited: 'deposit',
            Borrowed: 'borrow',
            Repaid: 'check',
            CollateralWithdrawn: 'withdraw',
            TierUpgraded: 'shield',
        };
        return <Icon name={iconNames[type] || 'history'} size={22} />;
    };

    const getEventColor = (type) => {
        const colors = {
            CollateralDeposited: 'var(--primary)',
            Borrowed: 'var(--info)',
            Repaid: 'var(--success)',
            CollateralWithdrawn: 'var(--warning)',
            TierUpgraded: 'var(--accent)',
        };
        return colors[type] || 'var(--text-secondary)';
    };

    const formatTimestamp = (timestamp) => {
        const date = new Date(Number(timestamp) * 1000);
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    };

    const formatEventName = (type) => type.replace(/([A-Z])/g, ' $1').trim();

    const getFilteredTransactions = () => {
        return transactions.filter(tx => {
            if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
            if (assetFilter !== 'all' && tx.asset !== assetFilter) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchHash = tx.txHash?.toLowerCase().includes(q);
                const matchAmount = tx.amount?.includes(q);
                const matchType = tx.type?.toLowerCase().includes(q);
                if (!matchHash && !matchAmount && !matchType) return false;
            }
            return true;
        });
    };

    const exportCSV = () => {
        const filtered = getFilteredTransactions();
        if (filtered.length === 0) return;
        const headers = ['Date', 'Type', 'Amount', 'Asset', 'Tx Hash'];
        const rows = filtered.map(tx => [
            new Date(Number(tx.timestamp) * 1000).toLocaleString(),
            formatEventName(tx.type),
            tx.amount || '',
            tx.asset || '',
            tx.txHash || '',
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `portfolio_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const filtered = getFilteredTransactions();
    const txTypes = [...new Set(transactions.map(t => t.type))];
    const txAssets = [...new Set(transactions.filter(t => t.asset).map(t => t.asset))];

    // Account summary
    const ethDeposited = position ? parseFloat(ethers.formatEther(position.ethCollateral || 0n)) : 0;
    const wbtcDeposited = position ? parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8)) : 0;
    const debt = position ? parseFloat(ethers.formatEther(position.debtAmount || 0n)) : 0;
    const totalCollateralUSD = ethDeposited * prices.ethPrice + wbtcDeposited * prices.wbtcPrice + usdxCol;
    const tier = position?.creditTier || 1;
    const interestInfo = debt > 0 ? calculateAccruedInterest(address, debt, tier) : null;
    const yieldInfo = calculateEarnedYield(address, ethDeposited, wbtcDeposited, prices);
    const marketplaceAssets = getOwnedAssets(address);
    const totalAssetValue = marketplaceAssets.reduce((s, a) => s + a.currentValue, 0);
    const assetCollateralVal = getAssetCollateralValue(address);

    // Count stats from transactions
    const totalDeposited = transactions.filter(t => t.type === 'CollateralDeposited').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalBorrowed = transactions.filter(t => t.type === 'Borrowed').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalRepaid = transactions.filter(t => t.type === 'Repaid').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Portfolio</h1>
                        <p className="page-subtitle">Your account summary and transaction history</p>
                    </div>

                    {/* Account Summary */}
                    {position && (
                        <div className="dashboard-card mb-lg">
                            <h3 className="card-title">Account Summary</h3>
                            <div className="grid grid-2" style={{ gap: 'var(--spacing-xl)' }}>
                                <div className="flex flex-col gap-md">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Total Collateral</span>
                                        <span className="mono font-bold">${totalCollateralUSD.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Outstanding Debt</span>
                                        <span className="mono font-bold">${debt.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Accrued Interest</span>
                                        <span className="mono" style={{ color: 'var(--accent)' }}>${interestInfo ? interestInfo.interest.toFixed(4) : '0.00'}</span>
                                    </div>
                                    {marketplaceAssets.length > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">Marketplace Assets ({marketplaceAssets.length})</span>
                                            <span className="mono font-bold">${totalAssetValue.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {assetCollateralVal > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">Assets Pledged as Collateral</span>
                                            <span className="mono" style={{ color: 'var(--primary)' }}>${assetCollateralVal.toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-md">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Total Deposited (all time)</span>
                                        <span className="mono font-bold">{totalDeposited.toFixed(4)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Total Borrowed (all time)</span>
                                        <span className="mono">{totalBorrowed.toFixed(2)} USDX</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Total Yield Earned</span>
                                        <span className="mono" style={{ color: 'var(--success)' }}>${yieldInfo.totalYieldUSD.toFixed(4)}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-between text-sm mt-md" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-md)' }}>
                                <span className="text-muted">Net Position (Collateral + Assets - Debt)</span>
                                <span className="mono font-bold" style={{ fontSize: '1.1rem', color: totalCollateralUSD + totalAssetValue - debt > 0 ? 'var(--success)' : 'var(--danger)' }}>
                                    ${(totalCollateralUSD + totalAssetValue - debt).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Transaction History */}
                    <div className="dashboard-card">
                        <div className="flex justify-between items-center mb-lg" style={{ flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                            <h3 className="card-title" style={{ margin: 0 }}>Transaction History</h3>
                            <div className="flex gap-sm">
                                <button onClick={exportCSV} className="btn btn-secondary btn-sm" disabled={filtered.length === 0}>
                                    <Icon name="download" size={12} /> CSV
                                </button>
                                <button onClick={fetchData} className="btn btn-secondary btn-sm" disabled={loading}>
                                    {loading ? 'Loading...' : 'Refresh'}
                                </button>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="flex gap-sm mb-lg" style={{ flexWrap: 'wrap' }}>
                            <div className="input-group" style={{ flex: '1 1 200px' }}>
                                <span className="input-addon" style={{ padding: '0 8px' }}><Icon name="search" size={14} /></span>
                                <input type="text" className="form-input" placeholder="Search tx hash, amount..."
                                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    style={{ fontSize: '0.85rem' }} />
                            </div>
                            <select className="form-input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                                style={{ width: 'auto', fontSize: '0.85rem' }}>
                                <option value="all">All Types</option>
                                {txTypes.map(t => (
                                    <option key={t} value={t}>{formatEventName(t)}</option>
                                ))}
                            </select>
                            <select className="form-input" value={assetFilter} onChange={e => setAssetFilter(e.target.value)}
                                style={{ width: 'auto', fontSize: '0.85rem' }}>
                                <option value="all">All Assets</option>
                                {txAssets.map(a => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                            </select>
                        </div>

                        {loading && transactions.length === 0 ? (
                            <div className="loading-container" style={{ minHeight: '200px' }}>
                                <div className="spinner"></div>
                                <p>Loading transactions...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center" style={{ padding: 'var(--spacing-3xl)' }}>
                                <div style={{ marginBottom: 'var(--spacing-md)' }}><Icon name="portfolio" size={64} /></div>
                                <h3 className="mb-sm">{transactions.length === 0 ? 'No Transactions Yet' : 'No Matching Transactions'}</h3>
                                <p className="text-muted mb-lg">
                                    {transactions.length === 0
                                        ? 'Start by depositing collateral to see your activity here'
                                        : 'Try adjusting your filters or search query'}
                                </p>
                                {transactions.length === 0 && (
                                    <Link to="/deposit" className="btn btn-primary">Make First Deposit</Link>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="text-xs text-muted mb-sm">
                                    Showing {filtered.length} of {transactions.length} transactions
                                </div>
                                <div className="flex flex-col gap-sm">
                                    {filtered.map((tx, index) => (
                                        <div
                                            key={`${tx.txHash}-${index}`}
                                            className="collateral-item"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setSelectedTx(tx)}
                                        >
                                            <div className="flex items-center gap-md" style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: '1.5rem',
                                                    width: 44, height: 44,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: `${getEventColor(tx.type)}15`,
                                                    borderRadius: 'var(--radius-lg)',
                                                    flexShrink: 0,
                                                    border: `1px solid ${getEventColor(tx.type)}25`,
                                                }}>
                                                    {getEventIcon(tx.type)}
                                                </div>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div className="font-bold" style={{ color: getEventColor(tx.type), fontSize: '0.9rem' }}>
                                                        {formatEventName(tx.type)}
                                                    </div>
                                                    <div className="text-xs text-muted flex items-center gap-sm" style={{ flexWrap: 'wrap' }}>
                                                        {tx.amount && (
                                                            <span className="mono font-bold" style={{ color: 'var(--text-primary)' }}>
                                                                {parseFloat(tx.amount).toFixed(tx.asset === 'WBTC' ? 6 : 4)} {tx.asset}
                                                            </span>
                                                        )}
                                                        <span>&middot;</span>
                                                        <span>{formatTimestamp(tx.timestamp)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                style={{ fontSize: '0.78rem', padding: '6px 12px', flexShrink: 0 }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTx(tx);
                                                }}
                                                title="View Receipt"
                                            >
                                                Receipt
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>

            <TransactionReceipt
                isOpen={!!selectedTx}
                onClose={() => setSelectedTx(null)}
                transaction={selectedTx}
            />
        </>
    );
}
