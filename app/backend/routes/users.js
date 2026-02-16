const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ walletAddress: req.user.walletAddress });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            walletAddress: user.walletAddress,
            username: user.username,
            email: user.email,
            creditTier: user.creditTier,
            totalDeposits: user.totalDeposits,
            totalBorrowed: user.totalBorrowed,
            successfulRepayments: user.successfulRepayments,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { username, email } = req.body;

        const user = await User.findOne({ walletAddress: req.user.walletAddress });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (username) user.username = username;
        if (email) user.email = email;

        await user.save();

        res.json({
            message: 'Profile updated successfully',
            user: {
                walletAddress: user.walletAddress,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Get user transaction history
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, eventType } = req.query;

        const query = { userAddress: req.user.walletAddress };
        if (eventType) {
            query.eventType = eventType;
        }

        const transactions = await Transaction.find(query)
            .sort({ timestamp: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const count = await Transaction.countDocuments(query);

        res.json({
            transactions,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            total: count
        });
    } catch (error) {
        console.error('Transaction history error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

module.exports = router;
