const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Enhanced CORS configuration
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://0.0.0.0:5173', 'http://127.0.0.1:5173', 'http://0.0.0.0:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        if (req.path !== '/api/health') {
            console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
        }
    });
    next();
});

// Keep-alive
app.use((req, res, next) => {
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=65');
    next();
});

// MongoDB Connection (optional - app works without it)
let mongoConnected = false;

const connectDB = async (attempt = 1) => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crypto-credit';
        await mongoose.connect(mongoURI, {
            maxPoolSize: 10,
            minPoolSize: 2,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
        });
        mongoConnected = true;
        console.log('MongoDB connected');
    } catch (error) {
        mongoConnected = false;
        if (attempt < 3) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.log(`MongoDB connection failed (attempt ${attempt}/3), retrying in ${delay}ms...`);
            setTimeout(() => connectDB(attempt + 1), delay);
        } else {
            console.log('MongoDB unavailable - running without database (blockchain-only mode)');
        }
    }
};

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        mongodb: mongoConnected ? 'connected' : 'disconnected',
        version: '1.0.0'
    });
});

// Routes
const protocolRoutes = require('./routes/protocol');
app.use('/api/protocol', protocolRoutes);

// MongoDB-dependent routes with graceful fallback
const requireMongo = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Database unavailable - running in blockchain-only mode' });
    }
    next();
};

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const analyticsRoutes = require('./routes/analytics');

app.use('/api/auth', requireMongo, authRoutes);
app.use('/api/users', requireMongo, userRoutes);
app.use('/api/analytics', requireMongo, analyticsRoutes);

// Serve frontend static files (production / Docker mode)
const frontendDist = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(frontendDist)) {
    console.log('Serving frontend from:', frontendDist);
    app.use(express.static(frontendDist));

    // SPA fallback - serve index.html for non-API routes
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(frontendDist, 'index.html'));
    });
}

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(err.status || 500).json({
        error: { message: err.message || 'Internal server error' }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: { message: 'Route not found' } });
});

// Start server (ONCE)
const PORT = process.env.PORT || 3000;

const startServer = async () => {
    // Try MongoDB connection but don't block server startup
    connectDB();

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Health: http://localhost:${PORT}/api/health`);
    });

    server.keepAliveTimeout = 65000;

    // Start event indexer after delay (optional, won't crash if it fails)
    setTimeout(() => {
        try {
            const eventIndexer = require('./services/eventIndexer');
            eventIndexer.start().catch(err => {
                console.log('Event indexer could not start:', err.message);
            });
        } catch (error) {
            console.log('Event indexer not available:', error.message);
        }
    }, 3000);
};

startServer();

module.exports = app;
