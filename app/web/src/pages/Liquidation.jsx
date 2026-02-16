import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { ethers } from 'ethers';
import Icon from '../components/Icon';
import { useToast } from '../components/Toast';
import ConfirmationModal from '../components/ConfirmationModal';
import Tooltip from '../components/Tooltip';
import { getUserPosition, getOraclePrices, getProtocolConstants, liquidatePosition, discoverAllUsers, getReadProvider } from '../utils/contracts';
import { getOwnedAssets, seizeAssets as seizeMarketplaceAssets } from '../utils/assetPortfolio';

export default function Liquidation() {
    const { address, isConnected } = useWallet();
    const { getSigner: getSignerFn } = useWalletSigner();
    const toast = useToast();

    const [targetAddress, setTargetAddress] = useState('');
    const [targetPosition, setTargetPosition] = useState(null);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [constants, setConstants] = useState({ minHealthFactor: 1.0, liquidationBonus: 5 });
    const [myPosition, setMyPosition] = useState(null);
    const [allPositions, setAllPositions] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        fetchPricesAndConstants();
        if (isConnected && address) {
            fetchMyPosition();
            scanPositions();
        }
    }, [isConnected, address]);

    const fetchPricesAndConstants = async () => {
        try {
            const provider = getReadProvider();
            const [oraclePrices, protocolConstants] = await Promise.all([
                getOraclePrices(provider),
                getProtocolConstants(provider),
            ]);
            setPrices(oraclePrices);
            setConstants(protocolConstants);
        } catch (err) {
            console.error('Error fetching protocol data:', err);
        }
    };

    const fetchMyPosition = async () => {
        try {
            const provider = getReadProvider();
            const pos = await getUserPosition(address, provider);
            setMyPosition(pos);
        } catch (err) {
            console.error('Error fetching position:', err);
        }
    };

    const scanPositions = async () => {
        setScanning(true);
        try {
            const provider = getReadProvider();
            const users = await discoverAllUsers(provider);
            const positions = [];
            for (const user of users) {
                try {
                    const pos = await getUserPosition(user, provider);
                    if (pos && pos.debtAmount > 0n) {
                        const hf = getHealthFactor(pos);
                        const collVal = getCollateralValue(pos);
                        const debt = parseFloat(ethers.formatEther(pos.debtAmount || 0n));
                        positions.push({ address: user, healthFactor: hf, collateral: collVal, debt, position: pos });
                    }
                } catch {}
            }
            positions.sort((a, b) => a.healthFactor - b.healthFactor);
            setAllPositions(positions);
        } catch (err) {
            console.error('Error scanning positions:', err);
        } finally {
            setScanning(false);
        }
    };

    const checkPosition = async () => {
        if (!ethers.isAddress(targetAddress)) {
            toast.error('Invalid Address', 'Please enter a valid Ethereum address');
            return;
        }
        setChecking(true);
        try {
            const provider = getReadProvider();
            const pos = await getUserPosition(targetAddress, provider);
            if (!pos) {
                toast.warning('No Position', 'This address has no active position');
                setTargetPosition(null);
            } else {
                setTargetPosition(pos);
            }
        } catch (err) {
            toast.error('Error', 'Failed to fetch position');
        } finally {
            setChecking(false);
        }
    };

    const getHealthFactor = (pos) => {
        if (!pos || !pos.healthFactor) return 999;
        const hfBig = typeof pos.healthFactor === 'bigint' ? pos.healthFactor : BigInt(pos.healthFactor);
        if (hfBig > BigInt('1000000000000000000000')) return 999;
        return parseFloat(ethers.formatEther(hfBig));
    };

    const getCollateralValue = (pos) => {
        if (!pos) return 0;
        const ethVal = parseFloat(ethers.formatEther(pos.ethCollateral || 0n)) * prices.ethPrice;
        const wbtcVal = parseFloat(ethers.formatUnits(pos.wbtcCollateral || 0n, 8)) * prices.wbtcPrice;
        return ethVal + wbtcVal;
    };

    const handleLiquidateClick = () => {
        if (!isConnected) { toast.error('Error', 'Please connect your wallet'); return; }
        setShowConfirm(true);
    };

    const executeLiquidate = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            const signer = await getSignerFn();
            const tx = await liquidatePosition(targetAddress, signer);
            const txHash = tx?.hash || tx?.transactionHash || '';
            toast.tx('Liquidation Successful', 'Position has been liquidated. You received the liquidation bonus.', txHash);
            setTargetPosition(null);
            setTargetAddress('');
            await fetchMyPosition();
            await scanPositions();
        } catch (err) {
            toast.error('Liquidation Failed', err.message || 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const targetHF = targetPosition ? getHealthFactor(targetPosition) : null;
    const isLiquidatable = targetHF !== null && targetHF < constants.minHealthFactor;
    const targetDebt = targetPosition ? parseFloat(ethers.formatEther(targetPosition.debtAmount || 0n)) : 0;
    const targetCollateral = targetPosition ? getCollateralValue(targetPosition) : 0;

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Liquidations</h1>
                        <p className="page-subtitle">Liquidate undercollateralized positions and earn a bonus</p>
                    </div>

                    <div className="dashboard-grid">
                        <div className="dashboard-card">
                            <h3 className="card-title">Check Position</h3>
                            <div className="flex flex-col gap-lg">
                                <div className="form-group">
                                    <label className="form-label">Target Address</label>
                                    <input
                                        type="text"
                                        className="form-input mono"
                                        placeholder="0x..."
                                        value={targetAddress}
                                        onChange={(e) => setTargetAddress(e.target.value)}
                                        disabled={checking || loading}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                </div>

                                <button
                                    className="btn btn-secondary w-full"
                                    onClick={checkPosition}
                                    disabled={checking || !targetAddress}
                                >
                                    {checking ? <><span className="loading"></span> Checking...</> : 'Check Position'}
                                </button>

                                {targetPosition && (
                                    <div style={{
                                        padding: 'var(--spacing-lg)',
                                        background: isLiquidatable ? 'rgba(239,68,68,0.08)' : 'rgba(0,212,170,0.06)',
                                        borderRadius: 'var(--radius-lg)',
                                        border: `1px solid ${isLiquidatable ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
                                    }}>
                                        <div className="flex justify-between text-sm mb-md">
                                            <span className="text-muted">Health Factor</span>
                                            <span className="mono font-bold" style={{
                                                fontSize: '1.2rem',
                                                color: targetHF < 1 ? 'var(--danger)' : targetHF < 1.5 ? 'var(--warning)' : 'var(--success)'
                                            }}>
                                                {targetHF >= 999 ? '\u221E' : targetHF.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm mb-sm">
                                            <span className="text-muted">Collateral Value</span>
                                            <span className="mono font-bold">${targetCollateral.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm mb-sm">
                                            <span className="text-muted">Debt</span>
                                            <span className="mono font-bold">${targetDebt.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm mb-sm">
                                            <span className="text-muted">Credit Tier</span>
                                            <span className="mono font-bold">Tier {targetPosition.creditTier}</span>
                                        </div>

                                        {isLiquidatable ? (
                                            <>
                                                <div className="badge badge-danger mt-md mb-md">Liquidatable</div>
                                                <div className="text-sm text-muted mb-md">
                                                    Estimated bonus: <strong style={{ color: 'var(--success)' }}>
                                                        ${(targetDebt * constants.liquidationBonus / 100).toFixed(2)}
                                                    </strong> ({constants.liquidationBonus}% of debt)
                                                </div>
                                                <button
                                                    className="btn btn-primary w-full"
                                                    onClick={handleLiquidateClick}
                                                    disabled={loading}
                                                    style={{ background: 'var(--danger)' }}
                                                >
                                                    {loading ? <><span className="loading"></span> Liquidating...</> : 'Liquidate Position'}
                                                </button>
                                                {(() => {
                                                    const pledged = getOwnedAssets(targetAddress).filter(a => a.isPledged);
                                                    if (pledged.length === 0) return null;
                                                    const recoveryVal = pledged.reduce((s, a) => s + a.currentValue, 0);
                                                    return (
                                                        <div style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'rgba(240,180,41,0.06)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(240,180,41,0.2)' }}>
                                                            <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                                Marketplace Assets ({pledged.length} pledged)
                                                            </div>
                                                            {pledged.map(a => (
                                                                <div key={a.assetKey} className="flex justify-between text-sm mb-xs">
                                                                    <span>{a.productName}</span>
                                                                    <span className="mono">${a.currentValue.toFixed(2)}</span>
                                                                </div>
                                                            ))}
                                                            <button
                                                                className="btn btn-sm w-full mt-sm"
                                                                style={{ background: 'var(--warning)', color: '#000' }}
                                                                onClick={() => {
                                                                    const result = seizeMarketplaceAssets(targetAddress);
                                                                    toast.success('Assets Seized', `${result.seized} asset(s) seized, $${result.recoveredValue.toFixed(2)} recovered`);
                                                                }}
                                                            >
                                                                Seize Marketplace Assets (${recoveryVal.toFixed(2)})
                                                            </button>
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        ) : (
                                            <div className="badge badge-success mt-md">Position is Safe</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="dashboard-card">
                            <h3 className="card-title">How Liquidation Works <Tooltip term="liquidation" /></h3>
                            <div className="flex flex-col gap-lg">
                                <div>
                                    <div className="text-sm text-muted mb-sm">Min Health Factor <Tooltip term="healthFactor" /></div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem', color: 'var(--warning)' }}>
                                        {constants.minHealthFactor.toFixed(2)}
                                    </div>
                                    <div className="text-xs text-muted">Positions below this can be liquidated</div>
                                </div>
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm text-muted mb-sm">Liquidation Bonus</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem', color: 'var(--success)' }}>
                                        {constants.liquidationBonus}%
                                    </div>
                                    <div className="text-xs text-muted">Bonus earned by liquidators</div>
                                </div>
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm text-muted mb-sm">Oracle Prices</div>
                                    <div className="flex flex-col gap-sm">
                                        <div className="flex justify-between">
                                            <span className="text-sm">ETH</span>
                                            <span className="mono font-bold">${prices.ethPrice.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">WBTC</span>
                                            <span className="mono font-bold">${prices.wbtcPrice.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="info-box info mt-lg">
                                <strong>How it works:</strong>
                                <ul style={{ margin: '8px 0 0 16px', lineHeight: 2 }}>
                                    <li>When a position's health factor drops below {constants.minHealthFactor.toFixed(1)}, anyone can liquidate it</li>
                                    <li>The liquidator repays the borrower's debt</li>
                                    <li>In return, they receive the collateral + a {constants.liquidationBonus}% bonus</li>
                                    <li>This keeps the protocol solvent</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Position Scanner */}
                    <div className="dashboard-card mt-lg">
                        <div className="flex justify-between items-center mb-lg">
                            <h3 className="card-title" style={{ marginBottom: 0 }}>Position Scanner</h3>
                            <button className="btn btn-secondary btn-sm" onClick={scanPositions} disabled={scanning}>
                                {scanning ? <><span className="loading"></span> Scanning...</> : 'Rescan'}
                            </button>
                        </div>
                        {allPositions.length === 0 ? (
                            <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                                {scanning ? 'Scanning protocol events for active positions...' : 'No active debt positions found'}
                            </div>
                        ) : (
                            <div style={{ overflow: 'auto' }}>
                                <table className="scanner-table">
                                    <thead>
                                        <tr>
                                            <th>Address</th>
                                            <th style={{ textAlign: 'right' }}>Collateral</th>
                                            <th style={{ textAlign: 'right' }}>Debt</th>
                                            <th style={{ textAlign: 'right' }}>Health Factor</th>
                                            <th style={{ textAlign: 'right' }}>Est. Bonus</th>
                                            <th style={{ textAlign: 'center' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allPositions.map((p) => {
                                            const liquidatable = p.healthFactor < constants.minHealthFactor;
                                            const bonus = liquidatable ? (p.debt * constants.liquidationBonus / 100) : 0;
                                            return (
                                                <tr key={p.address} style={liquidatable ? { background: 'rgba(248,81,73,0.06)' } : {}}>
                                                    <td>
                                                        <button
                                                            onClick={() => { setTargetAddress(p.address); setTargetPosition(p.position); }}
                                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
                                                        >
                                                            {p.address.slice(0, 6)}...{p.address.slice(-4)}
                                                        </button>
                                                    </td>
                                                    <td className="text-right mono">${p.collateral.toFixed(2)}</td>
                                                    <td className="text-right mono">${p.debt.toFixed(2)}</td>
                                                    <td className="text-right mono font-bold" style={{
                                                        color: p.healthFactor < 1 ? 'var(--danger)' : p.healthFactor < 1.5 ? 'var(--warning)' : 'var(--success)'
                                                    }}>
                                                        {p.healthFactor >= 999 ? '\u221E' : p.healthFactor.toFixed(2)}
                                                    </td>
                                                    <td className="text-right mono" style={{ color: liquidatable ? 'var(--success)' : 'var(--text-tertiary)' }}>
                                                        {liquidatable ? `$${bonus.toFixed(2)}` : '--'}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {liquidatable
                                                            ? <span className="badge badge-danger">Liquidatable</span>
                                                            : <span className="badge badge-success">Safe</span>
                                                        }
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <ConfirmationModal
                isOpen={showConfirm}
                onConfirm={executeLiquidate}
                onCancel={() => setShowConfirm(false)}
                title="Confirm Liquidation"
                details={[
                    { label: 'Target Address', value: targetAddress ? `${targetAddress.slice(0, 10)}...${targetAddress.slice(-6)}` : '' },
                    { label: 'Target Health Factor', value: targetHF !== null ? (targetHF >= 999 ? '\u221E' : targetHF.toFixed(2)) : '--', style: { color: 'var(--danger)' } },
                    { label: 'Target Debt', value: `$${targetDebt.toFixed(2)}` },
                    { label: 'Est. Bonus', value: `$${(targetDebt * constants.liquidationBonus / 100).toFixed(2)} (${constants.liquidationBonus}%)`, style: { color: 'var(--success)' } },
                ]}
                confirmText="Liquidate Position"
                confirmVariant="danger"
                loading={loading}
                warningMessage="This will liquidate the target's entire position. This action cannot be undone."
            />
        </>
    );
}
