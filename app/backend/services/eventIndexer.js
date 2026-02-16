const { ethers } = require('ethers');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

class EventIndexer {
    constructor() {
        this.provider = null;
        this.creditProtocol = null;
        this.isRunning = false;
        this.lastProcessedBlock = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
    }

    async initialize(attempt = 1) {
        try {
            // Load deployment info
            const deploymentPath = path.join(__dirname, '../../deployments/localhost.json');
            if (!fs.existsSync(deploymentPath)) {
                console.warn('⚠️  No deployment found. Event indexer will not start.');
                return false;
            }

            const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

            // Connect to blockchain
            const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
            this.provider = new ethers.JsonRpcProvider(rpcUrl);

            // Test connection with timeout
            const blockNumber = await Promise.race([
                this.provider.getBlockNumber(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Provider connection timeout')), 10000)
                )
            ]);

            // Load contract
            const creditProtocolABI = require('../../artifacts/contracts/CreditProtocol.sol/CreditProtocol.json').abi;
            this.creditProtocol = new ethers.Contract(
                deployment.contracts.CreditProtocol,
                creditProtocolABI,
                this.provider
            );

            this.lastProcessedBlock = blockNumber;
            this.reconnectAttempts = 0;

            console.log('✅ Event indexer initialized');
            console.log(`📦 Starting from block: ${blockNumber}`);

            return true;
        } catch (error) {
            console.error(`❌ Event indexer initialization failed (attempt ${attempt}):`, error.message);
            
            if (attempt < this.maxReconnectAttempts) {
                console.log(`🔄 Retrying in ${this.reconnectDelay}ms...`);
                setTimeout(() => this.initialize(attempt + 1), this.reconnectDelay);
                return false;
            } else {
                console.error('❌ Failed to initialize event indexer after max attempts');
                return false;
            }
        }
    }

    async start() {
        if (this.isRunning) {
            console.log('Event indexer already running');
            return;
        }

        const initialized = await this.initialize();
        if (!initialized) {
            console.log('⏳ Retrying initialization...');
            setTimeout(() => this.start(), 10000);
            return;
        }

        this.isRunning = true;
        console.log('🚀 Event indexer started');

        // Set up event listeners
        this.setupEventListeners();

        // Set up error handler for provider
        this.provider.on('error', (error) => {
            console.error('Provider error:', error.message);
            this.handleProviderError();
        });

        // Poll for missed events every 15 seconds
        this.pollInterval = setInterval(() => {
            this.processMissedEvents().catch((error) => {
                console.error('Error in processMissedEvents:', error);
            });
        }, 15000);

        // Health check every 30 seconds
        this.healthCheckInterval = setInterval(() => {
            this.checkHealth();
        }, 30000);
    }

    async checkHealth() {
        try {
            await this.provider.getBlockNumber();
        } catch (error) {
            console.error('Provider health check failed:', error.message);
            this.handleProviderError();
        }
    }

    async handleProviderError() {
        if (this.isRunning) {
            console.log('🔄 Event indexer reconnecting...');
            this.stop();
            setTimeout(() => this.start(), 5000);
        }
    }

    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.provider) {
            this.provider.removeAllListeners();
        }
        this.isRunning = false;
        console.log('🛑 Event indexer stopped');
    }

    setupEventListeners() {
        // CollateralDeposited event
        this.creditProtocol.on('CollateralDeposited', async (user, asset, amount, event) => {
            await this.handleCollateralDeposited(user, asset, amount, event);
        });

        // Borrowed event
        this.creditProtocol.on('Borrowed', async (user, amount, healthFactor, event) => {
            await this.handleBorrowed(user, amount, healthFactor, event);
        });

        // Repaid event
        this.creditProtocol.on('Repaid', async (user, amount, newTier, event) => {
            await this.handleRepaid(user, amount, newTier, event);
        });

        // CollateralWithdrawn event
        this.creditProtocol.on('CollateralWithdrawn', async (user, asset, amount, event) => {
            await this.handleCollateralWithdrawn(user, asset, amount, event);
        });

        // TierUpgraded event
        this.creditProtocol.on('TierUpgraded', async (user, newTier, event) => {
            await this.handleTierUpgraded(user, newTier, event);
        });

        console.log('👂 Listening for protocol events...');
    }

    async handleCollateralDeposited(user, asset, amount, event) {
        try {
            const block = await event.getBlock();

            await Transaction.create({
                txHash: event.log.transactionHash,
                blockNumber: event.log.blockNumber,
                timestamp: new Date(block.timestamp * 1000),
                userAddress: user.toLowerCase(),
                eventType: 'CollateralDeposited',
                asset: asset,
                amount: amount.toString(),
                eventData: {
                    user,
                    asset,
                    amount: amount.toString()
                }
            });

            // Update user stats
            await this.updateUserStats(user);

            console.log(`📥 Collateral deposited: ${user} - ${ethers.formatEther(amount)}`);
        } catch (error) {
            console.error('Error handling CollateralDeposited:', error);
        }
    }

    async handleBorrowed(user, amount, healthFactor, event) {
        try {
            const block = await event.getBlock();

            await Transaction.create({
                txHash: event.log.transactionHash,
                blockNumber: event.log.blockNumber,
                timestamp: new Date(block.timestamp * 1000),
                userAddress: user.toLowerCase(),
                eventType: 'Borrowed',
                amount: amount.toString(),
                healthFactor: healthFactor.toString(),
                eventData: {
                    user,
                    amount: amount.toString(),
                    healthFactor: healthFactor.toString()
                }
            });

            await this.updateUserStats(user);

            console.log(`💵 Borrowed: ${user} - ${ethers.formatEther(amount)} USDX`);
        } catch (error) {
            console.error('Error handling Borrowed:', error);
        }
    }

    async handleRepaid(user, amount, newTier, event) {
        try {
            const block = await event.getBlock();

            await Transaction.create({
                txHash: event.log.transactionHash,
                blockNumber: event.log.blockNumber,
                timestamp: new Date(block.timestamp * 1000),
                userAddress: user.toLowerCase(),
                eventType: 'Repaid',
                amount: amount.toString(),
                newTier: Number(newTier),
                eventData: {
                    user,
                    amount: amount.toString(),
                    newTier: Number(newTier)
                }
            });

            await this.updateUserStats(user);

            console.log(`✅ Repaid: ${user} - ${ethers.formatEther(amount)} USDX`);
        } catch (error) {
            console.error('Error handling Repaid:', error);
        }
    }

    async handleCollateralWithdrawn(user, asset, amount, event) {
        try {
            const block = await event.getBlock();

            await Transaction.create({
                txHash: event.log.transactionHash,
                blockNumber: event.log.blockNumber,
                timestamp: new Date(block.timestamp * 1000),
                userAddress: user.toLowerCase(),
                eventType: 'CollateralWithdrawn',
                asset: asset,
                amount: amount.toString(),
                eventData: {
                    user,
                    asset,
                    amount: amount.toString()
                }
            });

            await this.updateUserStats(user);

            console.log(`📤 Collateral withdrawn: ${user} - ${ethers.formatEther(amount)}`);
        } catch (error) {
            console.error('Error handling CollateralWithdrawn:', error);
        }
    }

    async handleTierUpgraded(user, newTier, event) {
        try {
            const block = await event.getBlock();

            await Transaction.create({
                txHash: event.log.transactionHash,
                blockNumber: event.log.blockNumber,
                timestamp: new Date(block.timestamp * 1000),
                userAddress: user.toLowerCase(),
                eventType: 'TierUpgraded',
                newTier: Number(newTier),
                eventData: {
                    user,
                    newTier: Number(newTier)
                }
            });

            // Update user tier
            await User.findOneAndUpdate(
                { walletAddress: user.toLowerCase() },
                { creditTier: Number(newTier) },
                { upsert: true }
            );

            console.log(`🎖️  Tier upgraded: ${user} -> Tier ${newTier}`);
        } catch (error) {
            console.error('Error handling TierUpgraded:', error);
        }
    }

    async updateUserStats(userAddress) {
        try {
            const normalizedAddress = userAddress.toLowerCase();

            // Get position from blockchain (returns tuple)
            const position = await this.creditProtocol.getUserPosition(userAddress);

            // Update or create user - use index access for tuple
            await User.findOneAndUpdate(
                { walletAddress: normalizedAddress },
                {
                    creditTier: Number(position[3]),
                    successfulRepayments: Number(position[4]),
                    totalBorrowed: position[2].toString()
                },
                { upsert: true, new: true }
            );
        } catch (error) {
            // Don't fail event handlers for MongoDB errors
            console.error('Error updating user stats:', error.message);
        }
    }

    async processMissedEvents() {
        try {
            const currentBlock = await Promise.race([
                this.provider.getBlockNumber(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Block number fetch timeout')), 10000)
                )
            ]);

            if (currentBlock > this.lastProcessedBlock) {
                // Query historical events in chunks to avoid timeouts
                const chunkSize = 1000;
                const startBlock = this.lastProcessedBlock + 1;
                
                for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += chunkSize) {
                    const toBlock = Math.min(fromBlock + chunkSize - 1, currentBlock);
                    
                    try {
                        const filter = {
                            address: await this.creditProtocol.getAddress(),
                            fromBlock: fromBlock,
                            toBlock: toBlock
                        };

                        const logs = await Promise.race([
                            this.provider.getLogs(filter),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('getLogs timeout')), 15000)
                            )
                        ]);

                        if (logs.length > 0) {
                            console.log(`📚 Processing ${logs.length} missed events (blocks ${fromBlock}-${toBlock})...`);
                        }
                    } catch (error) {
                        console.error(`Error fetching logs for blocks ${fromBlock}-${toBlock}:`, error.message);
                        // Continue with next chunk
                    }
                }

                this.lastProcessedBlock = currentBlock;
            }
        } catch (error) {
            console.error('Error processing missed events:', error.message);
            // Reconnect on critical errors
            if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
                this.handleProviderError();
            }
        }
    }

}

// Export singleton instance
const indexer = new EventIndexer();
module.exports = indexer;
