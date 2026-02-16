import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ethers } from 'ethers';
import Icon from '../components/Icon';
import { discoverAllUsers, getReadProvider } from '../utils/contracts';
import { useBuiltinWallet } from '../contexts/BuiltinWalletContext';
import { encryptData, decryptData } from '../utils/walletCrypto';

const WALLETS_KEY = 'cryptocredit_wallets';

function getStoredWallets() {
    try { return JSON.parse(localStorage.getItem(WALLETS_KEY) || '[]'); } catch { return []; }
}
function saveWallets(wallets) { localStorage.setItem(WALLETS_KEY, JSON.stringify(wallets)); }

export default function LandingPage() {
    const [userCount, setUserCount] = useState(0);
    const { connectBuiltin } = useBuiltinWallet();

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [view, setView] = useState('main'); // 'main' | 'create' | 'import' | 'phrase-show' | 'unlock' | 'reset'
    const [savedWallets, setSavedWallets] = useState([]);

    // Create wallet state
    const [walletName, setWalletName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [createdWallet, setCreatedWallet] = useState(null);
    const [phraseCopied, setPhraseCopied] = useState(false);

    // Import state
    const [importTab, setImportTab] = useState('key'); // 'key' | 'phrase'
    const [importKey, setImportKey] = useState('');
    const [importPhrase, setImportPhrase] = useState('');
    const [importName, setImportName] = useState('');

    // Unlock state
    const [selectedWallet, setSelectedWallet] = useState(null);
    const [unlockPassword, setUnlockPassword] = useState('');

    // Reset password state
    const [resetPhrase, setResetPhrase] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');

    // Shared
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const provider = getReadProvider();
                const users = await discoverAllUsers(provider);
                setUserCount(users.length);
            } catch {}
        };
        fetchStats();
        setSavedWallets(getStoredWallets());
    }, []);

    const openModal = () => {
        setSavedWallets(getStoredWallets());
        setShowModal(true);
        setView('main');
        resetForms();
    };

    const closeModal = () => {
        setShowModal(false);
        setView('main');
        resetForms();
    };

    const resetForms = () => {
        setWalletName('');
        setPassword('');
        setConfirmPassword('');
        setCreatedWallet(null);
        setPhraseCopied(false);
        setImportKey('');
        setImportPhrase('');
        setImportName('');
        setImportTab('key');
        setSelectedWallet(null);
        setUnlockPassword('');
        setResetPhrase('');
        setNewPassword('');
        setConfirmNewPassword('');
        setError('');
        setLoading(false);
    };

    const goBack = () => {
        setView('main');
        setError('');
        setPassword('');
        setConfirmPassword('');
        setUnlockPassword('');
        setSelectedWallet(null);
    };

    // ── Create Wallet ──
    const handleCreateWallet = async () => {
        setError('');
        if (!password) { setError('Please set a password'); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match'); return; }

        setLoading(true);
        try {
            const wallet = ethers.Wallet.createRandom();
            const name = walletName.trim() || `Wallet ${savedWallets.length + 1}`;

            // Encrypt private key and mnemonic
            const encKey = await encryptData(wallet.privateKey, password);
            const encMnemonic = await encryptData(wallet.mnemonic.phrase, password);

            const stored = {
                name,
                address: wallet.address,
                encryptedKey: encKey,
                encryptedMnemonic: encMnemonic,
                createdAt: new Date().toISOString(),
            };

            const updated = [...savedWallets, stored];
            saveWallets(updated);
            setSavedWallets(updated);

            // Keep plaintext temporarily for phrase display
            setCreatedWallet({
                name,
                address: wallet.address,
                privateKey: wallet.privateKey,
                mnemonic: wallet.mnemonic.phrase,
            });
            setView('phrase-show');
        } catch (err) {
            setError('Failed to create wallet');
        } finally {
            setLoading(false);
        }
    };

    // ── Import Wallet ──
    const handleImport = async () => {
        setError('');
        if (!password) { setError('Please set a password'); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match'); return; }

        setLoading(true);
        try {
            let wallet, mnemonic = '';

            if (importTab === 'key') {
                const key = importKey.trim();
                if (!key) { setError('Please enter a private key'); setLoading(false); return; }
                wallet = new ethers.Wallet(key.startsWith('0x') ? key : `0x${key}`);
            } else {
                const phrase = importPhrase.trim();
                if (!phrase) { setError('Please enter a recovery phrase'); setLoading(false); return; }
                wallet = ethers.Wallet.fromPhrase(phrase);
                mnemonic = phrase;
            }

            if (savedWallets.find(w => w.address.toLowerCase() === wallet.address.toLowerCase())) {
                setError('This wallet is already saved');
                setLoading(false);
                return;
            }

            const name = importName.trim() || `Imported ${savedWallets.length + 1}`;
            const encKey = await encryptData(wallet.privateKey, password);
            const encMnemonic = mnemonic ? await encryptData(mnemonic, password) : null;

            const stored = {
                name,
                address: wallet.address,
                encryptedKey: encKey,
                encryptedMnemonic: encMnemonic,
                createdAt: new Date().toISOString(),
                imported: true,
            };

            const updated = [...savedWallets, stored];
            saveWallets(updated);
            setSavedWallets(updated);
            connectBuiltin({ address: wallet.address, privateKey: wallet.privateKey, name });
            closeModal();
        } catch {
            setError(importTab === 'key' ? 'Invalid private key' : 'Invalid recovery phrase');
        } finally {
            setLoading(false);
        }
    };

    // ── Unlock Wallet ──
    const handleUnlock = async () => {
        setError('');
        if (!unlockPassword) { setError('Please enter your password'); return; }
        if (!selectedWallet) return;

        setLoading(true);
        try {
            const privateKey = await decryptData(selectedWallet.encryptedKey, unlockPassword);
            connectBuiltin({ address: selectedWallet.address, privateKey, name: selectedWallet.name });
            closeModal();
        } catch {
            setError('Incorrect password');
        } finally {
            setLoading(false);
        }
    };

    // ── Delete Wallet ──
    const handleDeleteWallet = (addr) => {
        const updated = savedWallets.filter(w => w.address.toLowerCase() !== addr.toLowerCase());
        saveWallets(updated);
        setSavedWallets(updated);
        if (selectedWallet?.address.toLowerCase() === addr.toLowerCase()) {
            setSelectedWallet(null);
        }
    };

    // ── Reset Password via Recovery Phrase ──
    const handleResetPassword = async () => {
        setError('');
        if (!resetPhrase.trim()) { setError('Please enter your recovery phrase'); return; }
        if (!newPassword) { setError('Please set a new password'); return; }
        if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
        if (newPassword !== confirmNewPassword) { setError('Passwords do not match'); return; }
        if (!selectedWallet) return;

        setLoading(true);
        try {
            // Verify the phrase produces the same address
            const wallet = ethers.Wallet.fromPhrase(resetPhrase.trim());
            if (wallet.address.toLowerCase() !== selectedWallet.address.toLowerCase()) {
                setError('Recovery phrase does not match this wallet');
                setLoading(false);
                return;
            }

            // Re-encrypt with new password
            const encKey = await encryptData(wallet.privateKey, newPassword);
            const encMnemonic = await encryptData(resetPhrase.trim(), newPassword);

            const updated = savedWallets.map(w => {
                if (w.address.toLowerCase() === selectedWallet.address.toLowerCase()) {
                    return { ...w, encryptedKey: encKey, encryptedMnemonic: encMnemonic };
                }
                return w;
            });
            saveWallets(updated);
            setSavedWallets(updated);

            // Connect directly after reset
            connectBuiltin({ address: wallet.address, privateKey: wallet.privateKey, name: selectedWallet.name });
            closeModal();
        } catch {
            setError('Invalid recovery phrase');
        } finally {
            setLoading(false);
        }
    };

    const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

    const hasSavedWallets = savedWallets.length > 0;

    return (
        <div className="landing-page">
            <div className="landing-bg-grid" />

            {/* Hero */}
            <section className="landing-hero">
                <div className="landing-hero-glow" />
                <div className="landing-logo">
                    <span className="landing-logo-icon">CC</span>
                    <h1 className="landing-title">CryptoCredit Bank</h1>
                </div>
                <p className="landing-subtitle">
                    The next-generation decentralized crypto bank. Deposit collateral, borrow stablecoins,
                    swap tokens, and build your on-chain credit score.
                </p>

                <div className="landing-cta" style={{ marginTop: 'var(--spacing-xl)' }}>
                    <button className="landing-connect-btn" onClick={openModal}>
                        <Icon name="wallets" size={20} />
                        Connect Wallet
                    </button>
                </div>
            </section>

            {/* Connect Wallet Modal */}
            {showModal && (
                <div className="wallet-modal-overlay" onClick={closeModal}>
                    <div className="wallet-modal" onClick={e => e.stopPropagation()}>

                        {/* ── MAIN VIEW ── */}
                        {view === 'main' && (
                            <>
                                <div className="wallet-modal-header">
                                    <h3>Connect Wallet</h3>
                                    <button className="wallet-modal-close" onClick={closeModal}>&times;</button>
                                </div>
                                <div className="wallet-modal-body">
                                    {/* Browser Wallet */}
                                    <div className="wallet-modal-section">
                                        <div className="wallet-modal-section-label">Browser Wallet</div>
                                        <div className="wallet-modal-rainbow-wrap">
                                            <ConnectButton label="MetaMask / WalletConnect" />
                                        </div>
                                    </div>

                                    <div className="wallet-modal-divider"><span>or</span></div>

                                    {/* CryptoCredit Wallet options */}
                                    <div className="wallet-modal-section">
                                        <div className="wallet-modal-section-label">CryptoCredit Wallet</div>

                                        {hasSavedWallets && (
                                            <button className="wallet-modal-option" onClick={() => setView('unlock')}>
                                                <div className="wallet-modal-option-icon unlock">
                                                    <Icon name="shield" size={18} />
                                                </div>
                                                <div className="wallet-modal-option-text">
                                                    <span className="wallet-modal-option-title">Unlock Saved Wallet</span>
                                                    <span className="wallet-modal-option-desc">{savedWallets.length} wallet{savedWallets.length !== 1 ? 's' : ''} saved</span>
                                                </div>
                                                <span className="wallet-modal-option-arrow">&rsaquo;</span>
                                            </button>
                                        )}

                                        <button className="wallet-modal-option" onClick={() => setView('create')}>
                                            <div className="wallet-modal-option-icon create">
                                                <Icon name="deposit" size={18} />
                                            </div>
                                            <div className="wallet-modal-option-text">
                                                <span className="wallet-modal-option-title">Create New Wallet</span>
                                                <span className="wallet-modal-option-desc">Generate wallet with recovery phrase</span>
                                            </div>
                                            <span className="wallet-modal-option-arrow">&rsaquo;</span>
                                        </button>

                                        <button className="wallet-modal-option" onClick={() => setView('import')}>
                                            <div className="wallet-modal-option-icon import">
                                                <Icon name="borrow" size={18} />
                                            </div>
                                            <div className="wallet-modal-option-text">
                                                <span className="wallet-modal-option-title">Import Wallet</span>
                                                <span className="wallet-modal-option-desc">Private key or seed phrase</span>
                                            </div>
                                            <span className="wallet-modal-option-arrow">&rsaquo;</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── UNLOCK VIEW ── */}
                        {view === 'unlock' && (
                            <>
                                <div className="wallet-modal-header">
                                    <button className="wallet-modal-back" onClick={goBack}>&lsaquo;</button>
                                    <h3>{selectedWallet ? 'Enter Password' : 'Unlock Wallet'}</h3>
                                    <button className="wallet-modal-close" onClick={closeModal}>&times;</button>
                                </div>
                                <div className="wallet-modal-body">
                                    {!selectedWallet ? (
                                        <>
                                            <p className="wallet-modal-hint">Select a wallet to unlock:</p>
                                            <div className="wallet-modal-saved-list">
                                                {savedWallets.map((w, i) => (
                                                    <div key={i} className="wallet-modal-saved-row">
                                                        <button
                                                            className="wallet-modal-saved-item"
                                                            onClick={() => { setSelectedWallet(w); setError(''); setUnlockPassword(''); }}
                                                        >
                                                            <div className="wallet-modal-saved-avatar">{w.name.charAt(0).toUpperCase()}</div>
                                                            <div className="wallet-modal-saved-info">
                                                                <span className="wallet-modal-saved-name">{w.name}</span>
                                                                <span className="wallet-modal-saved-addr mono">{shortAddr(w.address)}</span>
                                                            </div>
                                                            <Icon name="shield" size={14} />
                                                        </button>
                                                        <button
                                                            className="wallet-modal-delete-btn"
                                                            title="Remove wallet"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm(`Remove "${w.name}"? You will need your recovery phrase or private key to restore it.`)) {
                                                                    handleDeleteWallet(w.address);
                                                                }
                                                            }}
                                                        >
                                                            &times;
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="wallet-modal-unlock-target">
                                                <div className="wallet-modal-saved-avatar">{selectedWallet.name.charAt(0).toUpperCase()}</div>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedWallet.name}</div>
                                                    <div className="mono text-muted" style={{ fontSize: '0.75rem' }}>{shortAddr(selectedWallet.address)}</div>
                                                </div>
                                            </div>

                                            <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                                                <label className="form-label">Password</label>
                                                <input
                                                    type="password"
                                                    className="form-input"
                                                    placeholder="Enter your password"
                                                    value={unlockPassword}
                                                    onChange={e => setUnlockPassword(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                                                    autoFocus
                                                />
                                            </div>

                                            {error && <div className="wallet-modal-error">{error}</div>}

                                            <button
                                                className="btn btn-primary w-full"
                                                onClick={handleUnlock}
                                                disabled={loading}
                                            >
                                                {loading ? 'Unlocking...' : 'Unlock'}
                                            </button>

                                            <button
                                                className="wallet-modal-change-wallet"
                                                onClick={() => { setSelectedWallet(null); setError(''); setUnlockPassword(''); }}
                                            >
                                                Choose a different wallet
                                            </button>

                                            <button
                                                className="wallet-modal-forgot"
                                                onClick={() => { setView('reset'); setError(''); setResetPhrase(''); setNewPassword(''); setConfirmNewPassword(''); }}
                                            >
                                                Forgot password? Reset with recovery phrase
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}

                        {/* ── RESET PASSWORD VIEW ── */}
                        {view === 'reset' && selectedWallet && (
                            <>
                                <div className="wallet-modal-header">
                                    <button className="wallet-modal-back" onClick={() => { setView('unlock'); setError(''); }}>&lsaquo;</button>
                                    <h3>Reset Password</h3>
                                    <button className="wallet-modal-close" onClick={closeModal}>&times;</button>
                                </div>
                                <div className="wallet-modal-body">
                                    <div className="wallet-modal-unlock-target">
                                        <div className="wallet-modal-saved-avatar">{selectedWallet.name.charAt(0).toUpperCase()}</div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedWallet.name}</div>
                                            <div className="mono text-muted" style={{ fontSize: '0.75rem' }}>{shortAddr(selectedWallet.address)}</div>
                                        </div>
                                    </div>

                                    <p className="wallet-modal-hint">
                                        Enter your recovery phrase to verify ownership and set a new password.
                                    </p>

                                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <label className="form-label">Recovery Phrase</label>
                                        <textarea
                                            className="form-input mono"
                                            placeholder="Enter your 12 or 24 word recovery phrase"
                                            rows={3}
                                            value={resetPhrase}
                                            onChange={e => setResetPhrase(e.target.value)}
                                            style={{ resize: 'vertical' }}
                                        />
                                    </div>

                                    <div className="wallet-modal-divider-line" />

                                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <label className="form-label">New Password</label>
                                        <input type="password" className="form-input" placeholder="At least 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                                        <label className="form-label">Confirm New Password</label>
                                        <input type="password" className="form-input" placeholder="Re-enter password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} />
                                    </div>

                                    {error && <div className="wallet-modal-error">{error}</div>}

                                    <button className="btn btn-primary w-full" onClick={handleResetPassword} disabled={loading}>
                                        {loading ? 'Resetting...' : 'Reset Password & Connect'}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* ── CREATE VIEW ── */}
                        {view === 'create' && (
                            <>
                                <div className="wallet-modal-header">
                                    <button className="wallet-modal-back" onClick={goBack}>&lsaquo;</button>
                                    <h3>Create New Wallet</h3>
                                    <button className="wallet-modal-close" onClick={closeModal}>&times;</button>
                                </div>
                                <div className="wallet-modal-body">
                                    <p className="wallet-modal-hint">
                                        Set a password to protect your wallet. You will need it to unlock the wallet later.
                                    </p>
                                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <label className="form-label">Wallet Name (optional)</label>
                                        <input type="text" className="form-input" placeholder="My Wallet" value={walletName} onChange={e => setWalletName(e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <label className="form-label">Password</label>
                                        <input type="password" className="form-input" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                                        <label className="form-label">Confirm Password</label>
                                        <input type="password" className="form-input" placeholder="Re-enter password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                                    </div>

                                    {error && <div className="wallet-modal-error">{error}</div>}

                                    <button className="btn btn-primary w-full" onClick={handleCreateWallet} disabled={loading}>
                                        {loading ? 'Creating...' : 'Create Wallet'}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* ── PHRASE SHOW VIEW ── */}
                        {view === 'phrase-show' && createdWallet && (
                            <>
                                <div className="wallet-modal-header">
                                    <h3>Save Your Recovery Phrase</h3>
                                    <button className="wallet-modal-close" onClick={closeModal}>&times;</button>
                                </div>
                                <div className="wallet-modal-body">
                                    <div className="wallet-modal-warning">
                                        <Icon name="shield" size={16} />
                                        <span>Write down your recovery phrase and store it safely. You will not see it again.</span>
                                    </div>

                                    <div className="wallet-modal-phrase-box">
                                        <div className="wallet-modal-phrase-label">Recovery Phrase</div>
                                        <div className="wallet-modal-phrase-words mono">
                                            {createdWallet.mnemonic.split(' ').map((word, i) => (
                                                <span key={i} className="wallet-modal-phrase-word">
                                                    <span className="wallet-modal-phrase-num">{i + 1}</span>
                                                    {word}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="wallet-modal-phrase-addr">
                                        <span className="text-muted">Address:</span>
                                        <span className="mono">{shortAddr(createdWallet.address)}</span>
                                    </div>

                                    <div className="flex gap-sm" style={{ marginTop: 'var(--spacing-md)' }}>
                                        <button className="btn btn-secondary flex-1" onClick={() => {
                                            navigator.clipboard.writeText(createdWallet.mnemonic);
                                            setPhraseCopied(true);
                                            setTimeout(() => setPhraseCopied(false), 2000);
                                        }}>
                                            {phraseCopied ? 'Copied!' : 'Copy Phrase'}
                                        </button>
                                        <button className="btn btn-primary flex-1" onClick={() => {
                                            connectBuiltin({ address: createdWallet.address, privateKey: createdWallet.privateKey, name: createdWallet.name });
                                            closeModal();
                                        }}>
                                            Enter App
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── IMPORT VIEW ── */}
                        {view === 'import' && (
                            <>
                                <div className="wallet-modal-header">
                                    <button className="wallet-modal-back" onClick={goBack}>&lsaquo;</button>
                                    <h3>Import Wallet</h3>
                                    <button className="wallet-modal-close" onClick={closeModal}>&times;</button>
                                </div>
                                <div className="wallet-modal-body">
                                    <div className="wallet-modal-import-tabs">
                                        <button className={`wallet-modal-import-tab ${importTab === 'key' ? 'active' : ''}`} onClick={() => { setImportTab('key'); setError(''); }}>
                                            Private Key
                                        </button>
                                        <button className={`wallet-modal-import-tab ${importTab === 'phrase' ? 'active' : ''}`} onClick={() => { setImportTab('phrase'); setError(''); }}>
                                            Seed Phrase
                                        </button>
                                    </div>

                                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <label className="form-label">Wallet Name (optional)</label>
                                        <input type="text" className="form-input" placeholder="Imported Wallet" value={importName} onChange={e => setImportName(e.target.value)} />
                                    </div>

                                    {importTab === 'key' ? (
                                        <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                            <label className="form-label">Private Key</label>
                                            <input type="password" className="form-input mono" placeholder="0x..." value={importKey} onChange={e => setImportKey(e.target.value)} />
                                        </div>
                                    ) : (
                                        <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                            <label className="form-label">Recovery Phrase (12 or 24 words)</label>
                                            <textarea className="form-input mono" placeholder="word1 word2 word3 ..." rows={3} value={importPhrase} onChange={e => setImportPhrase(e.target.value)} style={{ resize: 'vertical' }} />
                                        </div>
                                    )}

                                    <div className="wallet-modal-divider-line" />

                                    <p className="wallet-modal-hint" style={{ marginBottom: 'var(--spacing-xs)' }}>
                                        Set a password to encrypt this wallet:
                                    </p>
                                    <div className="form-group" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                        <label className="form-label">Password</label>
                                        <input type="password" className="form-input" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                                        <label className="form-label">Confirm Password</label>
                                        <input type="password" className="form-input" placeholder="Re-enter password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                                    </div>

                                    {error && <div className="wallet-modal-error">{error}</div>}

                                    <button className="btn btn-primary w-full" onClick={handleImport} disabled={loading}>
                                        {loading ? 'Importing...' : 'Import & Connect'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Features */}
            <section className="landing-features">
                <div className="landing-feature-card">
                    <div className="landing-feature-icon"><Icon name="deposit" size={32} /></div>
                    <h3>Deposit Collateral</h3>
                    <p>Deposit ETH or WBTC as collateral with competitive LTV ratios and earn supply yield.</p>
                </div>
                <div className="landing-feature-card">
                    <div className="landing-feature-icon"><Icon name="borrow" size={32} /></div>
                    <h3>Borrow USDX</h3>
                    <p>Borrow stablecoins against your crypto collateral instantly at tier-based interest rates.</p>
                </div>
                <div className="landing-feature-card">
                    <div className="landing-feature-icon"><Icon name="exchange" size={32} /></div>
                    <h3>Swap Tokens</h3>
                    <p>Swap between ETH and WBTC on-chain using oracle prices with just 0.3% fee.</p>
                </div>
                <div className="landing-feature-card">
                    <div className="landing-feature-icon"><Icon name="shield" size={32} /></div>
                    <h3>Build Credit</h3>
                    <p>Repay loans on time to upgrade your credit tier and unlock better rates and higher limits.</p>
                </div>
            </section>

            {/* How It Works */}
            <section className="landing-steps">
                <h2 className="landing-section-title">How It Works</h2>
                <div className="landing-steps-grid">
                    <div className="landing-step">
                        <div className="landing-step-number">1</div>
                        <h3>Connect Wallet</h3>
                        <p>Use MetaMask, create a new wallet, or import an existing one.</p>
                    </div>
                    <div className="landing-step-arrow"><Icon name="send" size={24} /></div>
                    <div className="landing-step">
                        <div className="landing-step-number">2</div>
                        <h3>Deposit Assets</h3>
                        <p>Deposit ETH or WBTC as collateral to start building your position.</p>
                    </div>
                    <div className="landing-step-arrow"><Icon name="send" size={24} /></div>
                    <div className="landing-step">
                        <div className="landing-step-number">3</div>
                        <h3>Start Banking</h3>
                        <p>Borrow, swap, send, and manage your DeFi portfolio all in one place.</p>
                    </div>
                </div>
            </section>

            {/* Stats */}
            <section className="landing-stats">
                <div className="landing-stat-item">
                    <div className="landing-stat-value">{userCount || '--'}</div>
                    <div className="landing-stat-label">Protocol Users</div>
                </div>
                <div className="landing-stat-item">
                    <div className="landing-stat-value">3</div>
                    <div className="landing-stat-label">Credit Tiers</div>
                </div>
                <div className="landing-stat-item">
                    <div className="landing-stat-value">0.3%</div>
                    <div className="landing-stat-label">Swap Fee</div>
                </div>
                <div className="landing-stat-item">
                    <div className="landing-stat-value">5-12%</div>
                    <div className="landing-stat-label">APR Range</div>
                </div>
            </section>

            {/* Bottom CTA */}
            <section className="landing-bottom-cta">
                <h2>Ready to start?</h2>
                <p>Connect your wallet and explore the full suite of DeFi banking tools.</p>
                <div className="landing-cta">
                    <button className="landing-connect-btn" onClick={openModal}>
                        <Icon name="wallets" size={20} />
                        Connect Wallet
                    </button>
                </div>
            </section>

            <footer className="landing-footer">
                <span>CryptoCredit Bank</span>
                <span className="text-muted">Decentralized Credit Protocol</span>
            </footer>
        </div>
    );
}
