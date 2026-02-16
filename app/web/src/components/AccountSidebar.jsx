import { useState } from 'react';
import { useDisconnect } from 'wagmi';
import { useLocation, Link } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useBuiltinWallet } from '../contexts/BuiltinWalletContext';
import Wallet from './Wallet';
import Icon from './Icon';

export default function AccountSidebar() {
  const { address, isConnected, isBuiltin } = useWallet();
  const { disconnectBuiltin } = useBuiltinWallet();
  const { disconnect } = useDisconnect();
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/portfolio', label: 'Portfolio', icon: 'portfolio' },
    { path: '/deposit', label: 'Deposit', icon: 'deposit' },
    { path: '/borrow', label: 'Borrow', icon: 'borrow' },
    { path: '/repay', label: 'Repay', icon: 'repay' },
    { path: '/withdraw', label: 'Withdraw', icon: 'withdraw' },
    { path: '/exchange', label: 'Exchange', icon: 'exchange' },
    { path: '/liquidation', label: 'Liquidation', icon: 'liquidation' },
    { path: '/send', label: 'Send', icon: 'send' },
    { path: '/marketplace', label: 'Marketplace', icon: 'shop' },
    { path: '/wallets', label: 'Wallet Management', icon: 'wallets' },
    { path: '/market', label: 'Market', icon: 'market' },
    { path: '/analytics', label: 'Analytics', icon: 'analytics' },
    { path: '/simulator', label: 'Simulator', icon: 'simulator' },
    { path: '/statements', label: 'Statements', icon: 'statements' },
    { path: '/explorer', label: 'Explorer', icon: 'explorer' },
  ];

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/' || location.pathname === '/dashboard';
    return location.pathname === path;
  };

  return (
    <>
      <button
        className={`sidebar-toggle ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle sidebar"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {isOpen && (
        <div
          className="sidebar-overlay"
          style={{ display: 'block' }}
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`account-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <Link to="/" className="sidebar-title" onClick={() => setIsOpen(false)}>
            CryptoCredit
          </Link>
          <button
            className="sidebar-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close sidebar"
          >
            &times;
          </button>
        </div>

        {isConnected && (
          <div className="sidebar-section wallet-section">
            <Wallet />
          </div>
        )}

        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">Banking</div>
          {navItems.slice(0, 10).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => setIsOpen(false)}
            >
              <span className="nav-icon"><Icon name={item.icon} size={16} /></span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}

          <div className="sidebar-nav-label" style={{ marginTop: 'var(--spacing-sm)' }}>Tools</div>
          {navItems.slice(10).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => setIsOpen(false)}
            >
              <span className="nav-icon"><Icon name={item.icon} size={16} /></span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        {isConnected && (
          <div className="sidebar-footer">
            <div className="account-info">
              <div className="account-icon"><Icon name="user" size={16} /></div>
              <div>
                <div className="account-label">Account</div>
                <div className="account-address">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}
                </div>
              </div>
            </div>
            <button
              className="disconnect-btn"
              onClick={() => { isBuiltin ? disconnectBuiltin() : disconnect(); setIsOpen(false); }}
            >
              Disconnect{isBuiltin ? ' (Built-in)' : ' Wallet'}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
