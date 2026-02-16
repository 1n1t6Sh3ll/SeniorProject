import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { getUserPosition, getOraclePrices, getReadProvider } from '../utils/contracts';

export default function QuickStatsBar() {
    const { address, isConnected } = useWallet();
    const [stats, setStats] = useState(null);

    useEffect(() => {
        if (isConnected && address) {
            fetchStats();
            const interval = setInterval(fetchStats, 15000);
            return () => clearInterval(interval);
        } else {
            setStats(null);
        }
    }, [isConnected, address]);

    const fetchStats = async () => {
        try {
            const provider = getReadProvider();
            const [pos, prices] = await Promise.all([
                getUserPosition(address, provider),
                getOraclePrices(provider),
            ]);
            if (!pos) { setStats(null); return; }

            const ethVal = parseFloat(ethers.formatEther(pos.ethCollateral || 0n)) * prices.ethPrice;
            const wbtcVal = parseFloat(ethers.formatUnits(pos.wbtcCollateral || 0n, 8)) * prices.wbtcPrice;
            const totalCollateral = ethVal + wbtcVal;
            const debt = parseFloat(ethers.formatEther(pos.debtAmount || 0n));

            let hf = 999;
            const hfBig = typeof pos.healthFactor === 'bigint' ? pos.healthFactor : BigInt(pos.healthFactor || 0);
            if (hfBig > 0n && hfBig < BigInt('1000000000000000000000')) {
                hf = parseFloat(ethers.formatEther(hfBig));
            }

            setStats({
                healthFactor: hf,
                totalCollateral,
                debt,
                creditTier: pos.creditTier,
            });
        } catch {
            // Silently fail - bar just won't show
        }
    };

    if (!isConnected || !stats) return null;

    const hfColor = stats.healthFactor < 1 ? 'var(--danger)'
        : stats.healthFactor < 1.5 ? 'var(--warning)'
        : 'var(--success)';

    return (
        <div className="quick-stats-bar">
            <div className="quick-stat">
                <span className="quick-stat-label">Health</span>
                <span className="quick-stat-value" style={{ color: hfColor }}>
                    {stats.healthFactor >= 999 ? '\u221E' : stats.healthFactor.toFixed(2)}
                </span>
            </div>
            <div className="quick-stat-divider" />
            <div className="quick-stat">
                <span className="quick-stat-label">Collateral</span>
                <span className="quick-stat-value">
                    ${stats.totalCollateral.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
            <div className="quick-stat-divider" />
            <div className="quick-stat">
                <span className="quick-stat-label">Debt</span>
                <span className="quick-stat-value" style={{ color: stats.debt > 0 ? 'var(--accent)' : 'var(--text-primary)' }}>
                    ${stats.debt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
            <div className="quick-stat-divider" />
            <div className="quick-stat">
                <span className="quick-stat-label">Tier</span>
                <span className="quick-stat-value">{stats.creditTier}</span>
            </div>
        </div>
    );
}
