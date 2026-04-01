require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');
const authRoutes = require('./routes/authRoutes');
const tellerRoutes = require('./routes/tellerRoutes');
const customerRoutes = require('./routes/customerRoutes');
const managerRoutes = require('./routes/managerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const loanManagerRoutes = require('./routes/loanManagerRoutes');
const otpRoutes = require('./routes/otpRoutes');

// --- Global DB Logger Hook ---
global.dbLogs = [];
const maxLogs = 50;
const originalGetConnection = oracledb.getConnection;

oracledb.getConnection = async function(...args) {
    const connection = await originalGetConnection.apply(this, args);
    const originalExecute = connection.execute;
    
    connection.execute = async function(sql, ...execArgs) {
        let action = null;
        let pName = "Oracle Action";
        const upperSql = sql.toUpperCase();
        
        // Extract procedure/function name from BEGIN blocks
        if (upperSql.includes('BEGIN')) {
            const match = sql.match(/(?:BEGIN\s+|;\s*)([a-zA-Z0-9_\.]+)\s*\(/i);
            if (match) {
                pName = match[1];
                action = `Procedure/Function: ${pName}`;
            } else {
                action = "PL/SQL Block Executed";
            }
        } else if (upperSql.trim().startsWith('INSERT') || upperSql.trim().startsWith('UPDATE') || upperSql.trim().startsWith('DELETE')) {
            const tableNameMatch = upperSql.match(/(?:INTO|UPDATE|FROM)\s+([a-zA-Z0-9_]+)/i);
            const table = tableNameMatch ? tableNameMatch[1] : 'Table';
            const type = upperSql.trim().split(' ')[0];
            action = `${type} on ${table}`;
            pName = `${type} ${table}`;
        }
        
        if (action) {
            const logEntry = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                sql: sql,
                action: action,
                name: pName,
                timestamp: new Date().toISOString()
            };
            
            global.dbLogs.unshift(logEntry);
            if (global.dbLogs.length > maxLogs) {
                global.dbLogs.pop();
            }
        }
        
        return originalExecute.apply(this, [sql, ...execArgs]);
    };
    return connection;
};
// -----------------------------

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

// Database logs endpoint for notifications
app.get('/api/system/db-logs', (req, res) => {
    res.json(global.dbLogs || []);
});

// Basic health check
app.get('/api/health', async (req, res) => {
    try {
        const connection = await oracledb.getConnection();
        await connection.close();
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
        console.log('Connected to Oracle DB successfully.');
    } catch (err) {
        console.error('Failed to connect to Oracle DB. Running in MOCK mode Data might not persist.', err.message);
    }
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Server also listening on http://127.0.0.1:${PORT} (IPv4)`);
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing server and database pool...');
    await closeDBPool();
    process.exit(0);
});

startServer();
