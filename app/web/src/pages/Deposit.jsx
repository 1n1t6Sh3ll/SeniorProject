import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useToast } from '../components/Toast';
import Tooltip from '../components/Tooltip';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { depositETH, depositWBTC, getWBTCBalance, getWBTCFromFaucet, getUserPosition, getOraclePrices, getReadProvider } from '../utils/contracts';
import { getSupplyAPY, getProjectedYield, recordDeposit } from '../utils/supplyYield';

export default function Deposit() {
    const { address, isConnected } = useWallet();
    const { getSigner: getSignerFn } = useWalletSigner();
    const toast = useToast();

    const [asset, setAsset] = useState('ETH');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [faucetLoading, setFaucetLoading] = useState(false);
    const [wbtcBalance, setWBTCBalance] = useState('0');
    const [ethBalance, setETHBalance] = useState('0');
    const [position, setPosition] = useState(null);
    const [oraclePrices, setOraclePrices] = useState(null);

    useEffect(() => {
        if (isConnected && address) {
            fetchBalances();
            fetchPositionData();
            const interval = setInterval(() => { fetchBalances(); fetchPositionData(); }, 15000);
            return () => clearInterval(interval);
        }
    }, [isConnected, address]);

    const fetchBalances = async () => {
        try {
            const provider = getReadProvider();
            const ethBal = await provider.getBalance(address);
            setETHBalance(ethers.formatEther(ethBal));
            const wbtcBal = await getWBTCBalance(address, provider);
            setWBTCBalance(wbtcBal);
        } catch (error) {
            console.error('Error fetching balances:', error);
        }
    };

    const fetchPositionData = async () => {
        try {
            const provider = getReadProvider();
            const [pos, prices] = await Promise.all([
                getUserPosition(address, provider),
                getOraclePrices(provider),
            ]);
            setPosition(pos);
            setOraclePrices(prices);
        } catch {}
    };

    const handleFaucet = async () => {
        if (!isConnected) { toast.error('Error', 'Please connect your wallet'); return; }
        setFaucetLoading(true);
        try {
            const signer = await getSignerFn();
            await getWBTCFromFaucet(signer);
            toast.success('Faucet Success', 'Received 1 WBTC from faucet');
            await fetchBalances();
        } catch (error) {
            toast.error('Faucet Failed', error.reason || error.message || 'Unknown error');
        } finally {
            setFaucetLoading(false);
        }
    };

    const handleDeposit = async (e) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) { toast.warning('Invalid Amount', 'Please enter a valid amount'); return; }
        if (!isConnected) { toast.error('Error', 'Please connect your wallet'); return; }
        const bal = parseFloat(asset === 'ETH' ? ethBalance : wbtcBalance) || 0;
        if (parseFloat(amount) > bal) { toast.error('Insufficient Balance', `You only have ${bal.toFixed(asset === 'ETH' ? 6 : 8)} ${asset}`); return; }

        setLoading(true);
        try {
            const signer = await getSignerFn();

            let tx;
            if (asset === 'ETH') {
                tx = await depositETH(amount, signer);
                toast.tx('Deposit Successful', `Deposited ${amount} ETH as collateral`, tx?.hash || '');
            } else {
                tx = await depositWBTC(amount, signer);
                toast.tx('Deposit Successful', `Deposited ${amount} WBTC as collateral`, tx?.hash || '');
            }
            recordDeposit(asset, amount, address);
            setAmount('');
            await fetchBalances();
        } catch (error) {
            toast.error('Deposit Failed', error.reason || error.message || 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const maxBalance = asset === 'ETH' ? ethBalance : wbtcBalance;

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Deposit Collateral</h1>
                        <p className="page-subtitle">Add ETH or WBTC as collateral to borrow USDX</p>
                    </div>

                    <div className="dashboard-grid">
                        <div className="dashboard-card">
                            <h3 className="card-title">Deposit Asset</h3>
                            <form onSubmit={handleDeposit} className="flex flex-col gap-lg">
                                <div className="form-group">
                                    <label className="form-label">Select Asset</label>
                                    <select className="form-input" value={asset} onChange={(e) => setAsset(e.target.value)} disabled={loading}>
                                        <option value="ETH">ETH - Ethereum</option>
                                        <option value="WBTC">WBTC - Wrapped Bitcoin</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Amount to Deposit</label>
                                    <div className="input-group">
                                        <input type="number" className="form-input" placeholder="0.0" step="0.000001" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={loading} />
                                        <span className="input-addon">{asset}</span>
                                    </div>
                                    <div className="flex justify-between mt-sm text-sm text-muted">
                                        <span>Balance: <strong style={{ color: 'var(--text-primary)' }}>{parseFloat(maxBalance).toFixed(6)} {asset}</strong></span>
                                        <button type="button" onClick={() => setAmount(maxBalance)} disabled={loading}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                                            MAX
                                        </button>
                                    </div>
                                </div>

                                {amount && parseFloat(amount) > 0 && (
                                    <div style={{
                                        padding: 'var(--spacing-md)',
                                        background: 'rgba(0,212,170,0.04)',
                                        borderRadius: 'var(--radius-lg)',
                                        border: '1px solid rgba(0,212,170,0.15)',
                                    }}>
                                        <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Supply APY — {asset}
                                        </div>
                                        <div className="flex justify-between text-sm mb-sm">
                                            <span className="text-muted">Annual Yield</span>
                                            <span className="mono font-bold" style={{ color: 'var(--success)' }}>{(getSupplyAPY(asset) * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between text-sm mb-sm">
                                            <span className="text-muted">7-Day Earnings</span>
                                            <span className="mono">{getProjectedYield(amount, asset, 7).earned.toFixed(6)} {asset}</span>
                                        </div>
                                        <div className="flex justify-between text-sm mb-sm">
                                            <span className="text-muted">30-Day Earnings</span>
                                            <span className="mono">{getProjectedYield(amount, asset, 30).earned.toFixed(6)} {asset}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">1-Year Earnings</span>
                                            <span className="mono font-bold" style={{ color: 'var(--success)' }}>{getProjectedYield(amount, asset, 365).earned.toFixed(6)} {asset}</span>
                                        </div>
                                    </div>
                                )}

                                <button type="submit" className="btn btn-primary w-full" disabled={loading || !amount || parseFloat(amount) <= 0}>
                                    {loading ? <><span className="loading"></span> Depositing...</> : `Deposit ${asset}`}
                                </button>

                                {asset === 'WBTC' && (
                                    <button type="button" className="btn btn-secondary w-full" onClick={handleFaucet} disabled={faucetLoading}>
                                        {faucetLoading ? <><span className="loading"></span> Getting WBTC...</> : 'Get 1 WBTC from Faucet (Testnet)'}
                                    </button>
                                )}
                            </form>
                        </div>

                        <div className="dashboard-card">
                            <h3 className="card-title">Collateral Details</h3>
                            <div className="flex flex-col gap-lg">
                                {[
                                    { symbol: 'ETH', name: 'Ethereum', type: 'Native asset', ltv: '60%', liq: '75%' },
                                    { symbol: 'WBTC', name: 'Bitcoin', type: 'ERC-20 token', ltv: '65%', liq: '80%' },
                                ].map(item => (
                                    <div key={item.symbol} style={{
                                        padding: 'var(--spacing-lg)',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-xl)',
                                        border: '1px solid var(--border)'
                                    }}>
                                        <div className="flex items-center gap-md mb-md">
                                            <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{item.symbol === 'ETH' ? '\u039E' : '\u20BF'}</div>
                                            <div>
                                                <div className="font-bold">{item.name}</div>
                                                <div className="text-xs text-muted">{item.type}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-2" style={{ gap: 'var(--spacing-md)', borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-md)' }}>
                                            <div>
                                                <div className="text-xs text-muted mb-sm">LTV Ratio <Tooltip term="ltv" /></div>
                                                <div className="font-bold" style={{ fontSize: '1.2rem', color: 'var(--success)' }}>{item.ltv}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted mb-sm">Liquidation <Tooltip term="liquidationThreshold" /></div>
                                                <div className="font-bold" style={{ fontSize: '1.2rem', color: 'var(--warning)' }}>{item.liq}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <div className="info-box info">
                                    <strong>Pro Tip:</strong> WBTC offers 5% higher LTV than ETH, allowing you to borrow more per unit of collateral.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Collateral Optimizer */}
                    {position && oraclePrices && (position.ethCollateral > 0n || position.wbtcCollateral > 0n) && (() => {
                        const ethAmount = parseFloat(ethers.formatEther(position.ethCollateral || 0n));
                        const wbtcAmount = parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8));
                        const ethValue = ethAmount * oraclePrices.ethPrice;
                        const wbtcValue = wbtcAmount * oraclePrices.wbtcPrice;
                        const totalValue = ethValue + wbtcValue;
                        const ethPct = totalValue > 0 ? (ethValue / totalValue) * 100 : 0;
                        const wbtcPct = totalValue > 0 ? (wbtcValue / totalValue) * 100 : 0;
                        // ETH LTV 60%, WBTC LTV 65% — more WBTC = higher borrowing power
                        const currentMaxBorrow = ethValue * 0.6 + wbtcValue * 0.65;
                        const allWbtcMaxBorrow = totalValue * 0.65;
                        const improvement = allWbtcMaxBorrow - currentMaxBorrow;

                        return (
                            <div className="optimizer-panel mt-lg">
                                <h3 className="card-title">Collateral Optimizer</h3>
                                <div className="text-sm text-muted mb-lg">Your current collateral mix and borrowing efficiency</div>

                                <div className="flex justify-between text-sm mb-sm">
                                    <span>ETH <span className="mono">{ethPct.toFixed(1)}%</span></span>
                                    <span>WBTC <span className="mono">{wbtcPct.toFixed(1)}%</span></span>
                                </div>
                                <div className="ratio-bar mb-lg">
                                    <div className="ratio-bar-eth" style={{ width: `${ethPct}%` }}></div>
                                    <div className="ratio-bar-wbtc" style={{ width: `${wbtcPct}%` }}></div>
                                </div>

                                <div className="flex justify-between text-sm mb-sm">
                                    <span className="text-muted">ETH Collateral</span>
                                    <span className="mono font-bold">{ethAmount.toFixed(4)} ETH (${ethValue.toFixed(2)})</span>
                                </div>
                                <div className="flex justify-between text-sm mb-sm">
                                    <span className="text-muted">WBTC Collateral</span>
                                    <span className="mono font-bold">{wbtcAmount.toFixed(8)} WBTC (${wbtcValue.toFixed(2)})</span>
                                </div>
                                <div className="flex justify-between text-sm mb-md" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-md)' }}>
                                    <span className="text-muted">Current Max Borrow</span>
                                    <span className="mono font-bold" style={{ color: 'var(--primary)' }}>${currentMaxBorrow.toFixed(2)}</span>
                                </div>

                                {improvement > 1 && (
                                    <div className="info-box info">
                                        <strong>Optimization Tip:</strong> WBTC has a 5% higher LTV ratio than ETH (65% vs 60%).
                                        Moving all collateral to WBTC could increase your max borrow by <strong style={{ color: 'var(--success)' }}>${improvement.toFixed(2)}</strong>.
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </main>
        </>
    );
}
