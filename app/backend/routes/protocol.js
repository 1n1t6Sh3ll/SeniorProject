const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load contract ABIs and addresses
const getDeploymentInfo = () => {
    try {
        const deploymentPath = path.join(__dirname, '../../deployments/localhost.json');
        if (fs.existsSync(deploymentPath)) {
            return JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        }
        return null;
    } catch (error) {
        console.error('Failed to load deployment info:', error);
        return null;
    }
};

// Get protocol configuration
router.get('/config', async (req, res) => {
    try {
        const deployment = getDeploymentInfo();

        if (!deployment) {
            return res.status(503).json({ error: 'Protocol not deployed' });
        }

        res.json({
            contracts: deployment.contracts,
            network: deployment.network,
            supportedAssets: [
                {
                    symbol: 'ETH',
                    address: ethers.ZeroAddress,
                    ltv: 6000,
                    liquidationThreshold: 7500
                },
                {
                    symbol: 'WBTC',
                    address: deployment.contracts.MockWBTC,
                    ltv: 6500,
                    liquidationThreshold: 8000
                }
            ],
            creditTiers: [
                { tier: 1, ltvBonus: 0, repaymentsRequired: 0 },
                { tier: 2, ltvBonus: 500, repaymentsRequired: 3 },
                { tier: 3, ltvBonus: 1000, repaymentsRequired: 10 }
            ]
        });
    } catch (error) {
        console.error('Config fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch protocol config' });
    }
});

// Get user position from blockchain
router.get('/position/:address', async (req, res) => {
    try {
        const { address } = req.params;

        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid address' });
        }

        const deployment = getDeploymentInfo();
        if (!deployment) {
            return res.status(503).json({ error: 'Protocol not deployed' });
        }

        // Connect to blockchain
        const provider = new ethers.JsonRpcProvider(
            process.env.RPC_URL || 'http://localhost:8545'
        );

        const creditProtocolABI = require('../../artifacts/contracts/CreditProtocol.sol/CreditProtocol.json').abi;
        const creditProtocol = new ethers.Contract(
            deployment.contracts.CreditProtocol,
            creditProtocolABI,
            provider
        );

        // Get user position (returns tuple)
        const position = await creditProtocol.getUserPosition(address);

        res.json({
            ethCollateral: position[0].toString(),
            wbtcCollateral: position[1].toString(),
            debtAmount: position[2].toString(),
            creditTier: Number(position[3]),
            successfulRepayments: Number(position[4]),
            healthFactor: position[5].toString(),
            maxBorrow: position[6].toString()
        });
    } catch (error) {
        console.error('Position fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch position' });
    }
});

// Get asset prices
router.get('/prices', async (req, res) => {
    try {
        const deployment = getDeploymentInfo();
        if (!deployment) {
            return res.status(503).json({ error: 'Protocol not deployed' });
        }

        const provider = new ethers.JsonRpcProvider(
            process.env.RPC_URL || 'http://localhost:8545'
        );

        const oracleABI = require('../../artifacts/contracts/MockPriceOracle.sol/MockPriceOracle.json').abi;
        const oracle = new ethers.Contract(
            deployment.contracts.PriceOracle,
            oracleABI,
            provider
        );

        const ethPrice = await oracle.getLatestPrice(ethers.ZeroAddress);
        const wbtcPrice = await oracle.getLatestPrice(deployment.contracts.MockWBTC);

        res.json({
            ETH: {
                price: ethPrice.toString(),
                decimals: 8
            },
            WBTC: {
                price: wbtcPrice.toString(),
                decimals: 8
            }
        });
    } catch (error) {
        console.error('Price fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch prices' });
    }
});

module.exports = router;
