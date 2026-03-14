require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { initializeDBPool, closeDBPool, query } = require('./db');
const authRoutes = require('./routes/authRoutes');
const tellerRoutes = require('./routes/tellerRoutes');
const customerRoutes = require('./routes/customerRoutes');
const managerRoutes = require('./routes/managerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const loanManagerRoutes = require('./routes/loanManagerRoutes');
const otpRoutes = require('./routes/otpRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/teller', tellerRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/loan-manager', loanManagerRoutes);
app.use('/api/otp', otpRoutes);

// Basic health check
app.get('/api/health', async (req, res) => {
    try {
        await query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        console.error('Health check DB error:', err);
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
});

// Start Server
async function startServer() {
    try {
        await initializeDBPool();
        console.log('Connected to PostgreSQL successfully.');
    } catch (err) {
        console.error('Failed to connect to PostgreSQL. Running in MOCK mode Data might not persist.', err.message);
    }
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing server and database pool...');
    await closeDBPool();
    process.exit(0);
});

startServer();
