const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const oracledb = require('oracledb');
const crypto = require('crypto');
const { JWT_SECRET, verifyToken } = require('../middleware/auth');

// POST /api/auth/login
// Authenticates against Oracle USERS table, then determines role from CUSTOMERS or EMPLOYEES
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();

        // 1. Fetch user from USERS table
        const userResult = await connection.execute(
            `SELECT user_id, username, password_hash, user_type, is_locked, failed_attempts
             FROM USERS
             WHERE LOWER(username) = LOWER(:uname)`,
            { uname: username.trim() },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const user = userResult.rows[0];

        // 2. Check if account is locked
        if (user.IS_LOCKED === '1') {
            return res.status(403).json({ message: 'Account is locked. Please contact branch support.' });
        }

        // 3. Verify password
        // The seed uses a plain SHA256 hash of 'password'. Support both bcrypt and plain.
        const storedHash = user.PASSWORD_HASH;
        let isMatch = false;

        const bcrypt = require('bcryptjs');
        try {
            // Try bcrypt first (for updated passwords)
            if (storedHash.startsWith('$2')) {
                isMatch = await bcrypt.compare(password, storedHash);
            } else {
                // Fallback: plain SHA256 comparison (seed data uses SHA256 of 'password')
                const crypto = require('crypto');
                const sha256 = crypto.createHash('sha256').update(password).digest('hex');
                isMatch = sha256 === storedHash;
            }
        } catch {
            // If bcrypt fails, try direct string compare (demo/dev only)
            isMatch = password === storedHash;
        }

        if (!isMatch) {
            // Increment failed_attempts
            await connection.execute(
                `UPDATE USERS SET failed_attempts = failed_attempts + 1,
                    is_locked = CASE WHEN failed_attempts + 1 >= 5 THEN '1' ELSE '0' END
                 WHERE LOWER(username) = LOWER(:uname)`,
                { uname: username.trim() },
                { autoCommit: true }
            );
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        // 4. Generate Session Token, Reset failed attempts & update last_login
        const sessionToken = crypto.randomUUID();
        const sqlUpdate = `UPDATE USERS 
                           SET failed_attempts = 0, 
                               last_login = SYSTIMESTAMP, 
                               session_token = :stoken 
                           WHERE LOWER(username) = LOWER(:uname)`;

        await connection.execute(
            sqlUpdate,
            { stoken: sessionToken, uname: username.trim() },
            { autoCommit: true }
        );

        const userId = user.USER_ID;  // RAW(16) - comes as Buffer from oracledb
        const userType = user.USER_TYPE;

        // 5. Determine role and fetch display name
        let role, name, entityId;
        const uidHex = userId.toString('hex');

        if (userType === 'CUSTOMER') {
            const custResult = await connection.execute(
                `SELECT customer_id, full_name FROM CUSTOMERS WHERE user_id = HEXTORAW(:uidHex)`,
                { uidHex },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (custResult.rows.length > 0) {
                const cust = custResult.rows[0];
                role = 'CUSTOMER';
                name = cust.FULL_NAME;
                entityId = cust.CUSTOMER_ID;
            } else {
                role = 'CUSTOMER';
                name = user.USERNAME;
                entityId = uidHex;
            }
        } else {
            // EMPLOYEE — check EMPLOYEES table for specific role (TELLER / BRANCH_MANAGER / SYSTEM_ADMIN)
            const empResult = await connection.execute(
                `SELECT employee_id, full_name, role FROM EMPLOYEES WHERE user_id = HEXTORAW(:uidHex) AND is_active = '1'`,
                { uidHex },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (empResult.rows.length > 0) {
                const emp = empResult.rows[0];
                role = emp.ROLE;        // e.g. TELLER, BRANCH_MANAGER, SYSTEM_ADMIN
                name = emp.FULL_NAME;
                entityId = emp.EMPLOYEE_ID;
            } else {
                return res.status(403).json({ message: 'Employee record not found or inactive.' });
            }
        }

        // 6. Sign JWT
        const token = jwt.sign(
            { id: entityId, role, name, username: user.USERNAME, session_token: sessionToken },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        return res.json({
            message: 'Login successful',
            token,
            user: { id: entityId, role, name, username: user.USERNAME }
        });

    } catch (err) {
        console.error('Login Error:', err);
        return res.status(500).json({ message: 'Authentication service error. Please try again.' });
    } finally {
        if (connection) await connection.close();
    }
});

router.post('/logout', verifyToken, async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const username = req.user.username;

        await connection.execute(
            `UPDATE USERS SET session_token = NULL WHERE LOWER(username) = LOWER(:uname)`,
            { uname: username },
            { autoCommit: true }
        );

        res.json({ message: 'Logged out successfully and session invalidated.' });
    } catch (err) {
        console.error('Logout Error:', err);
        res.status(500).json({ message: 'Error during logout.' });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
