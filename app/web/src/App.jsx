import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { BuiltinWalletProvider } from './contexts/BuiltinWalletContext';
import { useWallet } from './hooks/useWallet';
import { sepolia } from 'wagmi/chains';
import { defineChain, http } from 'viem';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import Deposit from './pages/Deposit';
import Borrow from './pages/Borrow';
import Repay from './pages/Repay';
import Withdraw from './pages/Withdraw';
import Send from './pages/Send';
import Portfolio from './pages/Portfolio';
import WalletManager from './pages/WalletManager';
import Market from './pages/Market';
import Analytics from './pages/Analytics';
import Liquidation from './pages/Liquidation';
import Simulator from './pages/Simulator';
import Exchange from './pages/Exchange';
import Statements from './pages/Statements';
import Explorer from './pages/Explorer';
import Marketplace from './pages/Marketplace';
import LandingPage from './pages/LandingPage';
import AccountSidebar from './components/AccountSidebar';
import WalletBar from './components/WalletBar';
import HealthAlert from './components/HealthAlert';
import NetworkStatus from './components/NetworkStatus';
import SetupGuide from './components/SetupGuide';
import GlossaryPanel from './components/GlossaryPanel';
import { ToastProvider } from './components/Toast';
import './App.css';

const rpcUrl = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545';

const localhost = defineChain({
  id: 31337,
  name: 'Localhost',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  testnet: true,
});

const config = getDefaultConfig({
  appName: 'CryptoCredit Bank',
  projectId: 'c0f3f83b92849d889a6b996f1f4c4fdc',
  chains: [localhost, sepolia],
  ssr: false,
  transports: {
    [localhost.id]: http(rpcUrl),
    [sepolia.id]: http(),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5000,
      gcTime: 30000,
    },
  },
});

const customTheme = darkTheme({
  accentColor: '#00d4aa',
  accentColorForeground: '#0a0e14',
  borderRadius: 'small',
  overlayBlur: 'none',
});

function AppContent() {
  const { isConnected } = useWallet();

  if (!isConnected) {
    return <LandingPage />;
  }

  return (
    <>
      <WalletBar />
      <div className="app-layout">
        <AccountSidebar />
        <div className="main-content">
          <HealthAlert />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/deposit" element={<Deposit />} />
            <Route path="/borrow" element={<Borrow />} />
            <Route path="/repay" element={<Repay />} />
            <Route path="/withdraw" element={<Withdraw />} />
            <Route path="/send" element={<Send />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/wallets" element={<WalletManager />} />
            <Route path="/market" element={<Market />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/liquidation" element={<Liquidation />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/exchange" element={<Exchange />} />
            <Route path="/statements" element={<Statements />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/marketplace" element={<Marketplace />} />
          </Routes>
        </div>
      </div>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={customTheme}>
            <BuiltinWalletProvider>
              <ToastProvider>
                <Router>
                  <NetworkStatus />
                  <SetupGuide />
                  <GlossaryPanel />
                  <AppContent />
                </Router>
              </ToastProvider>
            </BuiltinWalletProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
}

export default App;
