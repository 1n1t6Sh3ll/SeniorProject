import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import Icon from '../components/Icon';
import { getUserPosition, getContract } from '../utils/contracts';

const PRICE_ETH = 2000;
const PRICE_WBTC = 40000;

function MiniBarChart({ data, color = 'var(--primary)', height = 80 }) {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data, 1);
    const barWidth = Math.max(100 / data.length - 1, 4);

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height, width: '100%' }}>
            {data.map((v, i) => (
                <div
                    key={i}
                    style={{
                        flex: 1,
                        height: `${Math.max((v / max) * 100, 4)}%`,
                        background: `${color}`,
                        borderRadius: '3px 3px 0 0',
                        opacity: 0.4 + (i / data.length) * 0.6,
                        minWidth: '4px',
                        transition: 'height 0.3s ease',
                    }}
                    title={`${v.toFixed(2)}`}
                />
            ))}
        </div>
    );
}

function DonutChart({ segments, size = 120 }) {
    const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
    const strokeWidth = 14;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bg-tertiary)" strokeWidth={strokeWidth} />
            {segments.map((seg, i) => {
                const pct = seg.value / total;
                const dashArray = `${circumference * pct} ${circumference * (1 - pct)}`;
                const dashOffset = -offset;
                offset += circumference * pct;
                return (
                    <circle
                        key={i}
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={dashArray}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                    />
                );
            })}
        </svg>
    );
}

export default function Analytics() {
    const { address, isConnected } = useWallet();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [priceHistory, setPriceHistory] = useState({ eth: [], wbtc: [] });
    const [protocolEvents, setProtocolEvents] = useState([]);

    const fetchProtocolStats = useCallback(async () => {
        setLoading(true);
        try {
            const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
            const creditProtocol = getContract('CreditProtocol', provider);

            // Get current block for event queries
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 50000);

            // Fetch all protocol events in parallel
            const [depositEvents, borrowEvents, repayEvents, withdrawEvents] = await Promise.all([
                creditProtocol.queryFilter(creditProtocol.filters.CollateralDeposited(), fromBlock, currentBlock),
                creditProtocol.queryFilter(creditProtocol.filters.Borrowed(), fromBlock, currentBlock),
                creditProtocol.queryFilter(creditProtocol.filters.Repaid(), fromBlock, currentBlock),
                creditProtocol.queryFilter(creditProtocol.filters.CollateralWithdrawn(), fromBlock, currentBlock),
            ]);

            // Calculate TVL from events
            let totalETHDeposited = 0n;
            let totalWBTCDeposited = 0n;
            let totalBorrowed = 0n;
            let totalRepaid = 0n;
            const uniqueUsers = new Set();

            for (const e of depositEvents) {
                uniqueUsers.add(e.args.user.toLowerCase());
                if (e.args.asset === ethers.ZeroAddress) {
                    totalETHDeposited += e.args.amount;
                } else {
                    totalWBTCDeposited += e.args.amount;
                }
            }
            for (const e of withdrawEvents) {
                if (e.args.asset === ethers.ZeroAddress) {
                    totalETHDeposited -= e.args.amount;
                } else {
                    totalWBTCDeposited -= e.args.amount;
                }
            }
            for (const e of borrowEvents) {
                uniqueUsers.add(e.args.user.toLowerCase());
                totalBorrowed += e.args.amount;
            }
            for (const e of repayEvents) {
                totalRepaid += e.args.amount;
            }

            // Ensure non-negative
            if (totalETHDeposited < 0n) totalETHDeposited = 0n;
            if (totalWBTCDeposited < 0n) totalWBTCDeposited = 0n;

            const ethTVL = parseFloat(ethers.formatEther(totalETHDeposited)) * PRICE_ETH;
            const wbtcTVL = parseFloat(ethers.formatUnits(totalWBTCDeposited, 8)) * PRICE_WBTC;
            const outstandingDebt = parseFloat(ethers.formatEther(totalBorrowed > totalRepaid ? totalBorrowed - totalRepaid : 0n));

            // Build recent activity
            const allEvents = [];
            for (const e of [...depositEvents, ...borrowEvents, ...repayEvents, ...withdrawEvents]) {
                let block;
                try { block = await e.getBlock(); } catch { continue; }
                const type = e.fragment?.name || 'Unknown';
                allEvents.push({
                    type,
                    user: e.args.user || e.args[0],
                    blockNumber: e.blockNumber,
                    timestamp: block.timestamp,
                    txHash: e.transactionHash,
                });
            }
            allEvents.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

            setProtocolEvents(allEvents.slice(0, 10));
            setStats({
                tvl: ethTVL + wbtcTVL,
                ethTVL,
                wbtcTVL,
                outstandingDebt,
                totalTransactions: depositEvents.length + borrowEvents.length + repayEvents.length + withdrawEvents.length,
                deposits: depositEvents.length,
                borrows: borrowEvents.length,
                repayments: repayEvents.length,
                withdrawals: withdrawEvents.length,
                uniqueUsers: uniqueUsers.size,
                utilizationRate: (ethTVL + wbtcTVL) > 0 ? (outstandingDebt / (ethTVL + wbtcTVL)) * 100 : 0,
            });

            // Get user position if connected
            if (isConnected && address) {
                const pos = await getUserPosition(address, provider);
                if (pos) {
                    setStats(prev => ({ ...prev, userPosition: pos }));
                }
            }
        } catch (error) {
            console.error('Failed to fetch protocol stats:', error);
            // Set empty stats so page still renders
            setStats({
                tvl: 0, ethTVL: 0, wbtcTVL: 0, outstandingDebt: 0,
                totalTransactions: 0, deposits: 0, borrows: 0, repayments: 0, withdrawals: 0,
                uniqueUsers: 0, utilizationRate: 0,
            });
        } finally {
            setLoading(false);
        }
    }, [isConnected, address]);

    useEffect(() => {
        fetchProtocolStats();
        // Generate simulated price history
        const generateHistory = (base, points = 24) => {
            const data = [];
            let price = base;
            for (let i = 0; i < points; i++) {
                price += (Math.random() - 0.48) * base * 0.01;
                data.push(Math.max(price, base * 0.9));
            }
            return data;
        };
        setPriceHistory({ eth: generateHistory(PRICE_ETH), wbtc: generateHistory(PRICE_WBTC) });
    }, [fetchProtocolStats]);

    const formatUSD = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (loading) {
        return (
            <main className="page-section">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading protocol analytics...</p>
                </div>
            </main>
        );
    }

    const collateralSegments = [
        { label: 'ETH', value: stats?.ethTVL || 0, color: '#627eea' },
        { label: 'WBTC', value: stats?.wbtcTVL || 0, color: '#f7931a' },
    ];

    const activitySegments = [
        { label: 'Deposits', value: stats?.deposits || 0, color: 'var(--primary)' },
        { label: 'Borrows', value: stats?.borrows || 0, color: 'var(--info)' },
        { label: 'Repayments', value: stats?.repayments || 0, color: 'var(--success)' },
        { label: 'Withdrawals', value: stats?.withdrawals || 0, color: 'var(--warning)' },
    ];

    const eventIconNames = {
        CollateralDeposited: 'deposit',
        Borrowed: 'borrow',
        Repaid: 'check',
        CollateralWithdrawn: 'withdraw',
    };

    return (
        <main className="page-section">
            <div className="page-container">
                <div className="page-header">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="page-title">Protocol Analytics</h1>
                                <p className="page-subtitle">Real-time metrics and protocol health overview</p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={fetchProtocolStats}>
                                Refresh Data
                            </button>
                        </div>
                    </div>

                    {/* Top Stats */}
                    <div className="grid grid-4 mb-lg">
                        <div className="stat-card">
                            <div className="stat-label">Total Value Locked</div>
                            <div className="stat-value" style={{ color: 'var(--primary)' }}>{formatUSD(stats?.tvl || 0)}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Outstanding Debt</div>
                            <div className="stat-value" style={{ color: 'var(--warning)' }}>{formatUSD(stats?.outstandingDebt || 0)}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Utilization Rate</div>
                            <div className="stat-value">{(stats?.utilizationRate || 0).toFixed(1)}%</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Unique Users</div>
                            <div className="stat-value">{stats?.uniqueUsers || 0}</div>
                        </div>
                    </div>

                    <div className="dashboard-grid">
                        {/* Collateral Breakdown */}
                        <div className="dashboard-card">
                            <h3 className="card-title">Collateral Composition</h3>
                            <div className="flex items-center gap-lg" style={{ justifyContent: 'center', padding: 'var(--spacing-lg) 0' }}>
                                <DonutChart segments={collateralSegments} />
                                <div className="flex flex-col gap-md">
                                    {collateralSegments.map(s => (
                                        <div key={s.label} className="flex items-center gap-sm">
                                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                            <div>
                                                <div className="font-bold text-sm">{s.label}</div>
                                                <div className="text-xs text-muted">{formatUSD(s.value)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Activity Breakdown */}
                        <div className="dashboard-card">
                            <h3 className="card-title">Transaction Activity</h3>
                            <div className="flex items-center gap-lg" style={{ justifyContent: 'center', padding: 'var(--spacing-lg) 0' }}>
                                <DonutChart segments={activitySegments} />
                                <div className="flex flex-col gap-md">
                                    {activitySegments.map(s => (
                                        <div key={s.label} className="flex items-center gap-sm">
                                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                            <div>
                                                <div className="font-bold text-sm">{s.label}</div>
                                                <div className="text-xs text-muted">{s.value} transactions</div>
                                            </div>
                                        </div>
                                    ))}
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-sm)' }}>
                                        <div className="font-bold text-sm">Total: {stats?.totalTransactions || 0}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ETH Price Chart */}
                        <div className="dashboard-card">
                            <h3 className="card-title">ETH Price (24h Simulated)</h3>
                            <div style={{ padding: 'var(--spacing-md) 0' }}>
                                <MiniBarChart data={priceHistory.eth} color="#627eea" height={100} />
                            </div>
                            <div className="flex justify-between text-sm text-muted mt-sm">
                                <span>Low: ${priceHistory.eth.length > 0 ? Math.min(...priceHistory.eth).toFixed(0) : '—'}</span>
                                <span className="mono font-bold" style={{ fontSize: '1.25rem', color: '#627eea' }}>
                                    ${priceHistory.eth.length > 0 ? priceHistory.eth[priceHistory.eth.length - 1].toFixed(2) : '—'}
                                </span>
                                <span>High: ${priceHistory.eth.length > 0 ? Math.max(...priceHistory.eth).toFixed(0) : '—'}</span>
                            </div>
                        </div>

                        {/* WBTC Price Chart */}
                        <div className="dashboard-card">
                            <h3 className="card-title">WBTC Price (24h Simulated)</h3>
                            <div style={{ padding: 'var(--spacing-md) 0' }}>
                                <MiniBarChart data={priceHistory.wbtc} color="#f7931a" height={100} />
                            </div>
                            <div className="flex justify-between text-sm text-muted mt-sm">
                                <span>Low: ${priceHistory.wbtc.length > 0 ? Math.min(...priceHistory.wbtc).toFixed(0) : '—'}</span>
                                <span className="mono font-bold" style={{ fontSize: '1.25rem', color: '#f7931a' }}>
                                    ${priceHistory.wbtc.length > 0 ? priceHistory.wbtc[priceHistory.wbtc.length - 1].toFixed(2) : '—'}
                                </span>
                                <span>High: ${priceHistory.wbtc.length > 0 ? Math.max(...priceHistory.wbtc).toFixed(0) : '—'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Protocol Parameters */}
                    <div className="dashboard-card mt-lg">
                        <h3 className="card-title">Protocol Parameters</h3>
                        <div className="grid grid-3" style={{ gap: 'var(--spacing-lg)' }}>
                            <div style={{ padding: 'var(--spacing-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>ETH Parameters</div>
                                <div className="flex justify-between mb-sm">
                                    <span className="text-sm text-muted">Base LTV</span>
                                    <span className="mono font-bold" style={{ color: 'var(--success)' }}>60%</span>
                                </div>
                                <div className="flex justify-between mb-sm">
                                    <span className="text-sm text-muted">Liquidation Threshold</span>
                                    <span className="mono font-bold" style={{ color: 'var(--warning)' }}>75%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted">Oracle Price</span>
                                    <span className="mono font-bold">${PRICE_ETH.toLocaleString()}</span>
                                </div>
                            </div>
                            <div style={{ padding: 'var(--spacing-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>WBTC Parameters</div>
                                <div className="flex justify-between mb-sm">
                                    <span className="text-sm text-muted">Base LTV</span>
                                    <span className="mono font-bold" style={{ color: 'var(--success)' }}>65%</span>
                                </div>
                                <div className="flex justify-between mb-sm">
                                    <span className="text-sm text-muted">Liquidation Threshold</span>
                                    <span className="mono font-bold" style={{ color: 'var(--warning)' }}>80%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted">Oracle Price</span>
                                    <span className="mono font-bold">${PRICE_WBTC.toLocaleString()}</span>
                                </div>
                            </div>
                            <div style={{ padding: 'var(--spacing-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Credit Tiers</div>
                                <div className="flex justify-between mb-sm">
                                    <span className="text-sm text-muted">Tier 1 (Bronze)</span>
                                    <span className="mono font-bold">+0% LTV</span>
                                </div>
                                <div className="flex justify-between mb-sm">
                                    <span className="text-sm text-muted">Tier 2 (Silver)</span>
                                    <span className="mono font-bold" style={{ color: '#c0c0c0' }}>+5% LTV</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted">Tier 3 (Gold)</span>
                                    <span className="mono font-bold" style={{ color: '#ffd700' }}>+10% LTV</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recent Protocol Activity */}
                    {protocolEvents.length > 0 && (
                        <div className="dashboard-card mt-lg">
                            <h3 className="card-title">Recent Protocol Activity</h3>
                            <div className="flex flex-col gap-sm">
                                {protocolEvents.map((evt, i) => (
                                    <div key={`${evt.txHash}-${i}`} className="collateral-item" style={{ cursor: 'default' }}>
                                        <div className="flex items-center gap-md" style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '1.25rem', width: 38, height: 38,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-lg)', flexShrink: 0,
                                            }}>
                                                <Icon name={eventIconNames[evt.type] || 'history'} size={20} />
                                            </div>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div className="font-bold text-sm">
                                                    {evt.type.replace(/([A-Z])/g, ' $1').trim()}
                                                </div>
                                                <div className="text-xs text-muted mono">
                                                    {evt.user ? `${evt.user.slice(0, 8)}...${evt.user.slice(-6)}` : ''}
                                                    {' '}&middot; Block #{evt.blockNumber}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ fontSize: '0.75rem', padding: '4px 10px', flexShrink: 0 }}
                                            onClick={() => navigator.clipboard.writeText(evt.txHash)}
                                            title={evt.txHash}
                                        >
                                            Copy Tx
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
        </main>
    );
}
