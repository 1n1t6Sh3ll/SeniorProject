import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';
import { getWBTCBalance, getUSDXBalance, getReadProvider } from '../utils/contracts';
import Icon from './Icon';

export default function Wallet() {
    const { address, isConnected } = useWallet();
    const [balances, setBalances] = useState({ eth: '0', usdx: '0', wbtc: '0' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isConnected && address) {
            fetchBalances();
            const interval = setInterval(fetchBalances, 15000);
            return () => clearInterval(interval);
        }
    }, [isConnected, address]);

    const fetchBalances = async () => {
        setLoading(true);
        try {
            const provider = getReadProvider();
            const [ethBal, usdxBal, wbtcBal] = await Promise.all([
                provider.getBalance(address),
                getUSDXBalance(address, provider),
                getWBTCBalance(address, provider),
            ]);
            setBalances({
                eth: ethers.formatEther(ethBal),
                usdx: usdxBal,
                wbtc: wbtcBal,
            });
        } catch (err) {
            console.error('Wallet fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isConnected) return null;

    const tokens = [
        { symbol: 'ETH', icon: '\u039E', balance: balances.eth, decimals: 4 },
        { symbol: 'USDX', icon: '$', balance: balances.usdx, decimals: 2 },
        { symbol: 'WBTC', icon: '\u20BF', balance: balances.wbtc, decimals: 6 },
    ];

    return (
        <div className="wallet-container">
            <div className="wallet-balance-section">
                {tokens.map(token => (
                    <div key={token.symbol} className="wallet-balance-item">
                        <div className="balance-label">
                            <span className="balance-currency">{token.icon}</span> {token.symbol}
                        </div>
                        <div>
                            <div className="balance-amount">{parseFloat(token.balance).toFixed(token.decimals)}</div>
                        </div>
                    </div>
                ))}
            </div>
            <button className="wallet-refresh-btn" onClick={fetchBalances} disabled={loading}>
                <Icon name="refresh" size={12} />
                {loading ? ' Updating...' : ' Refresh'}
            </button>
        </div>
    );
}
