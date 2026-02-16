import { useState, useEffect } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ethers } from 'ethers';
import { getWBTCBalance, getUSDXBalance, getOraclePrices, getUserPosition, getReadProvider } from '../utils/contracts';
import { getPendingCount, pollPendingTxs } from '../utils/pendingTxs';
import { useWallet } from '../hooks/useWallet';
import { useBuiltinWallet } from '../contexts/BuiltinWalletContext';
import NotificationCenter from './NotificationCenter';
import Icon from './Icon';

const NETWORKS = [
    { id: 31337, name: 'Localhost', color: '#00d4aa' },
    { id: 11155111, name: 'Sepolia', color: '#9b59b6' },
];

export default function WalletBar() {
    const { address, isConnected, isBuiltin } = useWallet();
    const { name: builtinName, disconnectBuiltin } = useBuiltinWallet();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();

    const [balances, setBalances] = useState({ eth: '0', usdx: '0', wbtc: '0' });
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [position, setPosition] = useState(null);
    const [gasPrice, setGasPrice] = useState(null);
    const [copied, setCopied] = useState(false);
    const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

    useEffect(() => {
        if (isConnected && address) {
            fetchAll();
            const interval = setInterval(fetchAll, 15000);
            return () => clearInterval(interval);
        }
    }, [isConnected, address]);

    const fetchAll = async () => {
        try {
            const provider = getReadProvider();
            const [ethBal, usdxBal, wbtcBal, oraclePrices, feeData, pos] = await Promise.all([
                provider.getBalance(address),
                getUSDXBalance(address, provider),
                getWBTCBalance(address, provider),
                getOraclePrices(provider),
                provider.getFeeData(),
                getUserPosition(address, provider),
            ]);

            setBalances({
                eth: ethers.formatEther(ethBal),
                usdx: usdxBal,
                wbtc: wbtcBal,
            });
            setPrices(oraclePrices);
            setPosition(pos);

            if (feeData.gasPrice) {
                setGasPrice(parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei')).toFixed(1));
            }

            await pollPendingTxs(provider);
        } catch (err) {
            console.error('WalletBar fetch error:', err);
        }
    };

    if (!isConnected) return null;

    const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
    const currentNetwork = NETWORKS.find(n => n.id === chainId) || { name: `Chain ${chainId}`, color: '#666' };

    const ethVal = parseFloat(balances.eth) * prices.ethPrice;
    const wbtcVal = parseFloat(balances.wbtc) * prices.wbtcPrice;
    const usdxVal = parseFloat(balances.usdx);
    const totalUSD = ethVal + wbtcVal + usdxVal;

    // Position stats
    let healthFactor = null;
    let collateralVal = 0;
    let debtVal = 0;
    let tier = 1;
    if (position) {
        const ethCol = parseFloat(ethers.formatEther(position.ethCollateral || 0n));
        const wbtcCol = parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8));
        collateralVal = ethCol * prices.ethPrice + wbtcCol * prices.wbtcPrice;
        debtVal = parseFloat(ethers.formatEther(position.debtAmount || 0n));
        tier = position.creditTier || 1;

        const hfBig = typeof position.healthFactor === 'bigint' ? position.healthFactor : BigInt(position.healthFactor || 0);
        if (hfBig > BigInt('1000000000000000000000')) {
            healthFactor = 999;
        } else if (hfBig > 0n) {
            healthFactor = parseFloat(ethers.formatEther(hfBig));
        }
        if (debtVal === 0 && collateralVal > 0) healthFactor = 999;
    }

    const hfColor = healthFactor === null ? 'var(--text-tertiary)'
        : healthFactor < 1 ? 'var(--danger)'
        : healthFactor < 1.5 ? 'var(--warning)'
        : 'var(--success)';

    const copyAddress = () => {
        navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="wallet-bar">
            {/* Logo */}
            <div className="wallet-bar-logo">
                <span className="wallet-bar-logo-icon">CC</span>
                <span className="wallet-bar-logo-text">CryptoCredit</span>
            </div>

            {/* Portfolio Value */}
            <div className="wallet-bar-portfolio">
                <span className="wallet-bar-portfolio-label">Portfolio</span>
                <span className="wallet-bar-portfolio-value">
                    ${totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>

            {/* Quick Stats */}
            <div className="wallet-bar-stats">
                <div className="wallet-bar-stat">
                    <span className="wallet-bar-stat-label">Health</span>
                    <span className="wallet-bar-stat-value" style={{ color: hfColor }}>
                        {healthFactor === null ? '--' : healthFactor >= 999 ? '\u221E' : healthFactor.toFixed(2)}
                    </span>
                </div>
                <div className="wallet-bar-divider" />
                <div className="wallet-bar-stat">
                    <span className="wallet-bar-stat-label">Collateral</span>
                    <span className="wallet-bar-stat-value">${collateralVal.toFixed(0)}</span>
                </div>
                <div className="wallet-bar-divider" />
                <div className="wallet-bar-stat">
                    <span className="wallet-bar-stat-label">Debt</span>
                    <span className="wallet-bar-stat-value" style={{ color: debtVal > 0 ? 'var(--accent)' : undefined }}>
                        ${debtVal.toFixed(0)}
                    </span>
                </div>
                <div className="wallet-bar-divider" />
                <div className="wallet-bar-stat">
                    <span className="wallet-bar-stat-label">Tier</span>
                    <span className="wallet-bar-stat-value">{tier}</span>
                </div>
            </div>

            {/* Network Badge — hide switcher for built-in (always localhost) */}
            {isBuiltin ? (
                <div className="wallet-bar-network">
                    <span className="wallet-bar-network-dot" style={{ background: '#00d4aa' }} />
                    <span className="wallet-bar-network-name">Localhost</span>
                </div>
            ) : (
                <div className="wallet-bar-network" onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}>
                    <span className="wallet-bar-network-dot" style={{ background: currentNetwork.color }} />
                    <span className="wallet-bar-network-name">{currentNetwork.name}</span>
                    {showNetworkDropdown && (
                        <div className="wallet-bar-network-dropdown">
                            {NETWORKS.map(net => (
                                <button
                                    key={net.id}
                                    className={`wallet-bar-network-option ${chainId === net.id ? 'active' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (chainId !== net.id && switchChain) switchChain({ chainId: net.id });
                                        setShowNetworkDropdown(false);
                                    }}
                                >
                                    <span className="wallet-bar-network-dot" style={{ background: net.color }} />
                                    <span>{net.name}</span>
                                    {chainId === net.id && <Icon name="check" size={12} />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Gas */}
            {gasPrice && (
                <div className="wallet-bar-gas">
                    <Icon name="gas" size={12} />
                    <span>{gasPrice} Gwei</span>
                </div>
            )}

            {/* Address */}
            <button className="wallet-bar-address" onClick={copyAddress} title={copied ? 'Copied!' : 'Copy address'}>
                <Icon name={copied ? 'check' : 'copy'} size={12} />
                <span className="mono">{shortAddress}</span>
            </button>

            {/* Built-in badge or RainbowKit */}
            {isBuiltin ? (
                <>
                    <span className="wallet-bar-builtin-badge">{builtinName || 'Built-in'}</span>
                    <button className="btn btn-secondary btn-sm" onClick={disconnectBuiltin} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                        Disconnect
                    </button>
                </>
            ) : (
                <>
                    <NotificationCenter />
                    <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
                </>
            )}
        </div>
    );
}
