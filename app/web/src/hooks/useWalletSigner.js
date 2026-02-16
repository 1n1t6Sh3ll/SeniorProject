import { useWalletClient } from 'wagmi';
import { useBuiltinWallet } from '../contexts/BuiltinWalletContext';
import { useWallet } from './useWallet';
import { getSigner, getBuiltinSigner } from '../utils/contracts';

export function useWalletSigner() {
  const { data: walletClient } = useWalletClient();
  const builtin = useBuiltinWallet();
  const { isBuiltin, isConnected } = useWallet();

  async function getSignerFn() {
    // 1. Built-in wallet (private key stored in context)
    if (isBuiltin && builtin.privateKey) {
      return getBuiltinSigner(builtin.privateKey);
    }
    // 2. External wallet via wagmi walletClient
    if (walletClient) {
      return getSigner(walletClient);
    }
    // 3. Fallback: window.ethereum directly (handles wagmi walletClient not ready yet)
    if (typeof window !== 'undefined' && window.ethereum) {
      return getSigner();
    }
    throw new Error('No wallet connected. Connect MetaMask or use a built-in wallet from Wallet Manager.');
  }

  return { getSigner: getSignerFn, walletClient, isConnected };
}
