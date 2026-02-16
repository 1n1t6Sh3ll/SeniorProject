const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    txHash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    blockNumber: {
        type: Number,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        required: true,
        index: true
    },
    userAddress: {
        type: String,
        required: true,
        lowercase: true,
        index: true
    },
    eventType: {
        type: String,
        required: true,
        enum: ['CollateralDeposited', 'Borrowed', 'Repaid', 'CollateralWithdrawn', 'Liquidated', 'TierUpgraded']
    },
    // Event-specific data
    asset: String,
    amount: String,
    healthFactor: String,
    newTier: Number,
    liquidator: String,
    // Raw event data
    eventData: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Compound indexes for common queries
transactionSchema.index({ userAddress: 1, timestamp: -1 });
transactionSchema.index({ eventType: 1, timestamp: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
