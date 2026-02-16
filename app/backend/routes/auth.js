const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const User = require('../models/User');

// Generate nonce for wallet authentication
router.post('/nonce', async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress || !ethers.isAddress(walletAddress)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        const normalizedAddress = walletAddress.toLowerCase();
        const nonce = Math.floor(Math.random() * 1000000).toString();

        // Find or create user
        let user = await User.findOne({ walletAddress: normalizedAddress });

        if (!user) {
            user = new User({
                walletAddress: normalizedAddress,
                nonce
            });
        } else {
            user.nonce = nonce;
        }

        await user.save();

        res.json({ nonce });
    } catch (error) {
        console.error('Nonce generation error:', error);
        res.status(500).json({ error: 'Failed to generate nonce' });
    }
});

// Verify signature and login
router.post('/login', async (req, res) => {
    try {
        const { walletAddress, signature } = req.body;

        if (!walletAddress || !signature) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const normalizedAddress = walletAddress.toLowerCase();
        const user = await User.findOne({ walletAddress: normalizedAddress });

        if (!user) {
            return res.status(404).json({ error: 'User not found. Request nonce first.' });
        }

        // Verify signature
        const message = `Sign this message to authenticate with Crypto Credit Protocol.\n\nNonce: ${user.nonce}`;
        const recoveredAddress = ethers.verifyMessage(message, signature);

        if (recoveredAddress.toLowerCase() !== normalizedAddress) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT
        const token = jwt.sign(
            {
                walletAddress: normalizedAddress,
                userId: user._id
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                walletAddress: user.walletAddress,
                creditTier: user.creditTier,
                username: user.username
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Verify token middleware (export for use in other routes)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

module.exports = router;
module.exports.authenticateToken = authenticateToken;
