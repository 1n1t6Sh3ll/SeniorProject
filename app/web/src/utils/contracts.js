import { ethers } from 'ethers';
import { getContractAddress } from '../config/contracts';
import CreditProtocolArtifact from '../abis/CreditProtocol.json';
import USDXArtifact from '../abis/USDX.json';
import WBTCArtifact from '../abis/MockWBTC.json';
import PriceOracleArtifact from '../abis/MockPriceOracle.json';
import SimpleSwapArtifact from '../abis/SimpleSwap.json';

const abis = {
    CreditProtocol: CreditProtocolArtifact.abi,
    USDX: USDXArtifact.abi,
    WBTC: WBTCArtifact.abi,
    MockWBTC: WBTCArtifact.abi,
    PriceOracle: PriceOracleArtifact.abi,
    SimpleSwap: SimpleSwapArtifact.abi
};

// Get a read-only provider (for balance checks, position queries)
const RPC_URL = typeof import.meta !== 'undefined' && import.meta.env?.VITE_RPC_URL
    ? import.meta.env.VITE_RPC_URL
    : 'http://127.0.0.1:8545';

export function getReadProvider() {
    return new ethers.JsonRpcProvider(RPC_URL);
}

// Get a signer from a built-in wallet (private key + JSON-RPC provider)
export function getBuiltinSigner(privateKey) {
    const provider = getReadProvider();
    return new ethers.Wallet(privateKey, provider);
}

// Get a signer from the connected wallet (wagmi walletClient → ethers signer)
export async function getSigner(walletClient) {
    if (walletClient) {
        const { account, chain, transport } = walletClient;
        const network = { chainId: chain.id, name: chain.name };
        const provider = new ethers.BrowserProvider(transport, network);
        return provider.getSigner(account.address);
    }
    // Fallback: use window.ethereum directly
    if (!window.ethereum) {
        throw new Error('No wallet found. Please connect your wallet.');
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    return await provider.getSigner();
}

export function getContract(contractName, signerOrProvider, chainId = 31337) {
    const address = getContractAddress(chainId, contractName);
    if (!address) {
        throw new Error(`Contract ${contractName} not found. Make sure contracts are deployed (npm run deploy:local).`);
    }
    if (!abis[contractName]) {
        throw new Error(`ABI not found for ${contractName}`);
    }
    return new ethers.Contract(address, abis[contractName], signerOrProvider);
}

// Parse revert/error reasons into human-readable messages
function parseError(error) {
    const msg = error?.reason || error?.shortMessage || error?.message || 'Unknown error';

    // MetaMask nonce issues (happens after hardhat restart)
    if (msg.includes('nonce') || msg.includes('NONCE') || msg.includes('replacement transaction')) {
        return 'Transaction nonce mismatch. Go to MetaMask → Settings → Advanced → Clear Activity Tab Data, then try again.';
    }
    // User rejected
    if (msg.includes('user rejected') || msg.includes('ACTION_REJECTED') || error?.code === 'ACTION_REJECTED') {
        return 'Transaction cancelled by user.';
    }
    // Network issues
    if (msg.includes('could not detect network') || msg.includes('NETWORK_ERROR') || msg.includes('CONNECTION')) {
        return 'Cannot connect to Hardhat node. Make sure "npx hardhat node" is running.';
    }
    // Contract reverts
    if (msg.includes('Borrow amount exceeds')) return 'Borrow amount exceeds your maximum. Deposit more collateral first.';
    if (msg.includes('Insufficient collateral')) return 'Not enough collateral. Deposit more before borrowing.';
    if (msg.includes('Amount must be > 0')) return 'Amount must be greater than zero.';
    if (msg.includes('Insufficient balance')) return 'Insufficient token balance.';
    if (msg.includes('Withdrawal would make position unsafe')) return 'Cannot withdraw — it would drop your health factor below the safe limit.';
    if (msg.includes('No debt to repay')) return 'You have no outstanding debt to repay.';

    // Execution reverted (generic)
    if (msg.includes('execution reverted') || msg.includes('CALL_EXCEPTION')) {
        const revertMatch = msg.match(/reason="([^"]+)"/);
        if (revertMatch) return revertMatch[1];
        return 'Transaction reverted by the contract. Check your inputs and try again.';
    }

    return msg;
}

export async function getWBTCFromFaucet(signer) {
    try {
        const wbtc = getContract('WBTC', signer);
        const tx = await wbtc.faucet();
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

export async function getWBTCBalance(address, providerOrNull) {
    try {
        const provider = providerOrNull || getReadProvider();
        const wbtc = getContract('WBTC', provider);
        const balance = await wbtc.balanceOf(address);
        return ethers.formatUnits(balance, 8);
    } catch (error) {
        console.error('Error fetching WBTC balance:', error);
        return '0';
    }
}

export async function getUSDXBalance(address, providerOrNull) {
    try {
        const provider = providerOrNull || getReadProvider();
        const usdx = getContract('USDX', provider);
        const balance = await usdx.balanceOf(address);
        return ethers.formatEther(balance);
    } catch (error) {
        console.error('Error fetching USDX balance:', error);
        return '0';
    }
}

export async function depositETH(amount, signer) {
    try {
        const creditProtocol = getContract('CreditProtocol', signer);
        const tx = await creditProtocol.depositETH({ value: ethers.parseEther(amount.toString()) });
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

export async function depositWBTC(amount, signer) {
    try {
        const wbtc = getContract('WBTC', signer);
        const creditProtocol = getContract('CreditProtocol', signer);
        const creditProtocolAddress = getContractAddress(31337, 'CreditProtocol');

        const amountWei = ethers.parseUnits(amount.toString(), 8);

        // Check and set allowance
        const signerAddr = await signer.getAddress();
        const allowance = await wbtc.allowance(signerAddr, creditProtocolAddress);
        if (allowance < amountWei) {
            const approveTx = await wbtc.approve(creditProtocolAddress, ethers.MaxUint256);
            await approveTx.wait();
        }

        const tx = await creditProtocol.depositWBTC(amountWei);
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

export async function borrowUSDX(amount, signer) {
    try {
        const creditProtocol = getContract('CreditProtocol', signer);
        const tx = await creditProtocol.borrow(ethers.parseEther(amount.toString()));
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

export async function repayUSDX(amount, signer) {
    try {
        const usdx = getContract('USDX', signer);
        const creditProtocol = getContract('CreditProtocol', signer);
        const creditProtocolAddress = getContractAddress(31337, 'CreditProtocol');

        const amountWei = ethers.parseEther(amount.toString());

        // Check and set allowance
        const signerAddr = await signer.getAddress();
        const allowance = await usdx.allowance(signerAddr, creditProtocolAddress);
        if (allowance < amountWei) {
            const approveTx = await usdx.approve(creditProtocolAddress, ethers.MaxUint256);
            await approveTx.wait();
        }

        const tx = await creditProtocol.repay(amountWei);
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

export async function getUserPosition(address, providerOrNull) {
    try {
        const provider = providerOrNull || getReadProvider();
        const creditProtocol = getContract('CreditProtocol', provider);
        const position = await creditProtocol.getUserPosition(address);

        return {
            ethCollateral: position[0],
            wbtcCollateral: position[1],
            debtAmount: position[2],
            creditTier: Number(position[3]),
            successfulRepayments: Number(position[4]),
            healthFactor: position[5],
            maxBorrow: position[6]
        };
    } catch (error) {
        console.error('Error fetching position:', error);
        return null;
    }
}

export async function withdrawETH(amount, signer) {
    try {
        const creditProtocol = getContract('CreditProtocol', signer);
        const tx = await creditProtocol.withdrawETH(ethers.parseEther(amount.toString()));
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

export async function withdrawWBTC(amount, signer) {
    try {
        const creditProtocol = getContract('CreditProtocol', signer);
        const amountWei = ethers.parseUnits(amount.toString(), 8);
        const tx = await creditProtocol.withdrawWBTC(amountWei);
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

// Fetch real prices from the on-chain oracle
export async function getOraclePrices(providerOrNull) {
    try {
        const provider = providerOrNull || getReadProvider();
        const oracle = getContract('PriceOracle', provider);
        const wbtcAddress = getContractAddress(31337, 'WBTC');

        // ETH price: oracle uses address(0) for ETH or we get it from the protocol
        // WBTC price: oracle.getLatestPrice(wbtcAddress)
        const wbtcPrice = await oracle.getLatestPrice(wbtcAddress);
        // ETH price: the oracle stores ETH at the zero address
        let ethPrice;
        try {
            ethPrice = await oracle.getLatestPrice(ethers.ZeroAddress);
        } catch {
            ethPrice = BigInt(2000 * 10 ** 8); // fallback $2000
        }

        return {
            ethPrice: Number(ethPrice) / 10 ** 8,
            wbtcPrice: Number(wbtcPrice) / 10 ** 8,
        };
    } catch (error) {
        console.error('Error fetching oracle prices:', error);
        return { ethPrice: 2000, wbtcPrice: 40000 }; // fallback
    }
}

// Liquidate an undercollateralized position
export async function liquidatePosition(targetAddress, signer) {
    try {
        const creditProtocol = getContract('CreditProtocol', signer);
        const tx = await creditProtocol.liquidate(targetAddress);
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

// Get protocol-level constants
export async function getProtocolConstants(providerOrNull) {
    try {
        const provider = providerOrNull || getReadProvider();
        const creditProtocol = getContract('CreditProtocol', provider);
        const [minHF, liqBonus] = await Promise.all([
            creditProtocol.MIN_HEALTH_FACTOR(),
            creditProtocol.LIQUIDATION_BONUS(),
        ]);
        return {
            minHealthFactor: parseFloat(ethers.formatEther(minHF)),
            liquidationBonus: Number(liqBonus) / 100, // basis points to percentage
        };
    } catch (error) {
        console.error('Error fetching protocol constants:', error);
        return { minHealthFactor: 1.0, liquidationBonus: 5 };
    }
}

// Scan protocol events to discover all unique user addresses
export async function discoverAllUsers(providerOrNull) {
    try {
        const provider = providerOrNull || getReadProvider();
        const creditProtocol = getContract('CreditProtocol', provider);

        const currentBlock = await provider.getBlockNumber();
        const fromBlock = 0;

        const [depositEvents, borrowEvents] = await Promise.all([
            creditProtocol.queryFilter(creditProtocol.filters.CollateralDeposited(), fromBlock, currentBlock),
            creditProtocol.queryFilter(creditProtocol.filters.Borrowed(), fromBlock, currentBlock),
        ]);

        const users = new Set();
        for (const event of depositEvents) {
            if (event.args && event.args.user) users.add(event.args.user);
        }
        for (const event of borrowEvents) {
            if (event.args && event.args.user) users.add(event.args.user);
        }

        return Array.from(users);
    } catch (error) {
        console.error('Error discovering users:', error);
        return [];
    }
}

// ===== SimpleSwap Functions =====

export async function swapETHForWBTC(ethAmount, signer) {
    try {
        const swap = getContract('SimpleSwap', signer);
        const tx = await swap.swapETHForWBTC({ value: ethers.parseEther(ethAmount.toString()) });
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

export async function swapWBTCForETH(wbtcAmount, signer) {
    try {
        const wbtc = getContract('WBTC', signer);
        const swap = getContract('SimpleSwap', signer);
        const swapAddress = getContractAddress(31337, 'SimpleSwap');

        const amountWei = ethers.parseUnits(wbtcAmount.toString(), 8);

        // Check and set allowance
        const signerAddr = await signer.getAddress();
        const allowance = await wbtc.allowance(signerAddr, swapAddress);
        if (allowance < amountWei) {
            const approveTx = await wbtc.approve(swapAddress, ethers.MaxUint256);
            await approveTx.wait();
        }

        const tx = await swap.swapWBTCForETH(amountWei);
        await tx.wait();
        return tx;
    } catch (error) {
        throw new Error(parseError(error));
    }
}

export async function getSwapQuote(fromAsset, toAsset, amount, providerOrNull) {
    try {
        const provider = providerOrNull || getReadProvider();
        const swap = getContract('SimpleSwap', provider);
        const wbtcAddress = getContractAddress(31337, 'WBTC');

        const fromToken = fromAsset === 'ETH' ? ethers.ZeroAddress : wbtcAddress;
        const toToken = toAsset === 'ETH' ? ethers.ZeroAddress : wbtcAddress;

        const amountIn = fromAsset === 'ETH'
            ? ethers.parseEther(amount.toString())
            : ethers.parseUnits(amount.toString(), 8);

        const amountOut = await swap.getQuote(fromToken, toToken, amountIn);

        // Format output based on toAsset
        return toAsset === 'ETH'
            ? ethers.formatEther(amountOut)
            : ethers.formatUnits(amountOut, 8);
    } catch (error) {
        console.error('Error getting swap quote:', error);
        return '0';
    }
}

export async function getSwapPoolReserves(providerOrNull) {
    try {
        const provider = providerOrNull || getReadProvider();
        const swap = getContract('SimpleSwap', provider);
        const [ethReserve, wbtcReserve] = await swap.getReserves();
        return {
            ethReserve: ethers.formatEther(ethReserve),
            wbtcReserve: ethers.formatUnits(wbtcReserve, 8),
        };
    } catch (error) {
        console.error('Error fetching pool reserves:', error);
        return { ethReserve: '0', wbtcReserve: '0' };
    }
}

export async function getTransactionHistory(address, providerOrNull) {
    try {
        const provider = providerOrNull || getReadProvider();
        const creditProtocol = getContract('CreditProtocol', provider);

        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 10000);

        const events = [];

        const [depositEvents, borrowEvents, repayEvents, withdrawEvents, tierEvents] = await Promise.all([
            creditProtocol.queryFilter(creditProtocol.filters.CollateralDeposited(address), fromBlock, currentBlock),
            creditProtocol.queryFilter(creditProtocol.filters.Borrowed(address), fromBlock, currentBlock),
            creditProtocol.queryFilter(creditProtocol.filters.Repaid(address), fromBlock, currentBlock),
            creditProtocol.queryFilter(creditProtocol.filters.CollateralWithdrawn(address), fromBlock, currentBlock),
            creditProtocol.queryFilter(creditProtocol.filters.TierUpgraded(address), fromBlock, currentBlock),
        ]);

        for (const event of depositEvents) {
            const block = await event.getBlock();
            events.push({
                type: 'CollateralDeposited',
                asset: event.args.asset === ethers.ZeroAddress ? 'ETH' : 'WBTC',
                amount: event.args.asset === ethers.ZeroAddress
                    ? ethers.formatEther(event.args.amount)
                    : ethers.formatUnits(event.args.amount, 8),
                timestamp: block.timestamp,
                txHash: event.transactionHash,
                blockNumber: event.blockNumber
            });
        }

        for (const event of borrowEvents) {
            const block = await event.getBlock();
            events.push({
                type: 'Borrowed', asset: 'USDX',
                amount: ethers.formatEther(event.args.amount),
                timestamp: block.timestamp, txHash: event.transactionHash, blockNumber: event.blockNumber
            });
        }

        for (const event of repayEvents) {
            const block = await event.getBlock();
            events.push({
                type: 'Repaid', asset: 'USDX',
                amount: ethers.formatEther(event.args.amount),
                timestamp: block.timestamp, txHash: event.transactionHash, blockNumber: event.blockNumber
            });
        }

        for (const event of withdrawEvents) {
            const block = await event.getBlock();
            events.push({
                type: 'CollateralWithdrawn',
                asset: event.args.asset === ethers.ZeroAddress ? 'ETH' : 'WBTC',
                amount: event.args.asset === ethers.ZeroAddress
                    ? ethers.formatEther(event.args.amount)
                    : ethers.formatUnits(event.args.amount, 8),
                timestamp: block.timestamp, txHash: event.transactionHash, blockNumber: event.blockNumber
            });
        }

        for (const event of tierEvents) {
            const block = await event.getBlock();
            events.push({
                type: 'TierUpgraded', asset: `Tier ${event.args.newTier}`, amount: '',
                timestamp: block.timestamp, txHash: event.transactionHash, blockNumber: event.blockNumber
            });
        }

        events.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
        return events;
    } catch (error) {
        console.error('Error fetching transaction history:', error);
        return [];
    }
}
