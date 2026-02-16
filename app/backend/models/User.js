const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        index: true
    },
    email: {
        type: String,
        sparse: true,
        lowercase: true
    },
    username: {
        type: String,
        sparse: true
    },
    nonce: {
        type: String,
        required: true
    },
    // Protocol data (cached from blockchain)
    creditTier: {
        type: Number,
        default: 0
    },
    totalDeposits: {
        type: Number,
        default: 0
    },
    totalBorrowed: {
        type: Number,
        default: 0
    },
    successfulRepayments: {
        type: Number,
        default: 0
    },
    // Metadata
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
userSchema.index({ walletAddress: 1 });

module.exports = mongoose.model('User', userSchema);
