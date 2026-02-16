import { useState, useCallback, useEffect } from 'react';
import { useWallet } from './useWallet';
import { connectionManager } from '../utils/connectionManager';

export function useContractConnection() {
  const { isConnected, address } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isConnected) {
      setError('Wallet not connected');
    } else {
      setError(null);
    }
  }, [isConnected]);

  const executeTransaction = useCallback(
    async (txFn, onSuccess, onError) => {
      if (!isConnected || !address) {
        setError('Please connect your wallet first');
        onError?.('Wallet not connected');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await connectionManager.retryWithExponentialBackoff(txFn);
        
        if (result.hash || result.transactionHash) {
          const provider = await connectionManager.getProvider();
          const txHash = result.hash || result.transactionHash;
          await connectionManager.waitForTransaction(txHash, provider);
        }

        onSuccess?.(result);
        return result;
      } catch (err) {
        const errorMsg = err.message || 'Transaction failed';
        setError(errorMsg);
        onError?.(errorMsg);
        console.error('Transaction error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected, address]
  );

  const fetchWithRetry = useCallback(async (fetchFn) => {
    return connectionManager.retryWithExponentialBackoff(fetchFn);
  }, []);

  return {
    isLoading,
    error,
    executeTransaction,
    fetchWithRetry,
    isConnected,
    address,
  };
}
