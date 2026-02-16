import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Link } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';

export default function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <span className="logo-icon">CC</span>
          <span>CryptoCredit</span>
        </Link>
        <div className="flex items-center gap-md">
          <NotificationCenter />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
