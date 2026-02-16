import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { ethers } from 'ethers';
import { Link } from 'react-router-dom';
import Tooltip from '../components/Tooltip';
import ConfirmationModal from '../components/ConfirmationModal';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import LoanAgreement from '../components/LoanAgreement';
import Icon from '../components/Icon';
import { borrowUSDX, borrowETH, borrowWBTC, depositETH, depositWBTC, depositUSDX, getWBTCBalance, getUSDXBalance, getUserPosition, getUserDebts, getOraclePrices, getProtocolReserves, getUserUSDXCollateral, getReadProvider } from '../utils/contracts';
import { recordBorrow, getAPRForTier, formatAPR, estimateInterest, getAllTierRates } from '../utils/interest';
import { calculateOriginationFee, calculateTotalBorrowCost } from '../utils/fees';
import { getAssetCollateralValue, getOwnedAssets } from '../utils/assetPortfolio';

export default function Borrow() {
    const { address, isConnected } = useWallet();
    const { getSigner: getSignerFn } = useWalletSigner();
    const toast = useToast();

    const [amount, setAmount] = useState('');
    const [borrowAsset, setBorrowAsset] = useState('USDX');
    const [loading, setLoading] = useState(false);
    const [position, setPosition] = useState(null);
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [reserves, setReserves] = useState({ ethReserve: 0n, wbtcReserve: 0n });
    const [showConfirm, setShowConfirm] = useState(false);
    const [showLoanAgreement, setShowLoanAgreement] = useState(false);

    // Quick deposit state
    const [showDeposit, setShowDeposit] = useState(false);
    const [depositAsset, setDepositAsset] = useState('ETH');
    const [depositAmount, setDepositAmount] = useState('');
    const [depositLoading, setDepositLoading] = useState(false);
    const [ethBalance, setEthBalance] = useState('0');
    const [wbtcBalance, setWbtcBalance] = useState('0');
    const [usdxBalance, setUsdxBalance] = useState('0');
    const [usdxCollateral, setUsdxCollateral] = useState('0');

    useEffect(() => {
        if (isConnected && address) { fetchPosition(); fetchWalletBalances(); }
    }, [isConnected, address]);

    const fetchPosition = async () => {
        try {
            const provider = getReadProvider();
            const [pos, oraclePrices, res] = await Promise.all([
                getUserPosition(address, provider),
                getOraclePrices(provider),
                getProtocolReserves(provider),
            ]);
            setPosition(pos);
            setPrices(oraclePrices);
            setReserves(res);
        } catch (error) {
            console.error('Error fetching position:', error);
        }
    };

    const fetchWalletBalances = async () => {
        try {
            const provider = getReadProvider();
            const [ethBal, wbtcBal, usdxBal, usdxCol] = await Promise.all([
                provider.getBalance(address),
                getWBTCBalance(address, provider),
                getUSDXBalance(address, provider).catch(() => '0'),
                getUserUSDXCollateral(address, provider).catch(() => '0'),
            ]);
            setEthBalance(ethers.formatEther(ethBal));
            setWbtcBalance(wbtcBal);
            setUsdxBalance(usdxBal);
            setUsdxCollateral(usdxCol);
        } catch {}
    };

    const handleQuickDeposit = async () => {
        if (!depositAmount || parseFloat(depositAmount) <= 0) { toast.warning('Invalid Amount', 'Enter a valid amount'); return; }
        const bal = parseFloat(depositAsset === 'ETH' ? ethBalance : depositAsset === 'WBTC' ? wbtcBalance : usdxBalance) || 0;
        if (parseFloat(depositAmount) > bal) { toast.error('Insufficient Balance', `You only have ${bal.toFixed(depositAsset === 'WBTC' ? 8 : depositAsset === 'ETH' ? 6 : 2)} ${depositAsset}`); return; }

        setDepositLoading(true);
        try {
            const signer = await getSignerFn();
            if (depositAsset === 'ETH') {
                await depositETH(depositAmount, signer);
            } else if (depositAsset === 'WBTC') {
                await depositWBTC(depositAmount, signer);
            } else {
                await depositUSDX(depositAmount, signer);
            }
            toast.success('Deposit Successful', `Deposited ${depositAmount} ${depositAsset} as collateral`);
            setDepositAmount('');
            await fetchPosition();
            await fetchWalletBalances();
        } catch (err) {
            toast.error('Deposit Failed', err.reason || err.message || 'Unknown error');
        } finally {
            setDepositLoading(false);
        }
    };

    const getMaxBorrowUSD = () => {
        if (!position) return 0;
        const maxBorrow = parseFloat(ethers.formatEther(position.maxBorrow || 0n));
        const debt = parseFloat(ethers.formatEther(position.debtAmount || 0n));
        return Math.max(0, maxBorrow - debt);
    };

    const getMaxBorrow = () => {
        const maxUSD = getMaxBorrowUSD();
        if (borrowAsset === 'USDX') return maxUSD;
        if (borrowAsset === 'ETH') {
            const reserveETH = parseFloat(ethers.formatEther(reserves.ethReserve || 0n));
            return Math.min(maxUSD / prices.ethPrice, reserveETH);
        }
        if (borrowAsset === 'WBTC') {
            const reserveWBTC = parseFloat(ethers.formatUnits(reserves.wbtcReserve || 0n, 8));
            return Math.min(maxUSD / prices.wbtcPrice, reserveWBTC);
        }
        return maxUSD;
    };

    const getCollateralValue = () => {
        if (!position) return 0;
        const ethVal = parseFloat(ethers.formatEther(position.ethCollateral || 0n)) * prices.ethPrice;
        const wbtcVal = parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8)) * prices.wbtcPrice;
        const usdxVal = parseFloat(usdxCollateral);
        return ethVal + wbtcVal + usdxVal;
    };

    const getDebt = () => {
        if (!position) return 0;
        return parseFloat(ethers.formatEther(position.debtAmount || 0n));
    };

    const calculateNewHealthFactor = (borrowAmount) => {
        if (!position || !borrowAmount || parseFloat(borrowAmount) === 0) return 999;
        let addedDebtUSD = parseFloat(borrowAmount);
        if (borrowAsset === 'ETH') addedDebtUSD *= prices.ethPrice;
        else if (borrowAsset === 'WBTC') addedDebtUSD *= prices.wbtcPrice;
        const totalDebt = getDebt() + addedDebtUSD;
        const collateral = getCollateralValue();
        if (totalDebt === 0) return 999;
        return (collateral * 0.75) / totalDebt;
    };

    const handleBorrowClick = (e) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) { toast.warning('Invalid Amount', 'Please enter a valid amount'); return; }
        if (!position) { toast.error('Error', 'Unable to fetch your position'); return; }
        const max = getMaxBorrow();
        if (parseFloat(amount) > max) { toast.error('Exceeds Limit', `Cannot borrow more than ${max.toFixed(borrowAsset === 'WBTC' ? 6 : 4)} ${borrowAsset}`); return; }
        if (!isConnected) { toast.error('Error', 'Please connect your wallet'); return; }
        setShowLoanAgreement(true);
    };

    const executeBorrow = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            const signer = await getSignerFn();
            let tx;
            if (borrowAsset === 'ETH') {
                tx = await borrowETH(amount, signer);
            } else if (borrowAsset === 'WBTC') {
                tx = await borrowWBTC(amount, signer);
            } else {
                tx = await borrowUSDX(amount, signer);
            }
            const txHash = tx?.hash || tx?.transactionHash || '';
            const borrowValueUSD = borrowAsset === 'ETH' ? parseFloat(amount) * prices.ethPrice
                : borrowAsset === 'WBTC' ? parseFloat(amount) * prices.wbtcPrice
                : parseFloat(amount);
            recordBorrow(address, borrowValueUSD.toString(), position?.creditTier || 1);
            toast.tx('Borrow Successful', `Borrowed ${amount} ${borrowAsset}`, txHash);
            setAmount('');
            await fetchPosition();
        } catch (err) {
            toast.error('Borrow Failed', err.reason || err.message || 'Unknown error');
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
                            <SkeletonCard height={350} />
                            <SkeletonCard height={350} />
                        </div>
                    </div>
                </main>
            </>
        );
    }

    const maxBorrow = getMaxBorrow();
    const newHF = calculateNewHealthFactor(amount);
    const hfColor = newHF < 1.2 ? 'var(--danger)' : newHF < 1.5 ? 'var(--warning)' : 'var(--success)';
    const tier = position.creditTier || 1;
    const apr = getAPRForTier(tier);
    const borrowAmt = parseFloat(amount) || 0;
    const borrowAmtUSD = borrowAsset === 'ETH' ? borrowAmt * prices.ethPrice
        : borrowAsset === 'WBTC' ? borrowAmt * prices.wbtcPrice : borrowAmt;
    const est30d = borrowAmtUSD > 0 ? estimateInterest(borrowAmtUSD, tier, 30) : null;
    const est365d = borrowAmtUSD > 0 ? estimateInterest(borrowAmtUSD, tier, 365) : null;
    const tierRates = getAllTierRates();

    const origFee = calculateOriginationFee(borrowAmtUSD);
    const totalCost6m = borrowAmtUSD > 0 ? calculateTotalBorrowCost(borrowAmtUSD, tier, 6) : null;

    const borrowValueUSD = borrowAsset === 'ETH' ? borrowAmt * prices.ethPrice
        : borrowAsset === 'WBTC' ? borrowAmt * prices.wbtcPrice : borrowAmt;

    const confirmDetails = borrowAmt > 0 ? [
        { label: 'Borrow Amount', value: `${borrowAmt.toFixed(borrowAsset === 'WBTC' ? 6 : 4)} ${borrowAsset}` },
        ...(borrowAsset !== 'USDX' ? [{ label: 'USD Value', value: `$${borrowValueUSD.toFixed(2)}` }] : []),
        { label: 'Origination Fee (0.5%)', value: `$${origFee.toFixed(2)}`, style: { color: 'var(--accent)' } },
        { label: 'Interest Rate (APR)', value: formatAPR(apr) },
        { label: 'Est. Interest (30 days)', value: `$${est30d?.interest.toFixed(2) || '0.00'}` },
        { label: 'New Health Factor', value: newHF >= 999 ? '\u221E' : newHF.toFixed(2), style: { color: hfColor, fontWeight: 700 } },
    ] : [];

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Borrow</h1>
                        <p className="page-subtitle">Borrow USDX, ETH, or WBTC against your collateral</p>
                    </div>

                    {/* Collateral Deposit Section */}
                    {(maxBorrow <= 0 || showDeposit) && (
                        <div className="dashboard-card" style={{ marginBottom: 'var(--spacing-lg)', border: maxBorrow <= 0 ? '1px solid rgba(240,180,41,0.3)' : undefined }}>
                            <div className="flex justify-between items-center mb-md">
                                <h3 className="card-title" style={{ margin: 0 }}>
                                    <Icon name="deposit" size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                                    {maxBorrow <= 0 ? 'Deposit Collateral First' : 'Add More Collateral'}
                                </h3>
                                {maxBorrow > 0 && (
                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowDeposit(false)}>Hide</button>
                                )}
                            </div>
                            {maxBorrow <= 0 && (
                                <div className="info-box warning mb-md">
                                    You need to deposit ETH, WBTC, or USDX as collateral before you can borrow.
                                </div>
                            )}
                            <div className="flex gap-md items-end">
                                <div style={{ flex: '0 0 100px' }}>
                                    <label className="form-label">Asset</label>
                                    <select className="form-input" value={depositAsset} onChange={e => setDepositAsset(e.target.value)}>
                                        <option value="ETH">ETH</option>
                                        <option value="WBTC">WBTC</option>
                                        <option value="USDX">USDX</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label">Amount</label>
                                    <input type="number" className="form-input" placeholder="0.0" step="0.000001" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
                                </div>
                                <button className="btn btn-primary" onClick={handleQuickDeposit} disabled={depositLoading} style={{ whiteSpace: 'nowrap' }}>
                                    {depositLoading ? 'Depositing...' : 'Deposit'}
                                </button>
                            </div>
                            <div className="text-xs text-muted mt-sm">
                                Wallet: {parseFloat(depositAsset === 'ETH' ? ethBalance : depositAsset === 'WBTC' ? wbtcBalance : usdxBalance).toFixed(depositAsset === 'WBTC' ? 6 : depositAsset === 'ETH' ? 4 : 2)} {depositAsset}
                                {' '}<button type="button" onClick={() => {
                                    const bal = depositAsset === 'ETH' ? Math.max(0, parseFloat(ethBalance) - 0.01) : depositAsset === 'WBTC' ? parseFloat(wbtcBalance) : parseFloat(usdxBalance);
                                    setDepositAmount(bal > 0 ? bal.toString() : '');
                                }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>MAX</button>
                            </div>
                        </div>
                    )}

                    <div className="dashboard-grid">
                        <div className="dashboard-card">
                            <div className="flex justify-between items-center mb-md">
                                <h3 className="card-title" style={{ margin: 0 }}>Borrow {borrowAsset}</h3>
                                {maxBorrow > 0 && !showDeposit && (
                                    <button className="btn btn-secondary btn-sm" onClick={() => { setShowDeposit(true); fetchWalletBalances(); }}>
                                        <Icon name="deposit" size={14} /> Add Collateral
                                    </button>
                                )}
                            </div>
                            <form onSubmit={handleBorrowClick} className="flex flex-col gap-lg">
                                <div className="form-group">
                                    <label className="form-label">Asset to Borrow</label>
                                    <div className="flex gap-sm">
                                        {['USDX', 'ETH', 'WBTC'].map(a => (
                                            <button key={a} type="button"
                                                className={`btn ${borrowAsset === a ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                                style={{ flex: 1 }}
                                                onClick={() => { setBorrowAsset(a); setAmount(''); }}>
                                                {a}
                                            </button>
                                        ))}
                                    </div>
                                    {borrowAsset !== 'USDX' && (
                                        <div className="text-xs text-muted mt-sm">
                                            Protocol reserves: {borrowAsset === 'ETH'
                                                ? `${parseFloat(ethers.formatEther(reserves.ethReserve || 0n)).toFixed(2)} ETH`
                                                : `${parseFloat(ethers.formatUnits(reserves.wbtcReserve || 0n, 8)).toFixed(4)} WBTC`
                                            }
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Amount to Borrow</label>
                                    <div className="input-group">
                                        <input type="number" className="form-input" placeholder="0.0" step={borrowAsset === 'WBTC' ? '0.000001' : '0.01'} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={loading} />
                                        <span className="input-addon">{borrowAsset}</span>
                                    </div>
                                    <div className="flex justify-between mt-sm text-sm text-muted">
                                        <span>Available: {maxBorrow.toFixed(borrowAsset === 'WBTC' ? 6 : borrowAsset === 'ETH' ? 4 : 2)} {borrowAsset}</span>
                                        <button type="button" onClick={() => setAmount(maxBorrow.toFixed(borrowAsset === 'WBTC' ? 6 : borrowAsset === 'ETH' ? 4 : 2))} disabled={loading || maxBorrow <= 0}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                                            MAX
                                        </button>
                                    </div>
                                </div>

                                {borrowAmt > 0 && (
                                    <>
                                        <div style={{
                                            padding: 'var(--spacing-md)',
                                            background: newHF < 1.2 ? 'rgba(239,68,68,0.08)' : 'var(--bg-tertiary)',
                                            borderRadius: 'var(--radius-lg)',
                                            border: `1px solid ${newHF < 1.2 ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
                                        }}>
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">
                                                    New Health Factor <Tooltip term="healthFactor" />
                                                </span>
                                                <span className="mono font-bold" style={{ fontSize: '1.1rem', color: hfColor }}>
                                                    {newHF >= 999 ? '\u221E' : newHF.toFixed(2)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted">Utilization</span>
                                                <span className="mono font-bold">
                                                    {maxBorrow > 0 ? ((borrowAmt / (maxBorrow + getDebt())) * 100).toFixed(1) : 0}%
                                                </span>
                                            </div>
                                        </div>

                                        {/* Interest Preview */}
                                        <div style={{
                                            padding: 'var(--spacing-md)',
                                            background: 'rgba(0,212,170,0.04)',
                                            borderRadius: 'var(--radius-lg)',
                                            border: '1px solid rgba(0,212,170,0.15)',
                                        }}>
                                            <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                Interest Preview
                                            </div>
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">APR (Tier {tier})</span>
                                                <span className="mono font-bold" style={{ color: 'var(--accent)' }}>{formatAPR(apr)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">Daily Interest</span>
                                                <span className="mono">${(borrowAmtUSD * apr / 365).toFixed(4)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">30-Day Interest</span>
                                                <span className="mono">${est30d?.interest.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted">1-Year Interest</span>
                                                <span className="mono">${est365d?.interest.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <button type="submit" className="btn btn-primary w-full" disabled={loading || !amount || parseFloat(amount) <= 0 || maxBorrow <= 0}>
                                    {loading ? <><span className="loading"></span> Borrowing...</> : `Borrow ${borrowAsset}`}
                                </button>
                            </form>
                        </div>

                        <div className="dashboard-card">
                            <h3 className="card-title">Your Position</h3>
                            <div className="flex flex-col gap-lg">
                                <div>
                                    <div className="text-sm text-muted mb-sm">Total Collateral Value</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                        ${getCollateralValue().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm text-muted mb-sm">Current Debt</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                        ${getDebt().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm text-muted mb-sm">Max Borrowable</div>
                                    <div className="mono font-bold" style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>
                                        ${maxBorrow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-xs text-muted mt-sm">
                                        Tier {tier} ({tier === 1 ? '60%' : tier === 2 ? '65%' : '70%'} LTV) <Tooltip term="ltv" />
                                    </div>
                                </div>
                            </div>

                            {/* Asset Collateral Boost */}
                            {(() => {
                                const assetBoost = getAssetCollateralValue(address);
                                const pledgedCount = getOwnedAssets(address).filter(a => a.isPledged).length;
                                if (assetBoost <= 0) return null;
                                return (
                                    <div style={{ marginTop: 'var(--spacing-lg)', padding: 'var(--spacing-md)', background: 'rgba(0,212,170,0.04)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(0,212,170,0.15)' }}>
                                        <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Asset Collateral Boost
                                        </div>
                                        <div className="flex justify-between text-sm mb-sm">
                                            <span className="text-muted">Pledged Assets</span>
                                            <span className="mono font-bold">{pledgedCount} item{pledgedCount !== 1 ? 's' : ''}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">Additional Borrow Power</span>
                                            <span className="mono font-bold" style={{ color: 'var(--primary)' }}>+${assetBoost.toFixed(2)}</span>
                                        </div>
                                        <div className="text-xs text-muted mt-sm">
                                            Marketplace assets pledged as collateral. Manage in <Link to="/marketplace" style={{ color: 'var(--primary)' }}>Marketplace &gt; My Assets</Link>.
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Interest Rate Card */}
                            <div style={{ marginTop: 'var(--spacing-lg)', padding: 'var(--spacing-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                <div className="text-xs text-muted mb-md" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Interest Rates by Tier
                                </div>
                                {tierRates.map(t => (
                                    <div key={t.tier} className="flex justify-between text-sm mb-sm" style={{ opacity: t.tier === tier ? 1 : 0.5 }}>
                                        <span className={t.tier === tier ? 'font-bold' : ''}>
                                            Tier {t.tier} ({t.name}) {t.tier === tier && '\u2190 You'}
                                        </span>
                                        <span className="mono font-bold" style={{ color: t.tier === tier ? 'var(--primary)' : 'var(--text-muted)' }}>
                                            {formatAPR(t.apr)}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="info-box info mt-lg">
                                <strong>Tip:</strong> Keep your health factor above 1.5 to avoid liquidation risk.
                                Higher credit tiers unlock lower interest rates.
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <LoanAgreement
                isOpen={showLoanAgreement}
                onAgree={() => { setShowLoanAgreement(false); setShowConfirm(true); }}
                onCancel={() => setShowLoanAgreement(false)}
                amount={amount}
                tier={tier}
                apr={apr}
            />

            <ConfirmationModal
                isOpen={showConfirm}
                onConfirm={executeBorrow}
                onCancel={() => setShowConfirm(false)}
                title="Confirm Borrow"
                details={confirmDetails}
                confirmText="Confirm Borrow"
                confirmVariant="primary"
                loading={loading}
                warningMessage={newHF < 1.5 ? `Warning: Your health factor will be ${newHF.toFixed(2)}, which is dangerously close to liquidation.` : null}
            />
        </>
    );
}
