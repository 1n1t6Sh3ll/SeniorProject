// Connection manager for stable Web3 interactions
import { ethers } from 'ethers';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms
const TIMEOUT = 15000; // ms

export class ConnectionManager {
  constructor() {
    this.provider = null;
    this.retryCount = 0;
  }

  async getProvider() {
    if (!window.ethereum) {
      throw new Error('MetaMask or Web3 wallet not found');
    }

    if (this.provider) {
      return this.provider;
    }

    try {
      this.provider = new ethers.BrowserProvider(window.ethereum);
      return this.provider;
    } catch (error) {
      console.error('Failed to create provider:', error);
      throw error;
    }
  }

  async getSigner() {
    const provider = await this.getProvider();
    return await provider.getSigner();
  }

  async retryWithExponentialBackoff(fn, context = null) {
    let lastError;

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        return await Promise.race([
          fn.call(context),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), TIMEOUT)
          ),
        ]);
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${i + 1}/${MAX_RETRIES} failed:`, error.message);

        if (i < MAX_RETRIES - 1) {
          const delay = RETRY_DELAY * Math.pow(2, i);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
  }

  async executeWithRetry(contractFn, args = []) {
    return this.retryWithExponentialBackoff(async () => {
      return await contractFn(...args);
    });
  }

  async waitForTransaction(txHash, provider) {
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts = 30 seconds at 1s interval

    while (attempts < maxAttempts) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          if (receipt.status === 1) {
            return receipt;
          } else {
            throw new Error('Transaction failed');
          }
        }
      } catch (error) {
        console.error('Error checking transaction:', error);
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Transaction confirmation timeout');
  }

  reset() {
    this.provider = null;
    this.retryCount = 0;
  }
}

export const connectionManager = new ConnectionManager();
