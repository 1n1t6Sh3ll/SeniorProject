import { useAccount } from 'wagmi';
import { useBuiltinWallet } from '../contexts/BuiltinWalletContext';

export function useWallet() {
  const wagmi = useAccount();
  const builtin = useBuiltinWallet();

  // External wallet takes priority if connected
  if (wagmi.isConnected) {
    return { address: wagmi.address, isConnected: true, isBuiltin: false };
  }
  if (builtin.isBuiltinConnected) {
    return { address: builtin.address, isConnected: true, isBuiltin: true };
  }
  return { address: null, isConnected: false, isBuiltin: false };
}
