const { Pool } = require('pg');

let pool;

async function initializeDBPool() {
    try {
        console.log('Initializing PostgreSQL connection pool...');
        pool = new Pool({
            connectionString: process.env.DB_CONNECTION_STRING,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        
        // Test connection
        const client = await pool.connect();
        console.log('PostgreSQL connection pool started.');
        client.release();
    } catch (err) {
        console.error('initDB error: ', err.message);
        throw err;
    }
}

async function closeDBPool() {
    console.log('Closing PostgreSQL connection pool...');
    try {
        if (pool) {
            await pool.end();
            console.log('PostgreSQL connection pool closed.');
        }
    } catch (err) {
        console.error('closeDB error: ', err.message);
    }
}

// Helper to get a client from the pool (for transactions)
async function getClient() {
    return await pool.connect();
}

// Helper for simple queries
async function query(text, params) {
    return await pool.query(text, params);
}

module.exports = { initializeDBPool, closeDBPool, getClient, query };
