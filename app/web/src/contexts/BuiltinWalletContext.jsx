import { createContext, useContext, useState, useEffect } from 'react';

const BuiltinWalletContext = createContext(null);

const STORAGE_KEY = 'cryptocredit_active_builtin';

// Default: Hardhat Account #0 (pre-funded with 10,000 ETH)
const DEFAULT_WALLET = {
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  name: 'Account #0',
};

export function BuiltinWalletProvider({ children }) {
  const [wallet, setWallet] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    // Auto-connect default test account on first load
    return DEFAULT_WALLET;
  });

  const isBuiltinConnected = !!wallet;

  const connectBuiltin = (w) => {
    const data = { address: w.address, privateKey: w.privateKey, name: w.name || 'Built-in Wallet' };
    setWallet(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const disconnectBuiltin = () => {
    setWallet(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <BuiltinWalletContext.Provider value={{
      address: wallet?.address || null,
      privateKey: wallet?.privateKey || null,
      name: wallet?.name || null,
      isBuiltinConnected,
      connectBuiltin,
      disconnectBuiltin,
    }}>
      {children}
    </BuiltinWalletContext.Provider>
  );
}

export function useBuiltinWallet() {
  const ctx = useContext(BuiltinWalletContext);
  if (!ctx) throw new Error('useBuiltinWallet must be used within BuiltinWalletProvider');
  return ctx;
}
