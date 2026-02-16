import { useState, useEffect } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';
import { ethers } from 'ethers';
import Icon from '../components/Icon';
import { useToast } from '../components/Toast';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { useBuiltinWallet } from '../contexts/BuiltinWalletContext';
import { getReadProvider, getWBTCBalance, getUSDXBalance, getOraclePrices } from '../utils/contracts';

const WALLETS_KEY = 'cryptocredit_wallets';
const CUSTOM_NETWORKS_KEY = 'cryptocredit_custom_networks';

const HARDHAT_ACCOUNTS = [
    { index: 0, address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' },
    { index: 1, address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' },
    { index: 2, address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' },
    { index: 3, address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' },
    { index: 4, address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a' },
];

const DEFAULT_NETWORKS = [
    { id: 31337, name: 'Localhost', rpcUrl: 'http://127.0.0.1:8545', symbol: 'ETH', color: '#00d4aa' },
    { id: 11155111, name: 'Sepolia', rpcUrl: 'https://rpc.sepolia.org', symbol: 'ETH', color: '#9b59b6' },
];

function getStoredWallets() {
    try { return JSON.parse(localStorage.getItem(WALLETS_KEY) || '[]'); } catch { return []; }
}
function saveWallets(wallets) { localStorage.setItem(WALLETS_KEY, JSON.stringify(wallets)); }
function getCustomNetworks() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_NETWORKS_KEY) || '[]'); } catch { return []; }
}
function saveCustomNetworks(nets) { localStorage.setItem(CUSTOM_NETWORKS_KEY, JSON.stringify(nets)); }

export default function WalletManager() {
    const { address, isConnected, isBuiltin } = useWallet();
    const { getSigner: getSignerFn } = useWalletSigner();
    const { connectBuiltin } = useBuiltinWallet();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const toast = useToast();

    const [wallets, setWallets] = useState([]);
    const [tab, setTab] = useState('my'); // 'my' | 'test' | 'networks'
    const [showModal, setShowModal] = useState(null);
    const [walletName, setWalletName] = useState('');
    const [importKey, setImportKey] = useState('');
    const [importPhrase, setImportPhrase] = useState('');
    const [balances, setBalances] = useState({});
    const [tokenBalances, setTokenBalances] = useState({});
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [showKey, setShowKey] = useState(null);
    const [showPhrase, setShowPhrase] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [generatedPhrase, setGeneratedPhrase] = useState('');
    const [editingName, setEditingName] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');

    // Sign Message
    const [signMessage, setSignMessage] = useState('');
    const [signature, setSignature] = useState('');
    const [verifyMessage, setVerifyMessage] = useState('');
    const [verifySig, setVerifySig] = useState('');
    const [recoveredAddr, setRecoveredAddr] = useState('');

    // Faucet
    const [faucetAmounts, setFaucetAmounts] = useState({});

    // Networks
    const [customNetworks, setCustomNetworks] = useState([]);
    const [networkHealth, setNetworkHealth] = useState({});
    const [newNetwork, setNewNetwork] = useState({ name: '', rpcUrl: '', chainId: '', symbol: 'ETH' });

    useEffect(() => {
        setWallets(getStoredWallets());
        setCustomNetworks(getCustomNetworks());
    }, []);

    useEffect(() => {
        fetchAllBalances();
        const interval = setInterval(fetchAllBalances, 15000);
        return () => clearInterval(interval);
    }, [wallets, tab]);

    useEffect(() => {
        if (tab === 'networks') checkNetworkHealth();
    }, [tab]);

    const fetchAllBalances = async () => {
        try {
            const provider = getReadProvider();
            const oraclePrices = await getOraclePrices(provider);
            setPrices(oraclePrices);

            const addrs = tab === 'test'
                ? HARDHAT_ACCOUNTS.map(a => a.address)
                : wallets.map(w => w.address);

            const newBalances = {};
            const newTokenBals = {};

            for (const addr of addrs) {
                try {
                    const [ethBal, wbtcBal, usdxBal] = await Promise.all([
                        provider.getBalance(addr),
                        getWBTCBalance(addr, provider).catch(() => '0'),
                        getUSDXBalance(addr, provider).catch(() => '0'),
                    ]);
                    newBalances[addr] = ethers.formatEther(ethBal);
                    newTokenBals[addr] = { wbtc: wbtcBal, usdx: usdxBal };
                } catch {
                    newBalances[addr] = '0';
                    newTokenBals[addr] = { wbtc: '0', usdx: '0' };
                }
            }
            setBalances(newBalances);
            setTokenBalances(newTokenBals);
        } catch (err) {
            console.error('Error fetching balances:', err);
        }
    };

    const checkNetworkHealth = async () => {
        const allNets = [...DEFAULT_NETWORKS, ...customNetworks];
        const health = {};
        for (const net of allNets) {
            try {
                const resp = await fetch(net.rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
                    signal: AbortSignal.timeout(3000),
                });
                health[net.id] = resp.ok ? 'online' : 'offline';
            } catch {
                health[net.id] = 'offline';
            }
        }
        setNetworkHealth(health);
    };

    const getWalletUSD = (addr) => {
        const eth = parseFloat(balances[addr] || '0') * prices.ethPrice;
        const wbtc = parseFloat(tokenBalances[addr]?.wbtc || '0') * prices.wbtcPrice;
        const usdx = parseFloat(tokenBalances[addr]?.usdx || '0');
        return eth + wbtc + usdx;
    };

    const createWallet = () => {
        const wallet = ethers.Wallet.createRandom();
        const mnemonic = wallet.mnemonic?.phrase || '';
        const name = walletName.trim() || `Wallet ${wallets.length + 1}`;
        const newWallet = { name, address: wallet.address, privateKey: wallet.privateKey, mnemonic, createdAt: new Date().toISOString() };
        const updated = [...wallets, newWallet];
        setWallets(updated); saveWallets(updated);
        setGeneratedPhrase(mnemonic); setWalletName('');
        toast.success('Wallet Created', `${name} has been created. Save your recovery phrase!`);
    };

    const importFromKey = () => {
        try {
            const key = importKey.trim();
            if (!key) { toast.error('Error', 'Please enter a private key'); return; }
            const wallet = new ethers.Wallet(key.startsWith('0x') ? key : `0x${key}`);
            if (wallets.find(w => w.address.toLowerCase() === wallet.address.toLowerCase())) { toast.warning('Duplicate', 'Already imported'); return; }
            const name = walletName.trim() || `Imported ${wallets.length + 1}`;
            const updated = [...wallets, { name, address: wallet.address, privateKey: wallet.privateKey, mnemonic: '', createdAt: new Date().toISOString(), imported: true }];
            setWallets(updated); saveWallets(updated);
            setImportKey(''); setWalletName(''); setShowModal(null);
            toast.success('Wallet Imported', `${name} imported successfully`);
        } catch { toast.error('Invalid Key', 'The private key is not valid'); }
    };

    const importFromPhrase = () => {
        try {
            const phrase = importPhrase.trim();
            if (!phrase) { toast.error('Error', 'Please enter a recovery phrase'); return; }
            const wallet = ethers.Wallet.fromPhrase(phrase);
            if (wallets.find(w => w.address.toLowerCase() === wallet.address.toLowerCase())) { toast.warning('Duplicate', 'Already imported'); return; }
            const name = walletName.trim() || `Recovered ${wallets.length + 1}`;
            const updated = [...wallets, { name, address: wallet.address, privateKey: wallet.privateKey, mnemonic: phrase, createdAt: new Date().toISOString(), imported: true }];
            setWallets(updated); saveWallets(updated);
            setImportPhrase(''); setWalletName(''); setShowModal(null);
            toast.success('Wallet Recovered', `${name} recovered from seed phrase`);
        } catch { toast.error('Invalid Phrase', 'The recovery phrase is not valid'); }
    };

    const removeWallet = (addr) => {
        const updated = wallets.filter(w => w.address !== addr);
        setWallets(updated); saveWallets(updated); setConfirmDelete(null);
        toast.info('Wallet Removed', 'The wallet has been removed');
    };

    const renameWallet = (addr) => {
        if (!editNameValue.trim()) return;
        const updated = wallets.map(w => w.address === addr ? { ...w, name: editNameValue.trim() } : w);
        setWallets(updated); saveWallets(updated);
        setEditingName(null); setEditNameValue('');
        toast.info('Renamed', 'Wallet name updated');
    };

    const exportWallet = (w) => {
        const data = { name: w.name, address: w.address, createdAt: w.createdAt, exported: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `wallet_${w.address.slice(0, 8)}_${Date.now()}.json`;
        a.click(); URL.revokeObjectURL(url);
        toast.info('Exported', 'Wallet data exported (private key excluded for security)');
    };

    const handleSign = async () => {
        if (!signMessage.trim()) return;
        try {
            const signer = await getSignerFn();
            const sig = await signer.signMessage(signMessage);
            setSignature(sig);
            toast.success('Signed', 'Message signed successfully');
        } catch (err) {
            toast.error('Sign Failed', err.message || 'Unknown error');
        }
    };

    const handleVerify = () => {
        try {
            const addr = ethers.verifyMessage(verifyMessage, verifySig);
            setRecoveredAddr(addr);
            toast.success('Verified', `Signature is from ${addr.slice(0, 8)}...${addr.slice(-6)}`);
        } catch {
            setRecoveredAddr('');
            toast.error('Invalid', 'Could not recover address from signature');
        }
    };

    const addCustomNetwork = () => {
        const cid = parseInt(newNetwork.chainId);
        if (!newNetwork.name || !newNetwork.rpcUrl || !cid) { toast.error('Error', 'Fill in all fields'); return; }
        const updated = [...customNetworks, { ...newNetwork, id: cid, color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0') }];
        setCustomNetworks(updated); saveCustomNetworks(updated);
        setNewNetwork({ name: '', rpcUrl: '', chainId: '', symbol: 'ETH' });
        toast.success('Network Added', `${newNetwork.name} saved`);
    };

    const removeCustomNetwork = (id) => {
        const updated = customNetworks.filter(n => n.id !== id);
        setCustomNetworks(updated); saveCustomNetworks(updated);
        toast.info('Removed', 'Custom network removed');
    };

    const copy = (text, label) => {
        navigator.clipboard.writeText(text);
        toast.info('Copied', `${label} copied to clipboard`);
    };

    const fundWallet = async (targetAddr, amount) => {
        const sendAmount = amount || faucetAmounts[targetAddr] || '1';
        if (!sendAmount || parseFloat(sendAmount) <= 0) { toast.error('Error', 'Enter a valid amount'); return; }
        try {
            // Use Hardhat's hardhat_setBalance RPC to directly set balance (no sender needed)
            const provider = getReadProvider();
            const currentBal = await provider.getBalance(targetAddr);
            const addAmount = ethers.parseEther(sendAmount);
            const newBalance = currentBal + addAmount;
            await provider.send('hardhat_setBalance', [targetAddr, '0x' + newBalance.toString(16)]);
            toast.success('Funded', `Added ${sendAmount} ETH to ${targetAddr.slice(0, 8)}...`);
            setFaucetAmounts(prev => ({ ...prev, [targetAddr]: '' }));
            await fetchAllBalances();
        } catch (err) {
            // Fallback: send via transaction if hardhat RPC not available
            if (!isConnected) { toast.error('Error', 'Connect a wallet first or use a Hardhat network'); return; }
            try {
                const signer = await getSignerFn();
                const tx = await signer.sendTransaction({ to: targetAddr, value: ethers.parseEther(sendAmount) });
                await tx.wait();
                toast.tx('Funded', `Sent ${sendAmount} ETH`, tx.hash);
                setFaucetAmounts(prev => ({ ...prev, [targetAddr]: '' }));
                await fetchAllBalances();
            } catch (err2) { toast.error('Fund Failed', err2.message || 'Unknown error'); }
        }
    };

    const handleUseWallet = (wallet) => {
        connectBuiltin({ address: wallet.address, privateKey: wallet.privateKey, name: wallet.name || `Account #${wallet.index}` });
        toast.success('Wallet Active', `Now using ${wallet.name || wallet.address.slice(0, 8)}...`);
    };

    const closeModal = () => {
        setShowModal(null); setWalletName(''); setImportKey(''); setImportPhrase(''); setGeneratedPhrase('');
    };

    const allNetworks = [...DEFAULT_NETWORKS, ...customNetworks];

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <h1 className="page-title">Wallet Manager</h1>
                        <p className="page-subtitle">Create, import, and manage wallets with seed phrase support</p>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-sm mb-lg" style={{ flexWrap: 'wrap' }}>
                        <button className={`btn ${tab === 'my' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab('my')}>
                            My Wallets ({wallets.length})
                        </button>
                        <button className={`btn ${tab === 'test' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab('test')}>
                            Test Accounts
                        </button>
                        <button className={`btn ${tab === 'networks' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setTab('networks')}>
                            <Icon name="network" size={12} /> Networks
                        </button>
                        {tab === 'my' && (
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--spacing-sm)' }}>
                                <button className="btn btn-primary btn-sm" onClick={() => setShowModal('create')}>+ New Wallet</button>
                                <button className="btn btn-outline btn-sm" onClick={() => setShowModal('import-key')}>Import Key</button>
                                <button className="btn btn-outline btn-sm" onClick={() => setShowModal('import-phrase')}>Recover Phrase</button>
                            </div>
                        )}
                    </div>

                    {/* Create Modal */}
                    {showModal === 'create' && (
                        <div className="modal-overlay" onClick={closeModal}>
                            <div className="modal" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3 className="modal-title">Create New Wallet</h3>
                                    <button className="modal-close" onClick={closeModal}>&times;</button>
                                </div>
                                {!generatedPhrase ? (
                                    <div className="flex flex-col gap-lg">
                                        <div className="form-group">
                                            <label className="form-label">Wallet Name</label>
                                            <input type="text" className="form-input" placeholder="My Wallet" value={walletName} onChange={e => setWalletName(e.target.value)} />
                                        </div>
                                        <button className="btn btn-primary w-full" onClick={createWallet}>Generate Wallet</button>
                                        <div className="info-box info">A new wallet will be generated with a 12-word recovery phrase.</div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-lg">
                                        <div className="info-box warning"><strong>Save this recovery phrase!</strong> Write it down and store it safely.</div>
                                        <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-lg)' }}>
                                            <div className="text-xs text-muted mb-sm" style={{ fontWeight: 700 }}>Recovery Phrase (12 words)</div>
                                            <div className="mono" style={{ fontSize: '0.9rem', lineHeight: 2, wordSpacing: '8px', color: 'var(--primary)', userSelect: 'all' }}>{generatedPhrase}</div>
                                        </div>
                                        <div className="flex gap-sm">
                                            <button className="btn btn-secondary flex-1" onClick={() => copy(generatedPhrase, 'Recovery phrase')}>Copy Phrase</button>
                                            <button className="btn btn-primary flex-1" onClick={closeModal}>I've Saved It</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Import Key Modal */}
                    {showModal === 'import-key' && (
                        <div className="modal-overlay" onClick={closeModal}>
                            <div className="modal" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3 className="modal-title">Import Private Key</h3>
                                    <button className="modal-close" onClick={closeModal}>&times;</button>
                                </div>
                                <div className="flex flex-col gap-lg">
                                    <div className="form-group">
                                        <label className="form-label">Wallet Name</label>
                                        <input type="text" className="form-input" placeholder="Imported Wallet" value={walletName} onChange={e => setWalletName(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Private Key</label>
                                        <input type="password" className="form-input mono" placeholder="0x..." value={importKey} onChange={e => setImportKey(e.target.value)} />
                                    </div>
                                    <button className="btn btn-primary w-full" onClick={importFromKey}>Import Wallet</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Import Phrase Modal */}
                    {showModal === 'import-phrase' && (
                        <div className="modal-overlay" onClick={closeModal}>
                            <div className="modal" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3 className="modal-title">Recover from Seed Phrase</h3>
                                    <button className="modal-close" onClick={closeModal}>&times;</button>
                                </div>
                                <div className="flex flex-col gap-lg">
                                    <div className="form-group">
                                        <label className="form-label">Wallet Name</label>
                                        <input type="text" className="form-input" placeholder="Recovered Wallet" value={walletName} onChange={e => setWalletName(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Recovery Phrase (12 or 24 words)</label>
                                        <textarea className="form-input mono" placeholder="word1 word2 word3 ..." rows={3} value={importPhrase} onChange={e => setImportPhrase(e.target.value)} style={{ resize: 'vertical' }} />
                                    </div>
                                    <button className="btn btn-primary w-full" onClick={importFromPhrase}>Recover Wallet</button>
                                    <div className="info-box info">Enter your BIP-39 recovery phrase to restore your wallet.</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Delete Confirm */}
                    {confirmDelete && (
                        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
                            <div className="modal" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3 className="modal-title">Remove Wallet</h3>
                                    <button className="modal-close" onClick={() => setConfirmDelete(null)}>&times;</button>
                                </div>
                                <p className="text-muted mb-lg">Are you sure? Save the private key or recovery phrase first.</p>
                                <div className="mono text-sm mb-lg" style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)', wordBreak: 'break-all' }}>{confirmDelete}</div>
                                <div className="flex gap-sm">
                                    <button className="btn btn-secondary flex-1" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                    <button className="btn flex-1" style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }} onClick={() => removeWallet(confirmDelete)}>Remove</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MY WALLETS TAB */}
                    {tab === 'my' && (
                        <>
                            {wallets.length === 0 ? (
                                <div className="dashboard-card empty-state-card">
                                    <Icon name="wallets" size={48} />
                                    <h3>No Wallets Yet</h3>
                                    <p>Create a new wallet, import a private key, or recover from a seed phrase.</p>
                                    <div className="flex gap-sm" style={{ justifyContent: 'center' }}>
                                        <button className="btn btn-primary" onClick={() => setShowModal('create')}>Create Wallet</button>
                                        <button className="btn btn-outline" onClick={() => setShowModal('import-phrase')}>Recover Phrase</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="test-accounts-grid">
                                    {wallets.map(w => (
                                        <div key={w.address} className="test-account-card">
                                            <div className="flex justify-between items-center mb-md">
                                                <div className="flex items-center gap-md">
                                                    <div className="test-account-index">{w.name.charAt(0).toUpperCase()}</div>
                                                    <div>
                                                        {editingName === w.address ? (
                                                            <div className="flex items-center gap-sm">
                                                                <input
                                                                    type="text"
                                                                    className="form-input"
                                                                    value={editNameValue}
                                                                    onChange={e => setEditNameValue(e.target.value)}
                                                                    onKeyDown={e => e.key === 'Enter' && renameWallet(w.address)}
                                                                    style={{ fontSize: '0.85rem', padding: '4px 8px', width: 140 }}
                                                                    autoFocus
                                                                />
                                                                <button className="btn btn-primary btn-sm" onClick={() => renameWallet(w.address)} style={{ padding: '4px 8px' }}>Save</button>
                                                                <button className="btn btn-secondary btn-sm" onClick={() => setEditingName(null)} style={{ padding: '4px 8px' }}>Cancel</button>
                                                            </div>
                                                        ) : (
                                                            <div className="font-bold" style={{ cursor: 'pointer' }} onClick={() => { setEditingName(w.address); setEditNameValue(w.name); }}>
                                                                {w.name} <Icon name="edit" size={11} style={{ opacity: 0.4 }} />
                                                            </div>
                                                        )}
                                                        <div className="text-xs text-muted">
                                                            {w.imported ? 'Imported' : 'Generated'} &middot; {new Date(w.createdAt).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="test-account-addr mb-sm">
                                                <div className="flex justify-between items-center">
                                                    <span style={{ wordBreak: 'break-all' }}>{w.address}</span>
                                                    <button className="copy-btn" onClick={() => copy(w.address, 'Address')}>Copy</button>
                                                </div>
                                            </div>

                                            {/* Multi-Token Balances */}
                                            <div className="mb-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-sm)' }}>
                                                <div>
                                                    <div className="text-xs text-muted">ETH</div>
                                                    <div className="mono font-bold" style={{ fontSize: '0.9rem' }}>{parseFloat(balances[w.address] || '0').toFixed(4)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted">WBTC</div>
                                                    <div className="mono font-bold" style={{ fontSize: '0.9rem' }}>{parseFloat(tokenBalances[w.address]?.wbtc || '0').toFixed(6)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted">USDX</div>
                                                    <div className="mono font-bold" style={{ fontSize: '0.9rem' }}>{parseFloat(tokenBalances[w.address]?.usdx || '0').toFixed(2)}</div>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center mb-md" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-sm)' }}>
                                                <span className="text-xs text-muted">Total Value</span>
                                                <span className="mono font-bold" style={{ color: 'var(--primary)' }}>${getWalletUSD(w.address).toFixed(2)}</span>
                                            </div>

                                            {showKey === w.address && (
                                                <div className="test-account-key mb-sm">
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <div className="text-xs" style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: '4px' }}>Private Key</div>
                                                            <span style={{ wordBreak: 'break-all' }}>{w.privateKey}</span>
                                                        </div>
                                                        <button className="copy-btn" onClick={() => copy(w.privateKey, 'Private key')}>Copy</button>
                                                    </div>
                                                </div>
                                            )}

                                            {showPhrase === w.address && w.mnemonic && (
                                                <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 'var(--radius-md)', padding: '8px 12px', marginBottom: 'var(--spacing-sm)' }}>
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <div className="text-xs" style={{ color: 'var(--warning)', fontWeight: 700, marginBottom: '4px' }}>Recovery Phrase</div>
                                                            <span className="mono" style={{ fontSize: '0.78rem', wordBreak: 'break-all', lineHeight: 1.8 }}>{w.mnemonic}</span>
                                                        </div>
                                                        <button className="copy-btn" onClick={() => copy(w.mnemonic, 'Recovery phrase')}>Copy</button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                                <button className="btn btn-primary btn-sm" onClick={() => handleUseWallet(w)}
                                                    style={isBuiltin && address?.toLowerCase() === w.address.toLowerCase() ? { opacity: 0.6 } : {}}>
                                                    {isBuiltin && address?.toLowerCase() === w.address.toLowerCase() ? 'Active' : 'Use This Wallet'}
                                                </button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => setShowKey(showKey === w.address ? null : w.address)}>
                                                    {showKey === w.address ? 'Hide Key' : 'Show Key'}
                                                </button>
                                                {w.mnemonic && (
                                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowPhrase(showPhrase === w.address ? null : w.address)}>
                                                        {showPhrase === w.address ? 'Hide Phrase' : 'Show Phrase'}
                                                    </button>
                                                )}
                                                {isConnected && (
                                                    <>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            placeholder="ETH"
                                                            min="0"
                                                            step="any"
                                                            value={faucetAmounts[w.address] || ''}
                                                            onChange={e => setFaucetAmounts(prev => ({ ...prev, [w.address]: e.target.value }))}
                                                            style={{ fontSize: '0.8rem', padding: '4px 8px', width: 80 }}
                                                        />
                                                        <button className="btn btn-outline btn-sm" onClick={() => fundWallet(w.address)}>
                                                            <Icon name="deposit" size={12} /> Fund
                                                        </button>
                                                    </>
                                                )}
                                                <button className="btn btn-secondary btn-sm" onClick={() => exportWallet(w)}>
                                                    <Icon name="download" size={12} /> Export
                                                </button>
                                                <button className="btn btn-sm" style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)' }}
                                                    onClick={() => setConfirmDelete(w.address)}>Remove</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* WALLET MANAGEMENT TAB */}
                    {tab === 'test' && (
                        <>
                            <div className="info-box info mb-lg">
                                <strong>Hardhat Test Accounts</strong> — Pre-funded with 10,000 ETH each. Private keys are publicly known and only work on Chain ID 31337. Use the faucet to send any amount of ETH between accounts.
                            </div>

                            {/* Faucet Section */}
                                <div className="dashboard-card mb-lg" style={{ border: '1px solid rgba(0,212,170,0.3)' }}>
                                    <h3 className="card-title"><Icon name="deposit" size={18} /> ETH Faucet</h3>
                                    <p className="text-muted text-sm mb-md">Add ETH to any address directly. No amount limit.</p>
                                    <div className="flex gap-sm items-end" style={{ flexWrap: 'wrap' }}>
                                        <div className="form-group" style={{ flex: '1 1 300px', marginBottom: 0 }}>
                                            <label className="form-label">Recipient Address</label>
                                            <input
                                                type="text"
                                                className="form-input mono"
                                                placeholder="0x..."
                                                id="faucet-recipient"
                                            />
                                        </div>
                                        <div className="form-group" style={{ flex: '0 0 160px', marginBottom: 0 }}>
                                            <label className="form-label">Amount (ETH)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                placeholder="100"
                                                min="0"
                                                step="any"
                                                id="faucet-amount"
                                            />
                                        </div>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => {
                                                const recipient = document.getElementById('faucet-recipient').value.trim();
                                                const amt = document.getElementById('faucet-amount').value.trim();
                                                if (!recipient || !ethers.isAddress(recipient)) { toast.error('Error', 'Enter a valid address'); return; }
                                                if (!amt || parseFloat(amt) <= 0) { toast.error('Error', 'Enter a valid amount'); return; }
                                                fundWallet(recipient, amt);
                                            }}
                                        >
                                            Send ETH
                                        </button>
                                    </div>
                                </div>

                            <div className="test-accounts-grid">
                                {HARDHAT_ACCOUNTS.map(a => (
                                    <div key={a.address} className="test-account-card">
                                        <div className="flex items-center gap-md mb-md">
                                            <div className="test-account-index">#{a.index}</div>
                                            <div>
                                                <div className="font-bold">Account #{a.index}</div>
                                                <div className="text-xs text-muted">Pre-funded test account</div>
                                            </div>
                                        </div>
                                        <div className="test-account-addr mb-sm">
                                            <div className="flex justify-between items-center">
                                                <span style={{ wordBreak: 'break-all' }}>{a.address}</span>
                                                <button className="copy-btn" onClick={() => copy(a.address, 'Address')}>Copy</button>
                                            </div>
                                        </div>
                                        <div className="mb-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-sm)' }}>
                                            <div>
                                                <div className="text-xs text-muted">ETH</div>
                                                <div className="mono font-bold" style={{ fontSize: '0.9rem' }}>{parseFloat(balances[a.address] || '0').toFixed(4)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted">WBTC</div>
                                                <div className="mono font-bold" style={{ fontSize: '0.9rem' }}>{parseFloat(tokenBalances[a.address]?.wbtc || '0').toFixed(6)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted">USDX</div>
                                                <div className="mono font-bold" style={{ fontSize: '0.9rem' }}>{parseFloat(tokenBalances[a.address]?.usdx || '0').toFixed(2)}</div>
                                            </div>
                                        </div>
                                        {showKey === a.address && (
                                            <div className="test-account-key mb-sm">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <div className="text-xs" style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: '4px' }}>Private Key</div>
                                                        <span style={{ wordBreak: 'break-all' }}>{a.privateKey}</span>
                                                    </div>
                                                    <button className="copy-btn" onClick={() => copy(a.privateKey, 'Private key')}>Copy</button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex gap-sm mb-sm">
                                            <button className="btn btn-primary btn-sm" onClick={() => handleUseWallet({ ...a, name: `Account #${a.index}` })}
                                                style={isBuiltin && address?.toLowerCase() === a.address.toLowerCase() ? { opacity: 0.6 } : {}}>
                                                {isBuiltin && address?.toLowerCase() === a.address.toLowerCase() ? 'Active' : 'Use This Wallet'}
                                            </button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => setShowKey(showKey === a.address ? null : a.address)}>
                                                {showKey === a.address ? 'Hide Key' : 'Show Key'}
                                            </button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => copy(a.address, 'Address')}>Copy Address</button>
                                        </div>
                                        {/* Per-account quick faucet */}
                                        <div className="flex gap-sm items-center" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-sm)' }}>
                                            <input
                                                type="number"
                                                className="form-input"
                                                placeholder="ETH amount"
                                                min="0"
                                                step="any"
                                                value={faucetAmounts[a.address] || ''}
                                                onChange={e => setFaucetAmounts(prev => ({ ...prev, [a.address]: e.target.value }))}
                                                style={{ fontSize: '0.8rem', padding: '6px 10px', flex: '1 1 100px' }}
                                            />
                                            <button className="btn btn-outline btn-sm" onClick={() => fundWallet(a.address)} style={{ whiteSpace: 'nowrap' }}>
                                                <Icon name="deposit" size={12} /> Fund
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* NETWORKS TAB */}
                    {tab === 'networks' && (
                        <>
                            <div className="dashboard-card mb-lg">
                                <h3 className="card-title">Configured Networks</h3>
                                <div className="flex flex-col gap-sm">
                                    {allNetworks.map(net => (
                                        <div key={net.id} className="network-card">
                                            <div className="flex items-center gap-md" style={{ flex: 1 }}>
                                                <div className="wallet-network-dot" style={{ background: net.color, width: 12, height: 12 }} />
                                                <div>
                                                    <div className="font-bold">{net.name}</div>
                                                    <div className="text-xs text-muted mono">{net.rpcUrl}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-sm">
                                                <span className="mono text-xs text-muted">ID: {net.id}</span>
                                                <span className={`badge ${networkHealth[net.id] === 'online' ? 'badge-success' : networkHealth[net.id] === 'offline' ? 'badge-danger' : ''}`}>
                                                    {networkHealth[net.id] || 'checking...'}
                                                </span>
                                                {chainId === net.id ? (
                                                    <span className="badge badge-success">Connected</span>
                                                ) : (
                                                    <button className="btn btn-primary btn-sm" onClick={() => switchChain && switchChain({ chainId: net.id })}>Switch</button>
                                                )}
                                                {!DEFAULT_NETWORKS.find(d => d.id === net.id) && (
                                                    <button className="btn btn-sm" style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '4px 8px' }}
                                                        onClick={() => removeCustomNetwork(net.id)}>
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button className="btn btn-secondary btn-sm mt-md" onClick={checkNetworkHealth}>
                                    <Icon name="refresh" size={12} /> Check Health
                                </button>
                            </div>

                            {/* Add Custom Network */}
                            <div className="dashboard-card mb-lg">
                                <h3 className="card-title">Add Custom Network</h3>
                                <div className="grid grid-2 gap-md mb-md">
                                    <div className="form-group">
                                        <label className="form-label">Network Name</label>
                                        <input type="text" className="form-input" placeholder="My Network" value={newNetwork.name} onChange={e => setNewNetwork({ ...newNetwork, name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Chain ID</label>
                                        <input type="number" className="form-input" placeholder="1234" value={newNetwork.chainId} onChange={e => setNewNetwork({ ...newNetwork, chainId: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">RPC URL</label>
                                        <input type="text" className="form-input mono" placeholder="https://..." value={newNetwork.rpcUrl} onChange={e => setNewNetwork({ ...newNetwork, rpcUrl: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Currency Symbol</label>
                                        <input type="text" className="form-input" placeholder="ETH" value={newNetwork.symbol} onChange={e => setNewNetwork({ ...newNetwork, symbol: e.target.value })} />
                                    </div>
                                </div>
                                <button className="btn btn-primary btn-sm" onClick={addCustomNetwork}>Add Network</button>
                            </div>

                            {/* Sign Message */}
                            {isConnected && (
                                <div className="dashboard-card mb-lg">
                                    <h3 className="card-title"><Icon name="signature" size={18} /> Sign & Verify Messages</h3>
                                    <div className="grid grid-2" style={{ gap: 'var(--spacing-xl)' }}>
                                        <div>
                                            <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sign Message</div>
                                            <div className="form-group">
                                                <textarea className="form-input" rows={3} placeholder="Enter message to sign..." value={signMessage} onChange={e => setSignMessage(e.target.value)} style={{ resize: 'vertical' }} />
                                            </div>
                                            <button className="btn btn-primary btn-sm mb-md" onClick={handleSign} disabled={!signMessage.trim()}>
                                                <Icon name="signature" size={12} /> Sign
                                            </button>
                                            {signature && (
                                                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)', border: '1px solid var(--border)' }}>
                                                    <div className="text-xs text-muted mb-sm">Signature</div>
                                                    <div className="mono" style={{ fontSize: '0.7rem', wordBreak: 'break-all', color: 'var(--primary)' }}>{signature}</div>
                                                    <button className="btn btn-secondary btn-sm mt-sm" onClick={() => copy(signature, 'Signature')}>Copy</button>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-xs text-muted mb-sm" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Verify Signature</div>
                                            <div className="form-group">
                                                <label className="form-label">Message</label>
                                                <input type="text" className="form-input" placeholder="Original message" value={verifyMessage} onChange={e => setVerifyMessage(e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Signature</label>
                                                <input type="text" className="form-input mono" placeholder="0x..." value={verifySig} onChange={e => setVerifySig(e.target.value)} style={{ fontSize: '0.8rem' }} />
                                            </div>
                                            <button className="btn btn-primary btn-sm mb-md" onClick={handleVerify} disabled={!verifyMessage || !verifySig}>Verify</button>
                                            {recoveredAddr && (
                                                <div className="info-box info">
                                                    <strong>Recovered Address:</strong>
                                                    <div className="mono" style={{ fontSize: '0.8rem', marginTop: 4 }}>{recoveredAddr}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Connected Wallet Info */}
                    {isConnected && tab !== 'networks' && (
                        <div className="dashboard-card mt-lg">
                            <h3 className="card-title">Connected Wallet {isBuiltin ? '(Built-in)' : '(MetaMask)'}</h3>
                            <div className="flex items-center gap-lg">
                                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon name="check" size={24} />
                                </div>
                                <div>
                                    <div className="font-bold">Active Connection</div>
                                    <div className="mono text-sm text-muted">{address}</div>
                                </div>
                                <span className="badge badge-success" style={{ marginLeft: 'auto' }}>Connected</span>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </>
    );
}
