import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { ethers } from 'ethers';
import Icon from '../components/Icon';
import {
    getOraclePrices, getReadProvider,
    getWBTCBalance, getUSDXBalance, swapAssets,
    getSwapQuote, getSwapPoolReserves
} from '../utils/contracts';

const ASSETS = ['ETH', 'WBTC', 'USDX'];

export default function Exchange() {
    const { address, isConnected } = useWallet();
    const { getSigner: getSignerFn } = useWalletSigner();

    const [fromAsset, setFromAsset] = useState('ETH');
    const [toAsset, setToAsset] = useState('USDX');
    const [fromAmount, setFromAmount] = useState('');
    const [quoteAmount, setQuoteAmount] = useState('');
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [balances, setBalances] = useState({ eth: '0', wbtc: '0', usdx: '0' });
    const [reserves, setReserves] = useState({ ethReserve: '0', wbtcReserve: '0', usdxReserve: '0' });
    const [refreshTimer, setRefreshTimer] = useState(15);
    const [swapping, setSwapping] = useState(false);
    const [txHash, setTxHash] = useState(null);
    const [error, setError] = useState(null);
    const [swapHistory, setSwapHistory] = useState([]);

    const fetchData = useCallback(async () => {
        try {
            const provider = getReadProvider();
            const [p, res, ethBal, wbtcBal, usdxBal] = await Promise.all([
                getOraclePrices(provider),
                getSwapPoolReserves(provider),
                address ? provider.getBalance(address) : Promise.resolve(0n),
                address ? getWBTCBalance(address, provider).catch(() => '0') : Promise.resolve('0'),
                address ? getUSDXBalance(address, provider).catch(() => '0') : Promise.resolve('0'),
            ]);
            setPrices(p);
            setReserves(res);
            setBalances({
                eth: ethBal ? ethers.formatEther(ethBal) : '0',
                wbtc: wbtcBal,
                usdx: usdxBal,
            });
            setRefreshTimer(15);
        } catch {}
    }, [address]);

    useEffect(() => {
        fetchData();
        const priceInterval = setInterval(fetchData, 15000);
        const timerInterval = setInterval(() => {
            setRefreshTimer(prev => (prev <= 1 ? 15 : prev - 1));
        }, 1000);
        return () => { clearInterval(priceInterval); clearInterval(timerInterval); };
    }, [fetchData]);

    // Live quote as user types
    useEffect(() => {
        const amt = parseFloat(fromAmount);
        if (!amt || amt <= 0 || fromAsset === toAsset) { setQuoteAmount(''); return; }

        const timeout = setTimeout(async () => {
            try {
                const q = await getSwapQuote(fromAsset, toAsset, fromAmount);
                setQuoteAmount(q);
            } catch {
                setQuoteAmount('');
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [fromAmount, fromAsset, toAsset]);

    const handleSwapDirection = () => {
        setFromAsset(toAsset);
        setToAsset(fromAsset);
        setFromAmount('');
        setQuoteAmount('');
        setTxHash(null);
        setError(null);
    };

    const getBalance = (asset) => {
        if (asset === 'ETH') return balances.eth;
        if (asset === 'WBTC') return balances.wbtc;
        return balances.usdx;
    };

    const getDecimals = (asset) => asset === 'WBTC' ? 6 : asset === 'ETH' ? 4 : 2;

    const handleMax = () => {
        const bal = parseFloat(getBalance(fromAsset)) || 0;
        if (fromAsset === 'ETH') {
            const max = Math.max(0, bal - 0.01); // Keep some for gas
            setFromAmount(max > 0 ? max.toFixed(6) : '');
        } else {
            setFromAmount(bal > 0 ? bal.toString() : '');
        }
    };

    const handleSwap = async () => {
        const amt = parseFloat(fromAmount);
        if (!amt || amt <= 0) { setError('Please enter a valid amount'); return; }
        if (!isConnected) { setError('Please connect your wallet'); return; }
        if (fromAsset === toAsset) { setError('Cannot swap same asset'); return; }
        const bal = parseFloat(getBalance(fromAsset)) || 0;
        if (amt > bal) { setError(`Insufficient ${fromAsset} balance. You have ${bal.toFixed(getDecimals(fromAsset))} ${fromAsset}`); return; }

        setSwapping(true);
        setError(null);
        setTxHash(null);

        try {
            const signer = await getSignerFn();
            const tx = await swapAssets(fromAsset, toAsset, fromAmount, signer);

            setTxHash(tx.hash);

            // Add to history
            const entry = {
                from: fromAsset, to: toAsset,
                fromAmount: amt, toAmount: parseFloat(quoteAmount) || 0,
                txHash: tx.hash,
                timestamp: Date.now(),
            };
            const hist = [entry, ...swapHistory].slice(0, 10);
            setSwapHistory(hist);

            setFromAmount('');
            setQuoteAmount('');
            await fetchData();
        } catch (err) {
            setError(err.message || 'Swap failed');
        } finally {
            setSwapping(false);
        }
    };

    const getPrice = (asset) => {
        if (asset === 'ETH') return prices.ethPrice;
        if (asset === 'WBTC') return prices.wbtcPrice;
        return 1; // USDX = $1
    };

    const inputAmt = parseFloat(fromAmount) || 0;
    const outputAmt = parseFloat(quoteAmount) || 0;
    const fromPrice = getPrice(fromAsset);
    const toPrice = getPrice(toAsset);
    const rate = toPrice > 0 && fromPrice > 0 ? fromPrice / toPrice : 0;
    const currentBalance = getBalance(fromAsset);

    // Available "to" assets (exclude from)
    const toOptions = ASSETS.filter(a => a !== fromAsset);

    return (
        <main className="page-section">
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Exchange</h1>
                    <p className="page-subtitle">Swap between ETH, WBTC, and USDX on-chain using oracle prices</p>
                </div>

                <div className="dashboard-grid">
                    {/* Swap Card */}
                    <div className="dashboard-card">
                        <h3 className="card-title">Swap</h3>

                        <div className="flex flex-col gap-lg">
                            {/* From */}
                            <div className="exchange-box">
                                <div className="flex justify-between text-sm mb-sm">
                                    <span className="text-muted">From</span>
                                    <span className="text-muted">
                                        Balance: {parseFloat(currentBalance).toFixed(getDecimals(fromAsset))} {fromAsset}
                                    </span>
                                </div>
                                <div className="flex gap-md items-center">
                                    <select className="form-input" value={fromAsset} onChange={e => {
                                        const newFrom = e.target.value;
                                        setFromAsset(newFrom);
                                        if (newFrom === toAsset) {
                                            // Pick the first available "to" that isn't the new "from"
                                            setToAsset(ASSETS.find(a => a !== newFrom));
                                        }
                                        setFromAmount(''); setQuoteAmount('');
                                    }} style={{ width: '120px', flexShrink: 0 }}>
                                        {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                    <input type="number" className="form-input mono" placeholder="0.0" step="0.000001"
                                        value={fromAmount} onChange={e => setFromAmount(e.target.value)} style={{ textAlign: 'right' }} />
                                    <button className="btn btn-secondary btn-sm" onClick={handleMax}>Max</button>
                                </div>
                                {inputAmt > 0 && (
                                    <div className="text-xs mt-sm" style={{ color: 'var(--accent)', textAlign: 'right' }}>
                                        ≈ ${(inputAmt * fromPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                    </div>
                                )}
                            </div>

                            {/* Swap direction button */}
                            <div className="text-center">
                                <button className="btn btn-secondary" onClick={handleSwapDirection}
                                    style={{ borderRadius: '50%', width: 40, height: 40, padding: 0 }}>
                                    <Icon name="exchange" size={18} />
                                </button>
                            </div>

                            {/* To */}
                            <div className="exchange-box">
                                <div className="flex justify-between text-sm mb-sm">
                                    <span className="text-muted">To (estimated)</span>
                                    <span className="text-muted">Price: ${toPrice.toLocaleString()}</span>
                                </div>
                                <div className="flex gap-md items-center">
                                    <select className="form-input" value={toAsset} onChange={e => {
                                        const newTo = e.target.value;
                                        setToAsset(newTo);
                                        if (newTo === fromAsset) {
                                            setFromAsset(ASSETS.find(a => a !== newTo));
                                        }
                                        setQuoteAmount('');
                                    }} style={{ width: '120px', flexShrink: 0 }}>
                                        {ASSETS.filter(a => a !== fromAsset).map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                    <div className="form-input mono" style={{ textAlign: 'right', background: 'var(--bg-tertiary)', cursor: 'default' }}>
                                        {outputAmt > 0 ? outputAmt.toFixed(getDecimals(toAsset)) : '0.0'}
                                    </div>
                                </div>
                                {outputAmt > 0 && (
                                    <div className="text-xs mt-sm" style={{ color: 'var(--success)', textAlign: 'right' }}>
                                        ≈ ${(outputAmt * toPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                    </div>
                                )}
                            </div>

                            {/* Rate details */}
                            {inputAmt > 0 && (
                                <div style={{
                                    padding: 'var(--spacing-md)',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 'var(--radius-lg)',
                                    border: '1px solid var(--border)',
                                }}>
                                    <div className="flex justify-between text-sm mb-sm">
                                        <span className="text-muted">Exchange Rate</span>
                                        <span className="mono">1 {fromAsset} = {rate.toFixed(toAsset === 'WBTC' ? 8 : toAsset === 'USDX' ? 2 : 6)} {toAsset}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted">Swap Fee</span>
                                        <span className="mono" style={{ color: 'var(--warning)' }}>0.3%</span>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="info-box error">
                                    <strong>Error:</strong> {error}
                                </div>
                            )}

                            {/* Success */}
                            {txHash && (
                                <div className="info-box success">
                                    Swap confirmed! Tx: <span className="mono">{txHash.slice(0, 10)}...{txHash.slice(-8)}</span>
                                </div>
                            )}

                            <button
                                className="btn btn-primary w-full"
                                onClick={handleSwap}
                                disabled={inputAmt <= 0 || swapping || fromAsset === toAsset}
                            >
                                {swapping ? 'Swapping...' : inputAmt <= 0 ? 'Enter Amount' : `Swap ${fromAsset} for ${toAsset}`}
                            </button>
                        </div>
                    </div>

                    {/* Right Panel: Market Info + Pool */}
                    <div className="dashboard-card">
                        <h3 className="card-title">Market Info</h3>

                        <div className="flex flex-col gap-lg">
                            <div>
                                <div className="flex justify-between items-center mb-sm">
                                    <span className="text-muted text-sm">Rate refresh in</span>
                                    <span className="mono font-bold" style={{ color: 'var(--primary)' }}>{refreshTimer}s</span>
                                </div>
                                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                                    <div style={{ height: '100%', width: `${(refreshTimer / 15) * 100}%`, background: 'var(--primary)', borderRadius: 2, transition: 'width 1s linear' }} />
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                <div className="text-sm text-muted mb-sm">ETH Price</div>
                                <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                    ${prices.ethPrice.toLocaleString()}
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                <div className="text-sm text-muted mb-sm">WBTC Price</div>
                                <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                    ${prices.wbtcPrice.toLocaleString()}
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                <div className="text-sm text-muted mb-sm">USDX Price</div>
                                <div className="mono font-bold" style={{ fontSize: '1.5rem' }}>
                                    $1.00
                                </div>
                            </div>

                            {/* Pool Reserves */}
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                <div className="text-sm font-bold mb-md">Pool Liquidity</div>
                                <div className="flex justify-between text-sm mb-sm">
                                    <span className="text-muted">ETH Reserve</span>
                                    <span className="mono">{parseFloat(reserves.ethReserve).toFixed(4)} ETH</span>
                                </div>
                                <div className="flex justify-between text-sm mb-sm">
                                    <span className="text-muted">WBTC Reserve</span>
                                    <span className="mono">{parseFloat(reserves.wbtcReserve).toFixed(6)} WBTC</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted">USDX Reserve</span>
                                    <span className="mono">{parseFloat(reserves.usdxReserve || '0').toLocaleString()} USDX</span>
                                </div>
                            </div>

                            {/* Recent Swaps */}
                            {swapHistory.length > 0 && (
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-lg)' }}>
                                    <div className="text-sm font-bold mb-md">Recent Swaps</div>
                                    <div className="flex flex-col gap-sm">
                                        {swapHistory.slice(0, 5).map((swap, i) => (
                                            <div key={i} className="flex justify-between text-xs" style={{
                                                padding: 'var(--spacing-sm)',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-md)',
                                            }}>
                                                <span className="mono">
                                                    {swap.fromAmount.toFixed(4)} {swap.from} &rarr; {swap.toAmount.toFixed(swap.to === 'WBTC' ? 6 : 4)} {swap.to}
                                                </span>
                                                <span className="text-muted">
                                                    {new Date(swap.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
