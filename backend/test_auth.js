require('dotenv').config();
const oracledb = require('oracledb');
const db = require('./db.js');

async function testAuth() {
    let connection;
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        const username = 'sunita.rao';
        const password = 'password';

        // 1. Fetch user from USERS table
        const userResult = await connection.execute(
            `SELECT user_id, username, password_hash, user_type, is_locked, failed_attempts
             FROM USERS
             WHERE LOWER(username) = LOWER(:uname)`,
            { uname: username },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log("User fetch result rows:", userResult.rows.length);
        if (userResult.rows.length === 0) {
            console.log('Invalid username or password (not found in DB).');
            return;
        }

        const user = userResult.rows[0];
        console.log("Found user:", user.USERNAME, "Locked:", user.IS_LOCKED);

        // 3. Verify password
        const storedHash = user.PASSWORD_HASH;
        let isMatch = false;

        const bcrypt = require('bcryptjs');
        try {
            if (storedHash.startsWith('$2')) {
                isMatch = await bcrypt.compare(password, storedHash);
            } else {
                const crypto = require('crypto');
                const sha256 = crypto.createHash('sha256').update(password).digest('hex');
                console.log("Calculated Hash:", sha256);
                console.log("Stored Hash:", storedHash);
                isMatch = sha256 === storedHash;
            }
        } catch {
            isMatch = password === storedHash;
        }

        console.log("Is Match?", isMatch);

        if (!isMatch) {
            console.log('Password did not match.');
            return;
        }
        
        console.log("LOGIN SUCCESS SIMULATED.");

    } catch (err) {
        console.error('Login Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
        await db.closeDBPool();
    }
}

testAuth();
