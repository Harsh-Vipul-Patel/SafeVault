const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_SECRET, verifyToken } = require('../middleware/auth');
const { query } = require('../db');

// POST /api/auth/login
// Authenticates against PostgreSQL USERS table, then determines role from CUSTOMERS or EMPLOYEES
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        // 1. Fetch user from USERS table
        const userResult = await query(
            `SELECT user_id, username, password_hash, user_type, is_locked, failed_attempts
             FROM USERS
             WHERE LOWER(username) = LOWER($1)`,
            [username.trim()]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const user = userResult.rows[0];

        // 2. Check if account is locked
        if (user.is_locked === '1') {
            return res.status(403).json({ message: 'Account is locked. Please contact branch support.' });
        }

        // 3. Verify password
        const storedHash = user.password_hash;
        let isMatch = false;

        const bcrypt = require('bcryptjs');
        try {
            if (storedHash.startsWith('$2')) {
                isMatch = await bcrypt.compare(password, storedHash);
            } else {
                const crypto = require('crypto');
                const sha256 = crypto.createHash('sha256').update(password).digest('hex');
                isMatch = sha256 === storedHash;
            }
        } catch {
            isMatch = password === storedHash;
        }

        if (!isMatch) {
            // Increment failed_attempts
            await query(
                `UPDATE USERS SET failed_attempts = failed_attempts + 1,
                    is_locked = CASE WHEN failed_attempts + 1 >= 5 THEN '1' ELSE '0' END
                 WHERE LOWER(username) = LOWER($1)`,
                [username.trim()]
            );
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        // 4. Generate Session Token, Reset failed attempts & update last_login
        const sessionToken = crypto.randomUUID();
        const sqlUpdate = `UPDATE USERS 
                           SET failed_attempts = 0, 
                               last_login = CURRENT_TIMESTAMP, 
                               session_token = $1 
                           WHERE LOWER(username) = LOWER($2)`;

        await query(sqlUpdate, [sessionToken, username.trim()]);

        const userId = user.user_id;  // UUID
        const userType = user.user_type;

        // 5. Determine role and fetch display name
        let role, name, entityId;

        if (userType === 'CUSTOMER') {
            const custResult = await query(
                `SELECT customer_id, full_name FROM CUSTOMERS WHERE user_id = $1`,
                [userId]
            );
            if (custResult.rows.length > 0) {
                const cust = custResult.rows[0];
                role = 'CUSTOMER';
                name = cust.full_name;
                entityId = cust.customer_id;
            } else {
                role = 'CUSTOMER';
                name = user.username;
                entityId = userId;
            }
        } else {
            // EMPLOYEE — check EMPLOYEES table for specific role
            const empResult = await query(
                `SELECT employee_id, full_name, role FROM EMPLOYEES WHERE user_id = $1 AND is_active = '1'`,
                [userId]
            );
            if (empResult.rows.length > 0) {
                const emp = empResult.rows[0];
                role = emp.role;
                name = emp.full_name;
                entityId = emp.employee_id;
            } else {
                return res.status(403).json({ message: 'Employee record not found or inactive.' });
            }
        }

        // 6. Sign JWT
        const token = jwt.sign(
            { id: entityId, role, name, username: user.username, session_token: sessionToken },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        return res.json({
            message: 'Login successful',
            token,
            user: { id: entityId, role, name, username: user.username }
        });

    } catch (err) {
        console.error('Login Error:', err);
        return res.status(500).json({ message: 'Authentication service error. Please try again.' });
    }
});

router.post('/logout', verifyToken, async (req, res) => {
    try {
        const username = req.user.username;

        await query(
            `UPDATE USERS SET session_token = NULL WHERE LOWER(username) = LOWER($1)`,
            [username]
        );

        res.json({ message: 'Logged out successfully and session invalidated.' });
    } catch (err) {
        console.error('Logout Error:', err);
        res.status(500).json({ message: 'Error during logout.' });
    }
});

module.exports = router;
