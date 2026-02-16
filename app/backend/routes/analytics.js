const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');

// Get protocol statistics
router.get('/stats', async (req, res) => {
    try {
        const [
            totalUsers,
            totalTransactions,
            totalDeposits,
            totalBorrows,
            totalRepayments
        ] = await Promise.all([
            User.countDocuments(),
            Transaction.countDocuments(),
            Transaction.countDocuments({ eventType: 'CollateralDeposited' }),
            Transaction.countDocuments({ eventType: 'Borrowed' }),
            Transaction.countDocuments({ eventType: 'Repaid' })
        ]);

        // Get total value locked (sum of all deposits)
        const deposits = await Transaction.find({ eventType: 'CollateralDeposited' });
        const withdrawals = await Transaction.find({ eventType: 'CollateralWithdrawn' });

        res.json({
            totalUsers,
            totalTransactions,
            activity: {
                deposits: totalDeposits,
                borrows: totalBorrows,
                repayments: totalRepayments
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Stats fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get recent activity
router.get('/activity', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const recentActivity = await Transaction.find()
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .select('txHash eventType userAddress amount timestamp');

        res.json({ activity: recentActivity });
    } catch (error) {
        console.error('Activity fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch activity' });
    }
});

// Get credit tier distribution
router.get('/tiers', async (req, res) => {
    try {
        const tierDistribution = await User.aggregate([
            {
                $group: {
                    _id: '$creditTier',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        res.json({
            distribution: tierDistribution.map(t => ({
                tier: t._id,
                users: t.count
            }))
        });
    } catch (error) {
        console.error('Tier distribution error:', error);
        res.status(500).json({ error: 'Failed to fetch tier distribution' });
    }
});

// Get transaction volume over time
router.get('/volume', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const volumeData = await Transaction.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate },
                    eventType: { $in: ['CollateralDeposited', 'Borrowed', 'Repaid'] }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                        eventType: '$eventType'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.date': 1 }
            }
        ]);

        res.json({ volumeData });
    } catch (error) {
        console.error('Volume fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch volume data' });
    }
});

module.exports = router;
