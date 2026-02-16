import { useState, useEffect } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';
import { useWallet } from '../hooks/useWallet';

const EXPECTED_CHAIN_ID = 31337;

export default function NetworkStatus() {
    const { isConnected, isBuiltin } = useWallet();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const [providerDown, setProviderDown] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!isConnected) {
            setProviderDown(false);
            setDismissed(false);
            return;
        }

        const checkProvider = async () => {
            try {
                const response = await fetch('http://127.0.0.1:8545', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
                });
                setProviderDown(!response.ok);
            } catch {
                setProviderDown(true);
            }
        };

        checkProvider();
        const interval = setInterval(checkProvider, 30000);
        return () => clearInterval(interval);
    }, [isConnected]);

    if (!isConnected || dismissed) return null;

    const wrongChain = !isBuiltin && chainId !== EXPECTED_CHAIN_ID;

    if (!wrongChain && !providerDown) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10000,
            padding: '10px 20px',
            background: providerDown ? '#f85149' : '#f0a500',
            color: providerDown ? '#fff' : '#0a0e14',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            flexWrap: 'wrap',
        }}>
            {providerDown ? (
                <span>Hardhat node is not running. Start it with: <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: '4px' }}>npx hardhat node</code></span>
            ) : wrongChain ? (
                <span>Wrong network (Chain ID: {chainId}). Switch to Localhost (31337).</span>
            ) : null}
            {wrongChain && !providerDown && switchChain && (
                <button
                    onClick={() => switchChain({ chainId: EXPECTED_CHAIN_ID })}
                    style={{
                        background: 'rgba(0,0,0,0.15)',
                        border: '1px solid rgba(0,0,0,0.3)',
                        color: 'inherit',
                        padding: '4px 14px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                    }}
                >
                    Switch Network
                </button>
            )}
            <button
                onClick={() => setDismissed(true)}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    padding: '0 4px',
                    lineHeight: 1,
                    opacity: 0.7,
                }}
                title="Dismiss"
            >
                &times;
            </button>
        </div>
    );
}
