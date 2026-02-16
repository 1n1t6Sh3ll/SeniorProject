import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { ethers } from 'ethers';
import Icon from '../components/Icon';
import ConfirmationModal from '../components/ConfirmationModal';
import { useToast } from '../components/Toast';
import AddressBook from '../components/AddressBook';
import { getWBTCBalance, getUSDXBalance, getContract, getUserPosition, getOraclePrices, getReadProvider } from '../utils/contracts';
import { recordContactUsage, isContactSaved, getContactByAddress } from '../utils/addressBook';
import { checkTransferLimit, recordTransfer, getTransferLimits, getDailyRemaining } from '../utils/transferLimits';

export default function Send() {
    const { address, isConnected } = useWallet();
    const { getSigner: getSignerFn } = useWalletSigner();
    const toast = useToast();

    const [asset, setAsset] = useState('ETH');
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [balances, setBalances] = useState({ eth: '0', wbtc: '0', usdx: '0' });
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [tier, setTier] = useState(1);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showAddressBook, setShowAddressBook] = useState(false);
    const [recipientName, setRecipientName] = useState('');

    useEffect(() => {
        if (isConnected && address) fetchBalances();
    }, [isConnected, address]);

    const fetchBalances = async () => {
        try {
            const provider = getReadProvider();
            const [ethBal, wbtcBal, usdxBal, pos, oraclePrices] = await Promise.all([
                provider.getBalance(address),
                getWBTCBalance(address, provider),
                getUSDXBalance(address, provider),
                getUserPosition(address, provider),
                getOraclePrices(provider),
            ]);
            setBalances({ eth: ethers.formatEther(ethBal), wbtc: wbtcBal, usdx: usdxBal });
            setPrices(oraclePrices);
            setTier(pos?.creditTier || 1);
        } catch (err) {
            console.error('Error fetching balances:', err);
        }
    };

    const getBalance = () => {
        if (asset === 'ETH') return balances.eth;
        if (asset === 'WBTC') return balances.wbtc;
        return balances.usdx;
    };

    const getAmountUSD = () => {
        const amt = parseFloat(amount) || 0;
        if (asset === 'ETH') return amt * prices.ethPrice;
        if (asset === 'WBTC') return amt * prices.wbtcPrice;
        return amt; // USDX is 1:1
    };

    const handleSendClick = (e) => {
        e.preventDefault();
        if (!ethers.isAddress(recipient)) { toast.error('Invalid Address', 'Please enter a valid Ethereum address'); return; }
        if (!amount || parseFloat(amount) <= 0) { toast.warning('Invalid Amount', 'Please enter a valid amount'); return; }
        if (recipient.toLowerCase() === address.toLowerCase()) { toast.warning('Same Address', 'Cannot send to your own address'); return; }
        if (!isConnected) { toast.error('Wallet Error', 'Please connect your wallet'); return; }
        const bal = parseFloat(getBalance()) || 0;
        if (parseFloat(amount) > bal) { toast.error('Insufficient Balance', `You only have ${bal.toFixed(6)} ${asset}`); return; }
        const limitCheck = checkTransferLimit(getAmountUSD(), tier);
        if (!limitCheck.allowed) { toast.error('Transfer Limit', limitCheck.reason); return; }
        setShowConfirm(true);
    };

    const executeSend = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            const signer = await getSignerFn();
            let tx;
            if (asset === 'ETH') {
                tx = await signer.sendTransaction({ to: recipient, value: ethers.parseEther(amount) });
                await tx.wait();
            } else if (asset === 'WBTC') {
                const wbtc = getContract('WBTC', signer);
                tx = await wbtc.transfer(recipient, ethers.parseUnits(amount, 8));
                await tx.wait();
            } else {
                const usdx = getContract('USDX', signer);
                tx = await usdx.transfer(recipient, ethers.parseEther(amount));
                await tx.wait();
            }
            const txHash = tx?.hash || '';
            recordTransfer(getAmountUSD());
            recordContactUsage(recipient);
            toast.tx('Transfer Successful', `Sent ${amount} ${asset} to ${recipient.slice(0, 8)}...${recipient.slice(-6)}`, txHash);
            setAmount('');
            setRecipient('');
            setRecipientName('');
            await fetchBalances();
        } catch (err) {
            toast.error('Transfer Failed', err.reason || err.message || 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const confirmDetails = [
        { label: 'Asset', value: asset },
        { label: 'Amount', value: `${parseFloat(amount || 0).toFixed(6)} ${asset}` },
        { label: 'USD Value', value: `$${getAmountUSD().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { label: 'Recipient', value: recipient ? `${recipient.slice(0, 10)}...${recipient.slice(-8)}` : '' },
        { label: 'Remaining Balance', value: `${Math.max(0, parseFloat(getBalance()) - parseFloat(amount || 0)).toFixed(6)} ${asset}` },
    ];

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Send Tokens</h1>
                        <p className="page-subtitle">Transfer ETH, WBTC, or USDX to any address</p>
                    </div>

                    <div className="dashboard-grid">
                        <div className="dashboard-card">
                            <h3 className="card-title">Send</h3>
                            <form onSubmit={handleSendClick} className="flex flex-col gap-lg">
                                <div className="form-group">
                                    <label className="form-label">Asset</label>
                                    <select className="form-input" value={asset} onChange={(e) => setAsset(e.target.value)} disabled={loading}>
                                        <option value="ETH">ETH - Ethereum</option>
                                        <option value="WBTC">WBTC - Wrapped Bitcoin</option>
                                        <option value="USDX">USDX - Stablecoin</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <div className="flex justify-between items-center">
                                        <label className="form-label">Recipient Address</label>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddressBook(true)}
                                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                                            <Icon name="addressBook" size={12} /> Address Book
                                        </button>
                                    </div>
                                    <input type="text" className="form-input mono" placeholder="0x..." value={recipient}
                                        onChange={(e) => { setRecipient(e.target.value); setRecipientName(''); }} disabled={loading} style={{ fontSize: '0.85rem' }} />
                                    {recipientName && (
                                        <div className="text-xs mt-xs" style={{ color: 'var(--primary)' }}>Sending to: {recipientName}</div>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Amount</label>
                                    <div className="input-group">
                                        <input type="number" className="form-input" placeholder="0.0" step="0.000001" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={loading} />
                                        <span className="input-addon">{asset}</span>
                                    </div>
                                    <div className="flex justify-between mt-sm text-sm text-muted">
                                        <span>Balance: <strong style={{ color: 'var(--text-primary)' }}>{parseFloat(getBalance()).toFixed(6)} {asset}</strong></span>
                                        <button type="button" onClick={() => setAmount(asset === 'ETH' ? (parseFloat(getBalance()) - 0.01).toFixed(6) : getBalance())} disabled={loading}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                                            MAX
                                        </button>
                                    </div>
                                    {parseFloat(amount) > 0 && (
                                        <div className="text-xs mt-sm" style={{ color: 'var(--accent)', textAlign: 'right' }}>
                                            ≈ ${getAmountUSD().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                        </div>
                                    )}
                                </div>

                                <button type="submit" className="btn btn-primary w-full" disabled={loading || !amount || !recipient || parseFloat(amount) <= 0}>
                                    {loading ? <><span className="loading"></span> Sending...</> : `Send ${asset}`}
                                </button>
                            </form>
                        </div>

                        <div className="dashboard-card">
                            <h3 className="card-title">Your Balances</h3>
                            <div className="flex flex-col gap-md">
                                {[
                                    { symbol: 'ETH', name: 'Ethereum', balance: balances.eth, icon: '\u039E', decimals: 4 },
                                    { symbol: 'WBTC', name: 'Wrapped Bitcoin', balance: balances.wbtc, icon: '\u20BF', decimals: 6 },
                                    { symbol: 'USDX', name: 'Stablecoin', balance: balances.usdx, icon: '$', decimals: 2 },
                                ].map(token => (
                                    <div key={token.symbol} className="collateral-item" style={{ cursor: 'pointer' }} onClick={() => setAsset(token.symbol)}>
                                        <div className="flex items-center gap-md">
                                            <div style={{
                                                width: 40, height: 40, borderRadius: '50%',
                                                background: 'var(--bg-tertiary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '1.25rem', fontWeight: 800
                                            }}>
                                                {token.icon}
                                            </div>
                                            <div>
                                                <div className="font-bold">{token.symbol}</div>
                                                <div className="text-xs text-muted">{token.name}</div>
                                            </div>
                                        </div>
                                        <div className="mono font-bold" style={{ color: asset === token.symbol ? 'var(--primary)' : 'var(--text-primary)' }}>
                                            {parseFloat(token.balance).toFixed(token.decimals)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Transfer Limits */}
                            <div style={{ marginTop: 'var(--spacing-lg)', padding: 'var(--spacing-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Transfer Limits (Tier {tier})</div>
                                {(() => {
                                    const limits = getTransferLimits(tier);
                                    const remaining = getDailyRemaining(tier);
                                    const usagePct = ((limits.daily - remaining) / limits.daily) * 100;
                                    return (
                                        <>
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">Per Transaction</span>
                                                <span className="mono font-bold">${limits.perTx.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm mb-sm">
                                                <span className="text-muted">Daily Remaining</span>
                                                <span className="mono font-bold" style={{ color: 'var(--primary)' }}>${remaining.toLocaleString()}</span>
                                            </div>
                                            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                                                <div style={{
                                                    height: '100%', borderRadius: 2,
                                                    width: `${usagePct}%`,
                                                    background: usagePct > 80 ? 'var(--danger)' : 'var(--primary)',
                                                }} />
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            <div className="info-box info mt-lg">
                                <strong>Tip:</strong> Click on a token above to quickly select it for sending.
                                Always double-check the recipient address before confirming.
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <AddressBook
                isOpen={showAddressBook}
                onClose={() => setShowAddressBook(false)}
                onSelect={(addr, name) => { setRecipient(addr); setRecipientName(name); }}
            />

            <ConfirmationModal
                isOpen={showConfirm}
                onConfirm={executeSend}
                onCancel={() => setShowConfirm(false)}
                title="Confirm Transfer"
                details={confirmDetails}
                confirmText={`Send ${asset}`}
                confirmVariant="primary"
                loading={loading}
            />
        </>
    );
}
