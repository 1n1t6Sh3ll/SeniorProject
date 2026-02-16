import { useEffect, useState } from 'react';
import { useAccount, useReconnect } from 'wagmi';
import { useWallet } from '../hooks/useWallet';

export default function ConnectionStatus() {
  const { status } = useAccount();
  const { isConnected } = useWallet();
  const { reconnect } = useReconnect();
  const [backendConnected, setBackendConnected] = useState(true);
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    // Monitor backend connection
    const checkBackend = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/health', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        setBackendConnected(response.ok);
      } catch (error) {
        setBackendConnected(false);
        console.warn('Backend health check failed');
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-reconnect wallet if disconnected
  useEffect(() => {
    if (status === 'disconnected') {
      // Small delay to avoid rapid reconnect attempts
      const timeout = setTimeout(() => {
        console.log('Attempting auto-reconnect...');
        reconnect?.();
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [status, reconnect]);

  const statusColor = isConnected && backendConnected ? '#10b981' : '#ef4444';
  const statusText = isConnected ? 'Connected' : 'Disconnected';
  const backendStatus = backendConnected ? '✓' : '✗';

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '8px 12px',
        background: 'var(--surface)',
        border: `2px solid ${statusColor}`,
        borderRadius: 'var(--radius-md)',
        fontSize: '0.75rem',
        fontWeight: '600',
        color: statusColor,
        cursor: 'pointer',
        zIndex: 9999,
        transition: 'all 0.3s ease',
        opacity: showStatus ? 1 : 0.7,
      }}
      onMouseEnter={() => setShowStatus(true)}
      onMouseLeave={() => setShowStatus(false)}
      onClick={() => {
        if (status === 'disconnected') {
          reconnect?.();
        }
      }}
      title={`Wallet: ${statusText} | Backend: ${backendStatus}`}
    >
      <span style={{ marginRight: '6px' }}>●</span>
      {statusText}
      {showStatus && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-sm)',
            marginTop: '4px',
            minWidth: '150px',
            fontSize: '0.7rem',
            color: 'var(--text-secondary)',
          }}
        >
          <div>Wallet: {isConnected ? '✓ Connected' : '✗ Disconnected'}</div>
          <div>Backend: {backendConnected ? '✓ Connected' : '✗ Disconnected'}</div>
          {status === 'disconnected' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                reconnect?.();
              }}
              style={{
                marginTop: '4px',
                padding: '4px 8px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                width: '100%',
                fontSize: '0.7rem',
              }}
            >
              Reconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
