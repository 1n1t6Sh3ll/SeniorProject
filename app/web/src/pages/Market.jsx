import { useState, useEffect } from 'react';
import Icon from '../components/Icon';

const MARKET_DATA = [
    { symbol: 'ETH', name: 'Ethereum', icon: '\u039E', basePrice: 2000, color: '#627eea' },
    { symbol: 'BTC', name: 'Bitcoin', icon: '\u20BF', basePrice: 40000, color: '#f7931a' },
    { symbol: 'USDX', name: 'USDX Stablecoin', icon: '$', basePrice: 1.00, color: '#00d4aa', stable: true },
    { symbol: 'USDC', name: 'USD Coin', icon: '$', basePrice: 1.00, color: '#2775ca', stable: true },
    { symbol: 'SOL', name: 'Solana', icon: 'S', basePrice: 95, color: '#9945ff' },
    { symbol: 'AVAX', name: 'Avalanche', icon: 'A', basePrice: 28, color: '#e84142' },
    { symbol: 'LINK', name: 'Chainlink', icon: 'L', basePrice: 14, color: '#2a5ada' },
    { symbol: 'UNI', name: 'Uniswap', icon: 'U', basePrice: 7.50, color: '#ff007a' },
];

function generatePrice(basePrice, stable) {
    if (stable) return basePrice + (Math.random() - 0.5) * 0.002;
    const variance = basePrice * 0.03;
    return basePrice + (Math.random() - 0.5) * variance;
}

function generateChange(stable) {
    if (stable) return (Math.random() - 0.5) * 0.1;
    return (Math.random() - 0.5) * 8;
}

function generateVolume(basePrice) {
    return basePrice * (Math.random() * 500000 + 100000);
}

function generateMarketCap(basePrice) {
    return basePrice * (Math.random() * 100000000 + 10000000);
}

function formatLargeNumber(num) {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

export default function Market() {
    const [prices, setPrices] = useState([]);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    const refreshPrices = () => {
        const newPrices = MARKET_DATA.map(token => ({
            ...token,
            price: generatePrice(token.basePrice, token.stable),
            change24h: generateChange(token.stable),
            change7d: generateChange(token.stable) * 2,
            volume24h: generateVolume(token.basePrice),
            marketCap: generateMarketCap(token.basePrice),
            sparkline: Array.from({ length: 24 }, () => generatePrice(token.basePrice, token.stable)),
        }));
        setPrices(newPrices);
        setLastUpdate(new Date());
    };

    useEffect(() => {
        refreshPrices();
        const interval = setInterval(refreshPrices, 30000);
        return () => clearInterval(interval);
    }, []);

    const totalMarketCap = prices.reduce((sum, p) => sum + p.marketCap, 0);
    const totalVolume = prices.reduce((sum, p) => sum + p.volume24h, 0);

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="page-title">Market Overview</h1>
                                <p className="page-subtitle">
                                    Live crypto prices and market data &middot; Updated {lastUpdate.toLocaleTimeString()}
                                </p>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={refreshPrices}>
                                Refresh Prices
                            </button>
                        </div>
                    </div>

                    {/* Market Stats */}
                    <div className="grid grid-3 mb-lg">
                        <div className="stat-card">
                            <div className="stat-label">Total Market Cap</div>
                            <div className="stat-value">{formatLargeNumber(totalMarketCap)}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">24h Volume</div>
                            <div className="stat-value">{formatLargeNumber(totalVolume)}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Assets Tracked</div>
                            <div className="stat-value">{prices.length}</div>
                        </div>
                    </div>

                    {/* Price Table */}
                    <div className="dashboard-card" style={{ overflow: 'auto' }}>
                        <table className="market-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Asset</th>
                                    <th style={{ textAlign: 'right' }}>Price</th>
                                    <th style={{ textAlign: 'right' }}>24h Change</th>
                                    <th style={{ textAlign: 'right' }}>7d Change</th>
                                    <th style={{ textAlign: 'right' }}>24h Volume</th>
                                    <th style={{ textAlign: 'right' }}>Market Cap</th>
                                    <th style={{ textAlign: 'right' }}>Trend</th>
                                </tr>
                            </thead>
                            <tbody>
                                {prices.map((token, idx) => (
                                    <tr key={token.symbol}>
                                        <td style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>{idx + 1}</td>
                                        <td>
                                            <div className="flex items-center gap-md">
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: '50%',
                                                    background: `${token.color}20`,
                                                    border: `1px solid ${token.color}40`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '1rem', fontWeight: 800, color: token.color, flexShrink: 0
                                                }}>
                                                    {token.icon}
                                                </div>
                                                <div>
                                                    <div className="font-bold">{token.symbol}</div>
                                                    <div className="text-xs text-muted">{token.name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right mono font-bold">
                                            ${token.price < 10 ? token.price.toFixed(4) : token.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className={`text-right mono font-bold ${token.change24h >= 0 ? 'price-up' : 'price-down'}`}>
                                            {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%
                                        </td>
                                        <td className={`text-right mono font-bold ${token.change7d >= 0 ? 'price-up' : 'price-down'}`}>
                                            {token.change7d >= 0 ? '+' : ''}{token.change7d.toFixed(2)}%
                                        </td>
                                        <td className="text-right mono">{formatLargeNumber(token.volume24h)}</td>
                                        <td className="text-right mono">{formatLargeNumber(token.marketCap)}</td>
                                        <td className="text-right">
                                            <MiniSparkline data={token.sparkline} color={token.change24h >= 0 ? '#10b981' : '#ef4444'} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="info-box info mt-lg">
                        <strong>Note:</strong> This is a test environment. Prices shown are simulated and do not reflect real market data.
                        In production, this would connect to live price feeds via Chainlink oracles.
                    </div>
                </div>
            </main>
        </>
    );
}

function MiniSparkline({ data, color }) {
    if (!data || data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 80;
    const height = 28;

    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} style={{ display: 'block', marginLeft: 'auto' }}>
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
