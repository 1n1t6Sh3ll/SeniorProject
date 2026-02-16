import { useState, useEffect } from 'react';
import { useChainId } from 'wagmi';
import { useWallet } from '../hooks/useWallet';

export default function SetupGuide() {
    const { isConnected } = useWallet();
    const chainId = useChainId();
    const [show, setShow] = useState(false);
    const [nodeOk, setNodeOk] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        // Show guide if not connected or on wrong chain
        if (!isConnected) {
            setShow(true);
        } else if (chainId !== 31337) {
            setShow(true);
        } else {
            setShow(false);
        }
    }, [isConnected, chainId]);

    useEffect(() => {
        checkNode();
    }, []);

    const checkNode = async () => {
        try {
            const res = await fetch('http://127.0.0.1:8545', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
            });
            const data = await res.json();
            setNodeOk(data.result !== undefined);
        } catch {
            setNodeOk(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    if (!show) return null;

    const steps = [
        {
            title: 'Start Hardhat Node',
            done: nodeOk,
            content: (
                <div>
                    <p className="text-sm text-muted mb-sm">Run this command in the project root:</p>
                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: 'var(--spacing-md)',
                        borderRadius: 'var(--radius-md)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <code>npm start</code>
                        <button onClick={() => copyToClipboard('npm start')} style={{
                            background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem'
                        }}>Copy</button>
                    </div>
                    <p className="text-xs text-muted mt-sm">This starts the blockchain, deploys contracts, and opens the frontend.</p>
                </div>
            ),
        },
        {
            title: 'Add Localhost Network to MetaMask',
            done: isConnected && chainId === 31337,
            content: (
                <div>
                    <p className="text-sm text-muted mb-sm">Add a custom network in MetaMask:</p>
                    <div className="flex flex-col gap-sm" style={{ fontSize: '0.85rem' }}>
                        {[
                            ['Network Name', 'Localhost 8545'],
                            ['RPC URL', 'http://127.0.0.1:8545'],
                            ['Chain ID', '31337'],
                            ['Currency', 'ETH'],
                        ].map(([label, value]) => (
                            <div key={label} className="flex justify-between items-center" style={{
                                padding: '6px 10px',
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: 'var(--radius-sm)',
                            }}>
                                <span className="text-muted">{label}</span>
                                <div className="flex items-center gap-sm">
                                    <span className="mono">{value}</span>
                                    <button onClick={() => copyToClipboard(value)} style={{
                                        background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem'
                                    }}>Copy</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            title: 'Import Test Account',
            done: false,
            content: (
                <div>
                    <p className="text-sm text-muted mb-sm">Import this private key in MetaMask (10,000 ETH):</p>
                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: 'var(--spacing-md)',
                        borderRadius: 'var(--radius-md)',
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        wordBreak: 'break-all',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)',
                    }}>
                        <code>0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80</code>
                        <button onClick={() => copyToClipboard('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')} style={{
                            background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0
                        }}>Copy</button>
                    </div>
                    <p className="text-xs text-muted mt-sm">Go to MetaMask {'>'} Account {'>'} Import Account {'>'} Paste the key above.</p>
                </div>
            ),
        },
        {
            title: 'Clear MetaMask Cache (If Txns Fail)',
            done: false,
            content: (
                <div>
                    <p className="text-sm text-muted mb-sm">If transactions fail after restarting the node:</p>
                    <ol style={{ margin: '0 0 0 16px', lineHeight: 2, fontSize: '0.85rem' }}>
                        <li>Open MetaMask Settings</li>
                        <li>Go to <strong>Advanced</strong></li>
                        <li>Click <strong>"Clear Activity Tab Data"</strong></li>
                        <li>Retry your transaction</li>
                    </ol>
                </div>
            ),
        },
    ];

    return (
        <div style={{
            position: 'fixed',
            bottom: 'var(--spacing-lg)',
            right: 'var(--spacing-lg)',
            width: '380px',
            maxHeight: '80vh',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            zIndex: 1000,
            overflow: 'auto',
        }}>
            <div style={{
                padding: 'var(--spacing-lg)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div>
                    <div className="font-bold" style={{ fontSize: '1rem' }}>Setup Guide</div>
                    <div className="text-xs text-muted">Get started with CryptoCredit</div>
                </div>
                <button onClick={() => setShow(false)} style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem'
                }}>&times;</button>
            </div>

            <div style={{ padding: 'var(--spacing-md)' }}>
                {steps.map((s, i) => (
                    <div key={i} style={{
                        padding: 'var(--spacing-md)',
                        marginBottom: 'var(--spacing-sm)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border)',
                        background: step === i ? 'rgba(0,212,170,0.04)' : 'transparent',
                        cursor: 'pointer',
                    }} onClick={() => setStep(step === i ? -1 : i)}>
                        <div className="flex items-center gap-sm">
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%',
                                background: s.done ? 'var(--success)' : 'var(--border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.75rem', color: '#fff', fontWeight: 700, flexShrink: 0,
                            }}>
                                {s.done ? '\u2713' : i + 1}
                            </div>
                            <span className="font-bold text-sm">{s.title}</span>
                        </div>
                        {step === i && <div style={{ marginTop: 'var(--spacing-md)' }}>{s.content}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
}
