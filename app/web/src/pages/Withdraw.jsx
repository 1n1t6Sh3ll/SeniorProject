import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { ethers } from 'ethers';
import Tooltip from '../components/Tooltip';
import ConfirmationModal from '../components/ConfirmationModal';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { withdrawETH, withdrawWBTC, withdrawUSDX, getUserPosition, getOraclePrices, getUserUSDXCollateral, getReadProvider } from '../utils/contracts';
import { calculateWithdrawalFee } from '../utils/fees';

export default function Withdraw() {
    const { address, isConnected } = useWallet();
    const { getSigner: getSignerFn } = useWalletSigner();
    const toast = useToast();

    const [asset, setAsset] = useState('ETH');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [position, setPosition] = useState(null);
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [usdxCollateral, setUsdxCollateral] = useState('0');
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        if (isConnected && address) fetchPosition();
    }, [isConnected, address]);

    const fetchPosition = async () => {
        try {
            const provider = getReadProvider();
            const [pos, oraclePrices, usdxCol] = await Promise.all([
                getUserPosition(address, provider),
                getOraclePrices(provider),
                getUserUSDXCollateral(address, provider).catch(() => '0'),
            ]);
            setPosition(pos);
            setPrices(oraclePrices);
            setUsdxCollateral(usdxCol);
        } catch (err) {
            console.error('Error fetching position:', err);
        }
    };

    const getMaxWithdraw = () => {
        if (!position) return '0';
        if (asset === 'ETH') return ethers.formatEther(position.ethCollateral || 0n);
        if (asset === 'WBTC') return ethers.formatUnits(position.wbtcCollateral || 0n, 8);
        return usdxCollateral;
    };

    const getNewHealthFactor = () => {
        if (!position || !amount || parseFloat(amount) <= 0) return null;
        const debt = parseFloat(ethers.formatEther(position.debtAmount || 0n));
        if (debt === 0) return null;
        const ethAmt = parseFloat(ethers.formatEther(position.ethCollateral || 0n));
        const wbtcAmt = parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8));
        const usdxAmt = parseFloat(usdxCollateral);
        const withdrawAmt = parseFloat(amount) || 0;
        const newEth = asset === 'ETH' ? Math.max(0, ethAmt - withdrawAmt) : ethAmt;
        const newWbtc = asset === 'WBTC' ? Math.max(0, wbtcAmt - withdrawAmt) : wbtcAmt;
        const newUsdx = asset === 'USDX' ? Math.max(0, usdxAmt - withdrawAmt) : usdxAmt;
        const newCollateral = newEth * prices.ethPrice + newWbtc * prices.wbtcPrice + newUsdx;
        return (newCollateral * 0.75) / debt;
    };

    const handleWithdrawClick = (e) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) { toast.warning('Invalid Amount', 'Please enter a valid amount'); return; }
        if (!isConnected) { toast.error('Wallet Error', 'Please connect your wallet'); return; }
        const maxW = parseFloat(getMaxWithdraw()) || 0;
        if (parseFloat(amount) > maxW) { toast.error('Insufficient Collateral', `You only have ${maxW.toFixed(asset === 'WBTC' ? 8 : asset === 'ETH' ? 6 : 2)} ${asset} deposited`); return; }
        const newHF = getNewHealthFactor();
        if (newHF !== null && newHF < 1.0) { toast.error('Liquidation Risk', 'This withdrawal would drop your health factor below 1.0 and risk liquidation'); return; }
        setShowConfirm(true);
    };

    const executeWithdraw = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            const signer = await getSignerFn();
            let tx;
            if (asset === 'ETH') {
                tx = await withdrawETH(amount, signer);
            } else if (asset === 'WBTC') {
                tx = await withdrawWBTC(amount, signer);
            } else {
                tx = await withdrawUSDX(amount, signer);
            }
            const txHash = tx?.hash || tx?.transactionHash || '';
            toast.tx('Withdrawal Successful', `Withdrew ${amount} ${asset} from your collateral`, txHash);
            setAmount('');
            await fetchPosition();
        } catch (err) {
            toast.error('Withdrawal Failed', err.reason || err.message || 'Unknown error');
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
                            <SkeletonCard height={300} />
                            <SkeletonCard height={300} />
                        </div>
                    </div>
                </main>
            </>
        );
    }

    const maxWithdraw = getMaxWithdraw();
    const newHF = getNewHealthFactor();
    const hfColor = newHF !== null ? (newHF < 1.2 ? 'var(--danger)' : newHF < 1.5 ? 'var(--warning)' : 'var(--success)') : null;

    const withdrawalFee = calculateWithdrawalFee(amount, asset, prices);

    const confirmDetails = [
        { label: 'Asset', value: asset },
        { label: 'Amount', value: `${parseFloat(amount || 0).toFixed(6)} ${asset}` },
        { label: 'Withdrawal Fee (0.1%)', value: `$${withdrawalFee.toFixed(2)}`, style: { color: 'var(--accent)' } },
        { label: 'Remaining Deposited', value: `${Math.max(0, parseFloat(maxWithdraw) - parseFloat(amount || 0)).toFixed(6)} ${asset}` },
    ];
    if (newHF !== null) {
        confirmDetails.push({ label: 'New Health Factor', value: newHF >= 999 ? '\u221E' : newHF.toFixed(2), style: { color: hfColor, fontWeight: 700 } });
    }

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Withdraw</h1>
                        <p className="page-subtitle">Withdraw your deposited ETH, WBTC, or USDX collateral</p>
                    </div>

                    <div className="dashboard-grid">
                        <div className="dashboard-card">
                            <h3 className="card-title">Withdraw Asset</h3>
                            <form onSubmit={handleWithdrawClick} className="flex flex-col gap-lg">
                                <div className="form-group">
                                    <label className="form-label">Select Asset</label>
                                    <select className="form-input" value={asset} onChange={(e) => { setAsset(e.target.value); setAmount(''); }} disabled={loading}>
                                        <option value="ETH">ETH - Ethereum</option>
                                        <option value="WBTC">WBTC - Wrapped Bitcoin</option>
                                        <option value="USDX">USDX - Stablecoin</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Amount</label>
                                    <div className="input-group">
                                        <input type="number" className="form-input" placeholder="0.0" step="0.000001" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={loading} />
                                        <span className="input-addon">{asset}</span>
                                    </div>
                                    <div className="flex justify-between mt-sm text-sm text-muted">
                                        <span>Deposited: <strong style={{ color: 'var(--text-primary)' }}>{parseFloat(maxWithdraw).toFixed(asset === 'WBTC' ? 6 : asset === 'ETH' ? 6 : 2)} {asset}</strong></span>
                                        <button type="button" onClick={() => setAmount(maxWithdraw)} disabled={loading}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                                            MAX
                                        </button>
                                    </div>
                                </div>

                                <button type="submit" className="btn btn-primary w-full" disabled={loading || !amount || parseFloat(amount) <= 0}>
                                    {loading ? <><span className="loading"></span> Withdrawing...</> : `Withdraw ${asset}`}
                                </button>
                            </form>
                        </div>

                        <div className="dashboard-card">
                            <h3 className="card-title">Your Collateral</h3>
                            <div className="flex flex-col gap-lg">
                                <div>
                                    <div className="text-sm text-muted mb-sm">ETH Deposited</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                        {parseFloat(ethers.formatEther(position.ethCollateral || 0n)).toFixed(4)} ETH
                                    </div>
                                    <div className="text-xs text-muted">
                                        ${(parseFloat(ethers.formatEther(position.ethCollateral || 0n)) * prices.ethPrice).toFixed(2)}
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm text-muted mb-sm">WBTC Deposited</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                        {parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8)).toFixed(6)} WBTC
                                    </div>
                                    <div className="text-xs text-muted">
                                        ${(parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8)) * prices.wbtcPrice).toFixed(2)}
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm text-muted mb-sm">USDX Deposited</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                        {parseFloat(usdxCollateral).toFixed(2)} USDX
                                    </div>
                                    <div className="text-xs text-muted">
                                        ${parseFloat(usdxCollateral).toFixed(2)}
                                    </div>
                                </div>
                                {newHF !== null && (
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                        <div className="text-sm text-muted mb-sm">
                                            New Health Factor <Tooltip term="healthFactor" />
                                        </div>
                                        <div className="mono font-bold" style={{ fontSize: '1.5rem', color: hfColor }}>
                                            {newHF >= 999 ? '\u221E' : newHF.toFixed(2)}
                                        </div>
                                        {newHF < 1.0 && <div className="text-xs" style={{ color: 'var(--danger)' }}>Withdrawal blocked - would cause liquidation</div>}
                                    </div>
                                )}
                            </div>

                            <div className="info-box warning mt-lg">
                                <strong>Warning:</strong> Withdrawing collateral reduces your health factor.
                                Make sure you maintain enough collateral to avoid liquidation.
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <ConfirmationModal
                isOpen={showConfirm}
                onConfirm={executeWithdraw}
                onCancel={() => setShowConfirm(false)}
                title="Confirm Withdrawal"
                details={confirmDetails}
                confirmText={`Withdraw ${asset}`}
                confirmVariant="primary"
                loading={loading}
                warningMessage={newHF !== null && newHF < 1.5 ? `Warning: Your health factor will drop to ${newHF.toFixed(2)}, putting your position at risk of liquidation.` : null}
            />
        </>
    );
}
