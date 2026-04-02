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
        const storedHash = user.PASSWORD_HASH;
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
            await connection.execute(
                `UPDATE USERS SET failed_attempts = failed_attempts + 1,
                    is_locked = CASE WHEN failed_attempts + 1 >= 5 THEN '1' ELSE '0' END
                 WHERE LOWER(username) = LOWER(:uname)`,
                { uname: username.trim() },
                { autoCommit: true }
            );
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        // 4. Generate Session Token
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

        const userId = user.USER_ID;  // RAW(16)
        const userType = user.USER_TYPE;
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
            const empResult = await connection.execute(
                `SELECT employee_id, full_name, role FROM EMPLOYEES WHERE user_id = HEXTORAW(:uidHex) AND is_active = '1'`,
                { uidHex },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (empResult.rows.length > 0) {
                const emp = empResult.rows[0];
                role = emp.ROLE;
                name = emp.FULL_NAME;
                entityId = emp.EMPLOYEE_ID;
            } else {
                return res.status(403).json({ message: 'Employee record not found or inactive.' });
            }
        }

        // 6. Sign JWT (now injecting user_id)
        const token = jwt.sign(
            { id: entityId, user_id: uidHex, role, name, username: user.USERNAME, session_token: sessionToken },
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

// DELETE /api/auth/logout
router.post('/logout', verifyToken, async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `UPDATE USERS SET session_token = NULL WHERE username = :uname`,
            { uname: req.user.username },
            { autoCommit: true }
        );
        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ message: 'Internal server error during logout' });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/auth/notifications
// Role-aware notifications — each role sees their own relevant activity
router.get('/notifications', verifyToken, async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const role = (req.user.role || '').toUpperCase();
        const entityId = req.user.id;       // CUST-xxx or EMP-xxx
        const uidHex = req.user.user_id;    // hex UUID
        let notifications = [];

        if (role === 'CUSTOMER') {
            // Customer: pull from NOTIFICATION_LOG by their Oracle UUID
            if (!uidHex) {
                return res.status(400).json({ message: "JWT missing user_id. Please log out and back in." });
            }
            const result = await connection.execute(
                `SELECT notif_id AS id, trigger_event AS title, message_clob AS message, status, created_at AS created_ts
                 FROM NOTIFICATION_LOG
                 WHERE user_id = HEXTORAW(:uidhex)
                 ORDER BY created_at DESC
                 FETCH FIRST 25 ROWS ONLY`,
                { uidhex: uidHex.toUpperCase() },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            notifications = result.rows.map(r => ({
                id: r.ID, title: r.TITLE, message: r.MESSAGE, status: r.STATUS, timestamp: r.CREATED_TS
            }));

        } else if (role === 'TELLER') {
            // Teller: recent transactions they initiated + service requests assigned to them
            const txnResult = await connection.execute(
                `SELECT transaction_id AS id, 
                        'TXN_PROCESSED' AS title,
                        transaction_type || ' of ' || TO_CHAR(amount, 'FM99,99,99,990.00') || ' on A/C ' || account_id AS message,
                        status,
                        transaction_date AS created_ts
                 FROM TRANSACTIONS 
                 WHERE initiated_by = :empid
                 ORDER BY transaction_date DESC
                 FETCH FIRST 15 ROWS ONLY`,
                { empid: entityId },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const srResult = await connection.execute(
                `SELECT sr_id AS id, 
                        'SR_ASSIGNED' AS title,
                        request_type || ' request from ' || customer_id AS message,
                        status,
                        created_at AS created_ts
                 FROM SERVICE_REQUESTS 
                 WHERE assigned_to = :empid
                 ORDER BY created_at DESC
                 FETCH FIRST 10 ROWS ONLY`,
                { empid: entityId },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            notifications = [
                ...txnResult.rows.map(r => ({ id: 'TXN-' + r.ID, title: r.TITLE, message: r.MESSAGE, status: r.STATUS, timestamp: r.CREATED_TS })),
                ...srResult.rows.map(r => ({ id: 'SR-' + r.ID, title: r.TITLE, message: r.MESSAGE, status: r.STATUS, timestamp: r.CREATED_TS }))
            ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);

        } else if (role === 'BRANCH_MANAGER') {
            // Manager: pending external transfers + pending dual approvals + recent audit entries
            const pendingResult = await connection.execute(
                `SELECT RAWTOHEX(transfer_id) AS id,
                        'PENDING_APPROVAL' AS title,
                        'External transfer of ' || TO_CHAR(amount, 'FM99,99,99,990.00') || ' to A/C ' || destination_account || ' via ' || transfer_mode AS message,
                        status,
                        initiated_at AS created_ts
                 FROM PENDING_EXTERNAL_TRANSFERS 
                 WHERE status = 'PENDING'
                 ORDER BY initiated_at DESC
                 FETCH FIRST 10 ROWS ONLY`,
                {},
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const auditResult = await connection.execute(
                `SELECT audit_id AS id,
                        'AUDIT_' || operation AS title,
                        operation || ' on ' || table_name || ' (record: ' || record_id || ') by ' || changed_by AS message,
                        CASE WHEN violation_flag = '1' THEN 'FLAGGED' ELSE 'OK' END AS status,
                        changed_at AS created_ts
                 FROM AUDIT_LOG
                 ORDER BY changed_at DESC
                 FETCH FIRST 10 ROWS ONLY`,
                {},
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const srResult = await connection.execute(
                `SELECT sr_id AS id,
                        'SR_PENDING' AS title,
                        request_type || ' from customer ' || customer_id AS message,
                        status,
                        created_at AS created_ts
                 FROM SERVICE_REQUESTS
                 WHERE status IN ('PENDING', 'ASSIGNED')
                 ORDER BY created_at DESC
                 FETCH FIRST 10 ROWS ONLY`,
                {},
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            notifications = [
                ...pendingResult.rows.map(r => ({ id: 'PET-' + r.ID, title: r.TITLE, message: r.MESSAGE, status: r.STATUS, timestamp: r.CREATED_TS })),
                ...auditResult.rows.map(r => ({ id: 'AUD-' + r.ID, title: r.TITLE, message: r.MESSAGE, status: r.STATUS, timestamp: r.CREATED_TS })),
                ...srResult.rows.map(r => ({ id: 'SR-' + r.ID, title: r.TITLE, message: r.MESSAGE, status: r.STATUS, timestamp: r.CREATED_TS }))
            ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);

        } else if (role === 'LOAN_MANAGER') {
            // Loan Manager: loan applications + overdue EMIs + recent disbursements
            const loanAppsResult = await connection.execute(
                `SELECT RAWTOHEX(loan_app_id) AS id,
                        'LOAN_APP_' || status AS title,
                        loan_type || ' loan of ' || TO_CHAR(requested_amount, 'FM99,99,99,990.00') || ' from ' || customer_id AS message,
                        status,
                        applied_at AS created_ts
                 FROM LOAN_APPLICATIONS
                 ORDER BY applied_at DESC
                 FETCH FIRST 10 ROWS ONLY`,
                {},
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const overdueResult = await connection.execute(
                `SELECT es.emi_id AS id,
                        'EMI_OVERDUE' AS title,
                        'EMI #' || es.emi_id || ' of ' || TO_CHAR(es.emi_amount, 'FM99,99,99,990.00') || ' on loan ' || es.loan_account_id || ' due ' || TO_CHAR(es.due_date, 'DD-Mon-YYYY') AS message,
                        es.status,
                        es.due_date AS created_ts
                 FROM EMI_SCHEDULE es
                 WHERE es.status IN ('OVERDUE', 'PENDING') AND es.due_date <= SYSDATE
                 ORDER BY es.due_date ASC
                 FETCH FIRST 10 ROWS ONLY`,
                {},
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            notifications = [
                ...loanAppsResult.rows.map(r => ({ id: 'LA-' + r.ID, title: r.TITLE, message: r.MESSAGE, status: r.STATUS, timestamp: r.CREATED_TS })),
                ...overdueResult.rows.map(r => ({ id: 'EMI-' + r.ID, title: r.TITLE, message: r.MESSAGE, status: r.STATUS, timestamp: r.CREATED_TS }))
            ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);

        } else if (role === 'SYSTEM_ADMIN') {
            // Admin uses DBNotifications (separate component), but provide fallback
            const sysResult = await connection.execute(
                `SELECT audit_id AS id,
                        operation AS title,
                        operation || ' on ' || table_name || ' by ' || changed_by AS message,
                        CASE WHEN violation_flag = '1' THEN 'FLAGGED' ELSE 'OK' END AS status,
                        changed_at AS created_ts
                 FROM AUDIT_LOG
                 ORDER BY changed_at DESC
                 FETCH FIRST 20 ROWS ONLY`,
                {},
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            notifications = sysResult.rows.map(r => ({
                id: 'SYS-' + r.ID, title: r.TITLE, message: r.MESSAGE, status: r.STATUS, timestamp: r.CREATED_TS
            }));
        }

        res.json(notifications);
    } catch (err) {
        console.error("Notifications Fetch Error:", err);
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
