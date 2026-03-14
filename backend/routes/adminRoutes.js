const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');
const templates = require('../utils/emailTemplates');
const { verifyOtp } = require('../utils/otpHelper');

// All endpoints require SYSTEM_ADMIN role
router.use(verifyToken);
router.use(requireRole(['SYSTEM_ADMIN']));

// GET /api/admin/monitor
// Fetch DB sessions, active jobs, failed logins overview
router.get('/monitor', async (req, res) => {
    try {
        let activeSessions = 0;
        let activeJobs = 0;
        let failedLogins = 0;

        // 1. Activity (pg_stat_activity)
        try {
            const sessRes = await query(
                `SELECT COUNT(*) AS count FROM pg_stat_activity WHERE state = 'active' AND backend_type = 'client backend'`
            );
            activeSessions = Number(sessRes.rows[0].count || 0);
        } catch (e) {
            // console.debug('pg_stat_activity access denied or error.');
        }

        // 2. Batch Jobs
        try {
            const jobRes = await query(
                `SELECT COUNT(*) AS count FROM ACCRUAL_BATCH_CONTROL WHERE status IN ('PROCESSING', 'PENDING')`
            );
            activeJobs = Number(jobRes.rows[0].count || 0);
        } catch (e) {
            console.warn('Dashboard Monitor: ACCRUAL_BATCH_CONTROL not found.');
        }

        // 3. Security (Failed Logins)
        try {
            const securityRes = await query(
                `SELECT SUM(failed_attempts) AS count FROM USERS WHERE failed_attempts > 0`
            );
            failedLogins = Number(securityRes.rows[0].count || 0);
        } catch (e) {
            console.warn('Dashboard Monitor: USERS table query failed.');
        }

        res.json({
            activeSessions,
            activeJobs,
            failedLogins
        });
    } catch (err) {
        console.error('Admin monitor error:', err);
        res.status(500).json({ message: 'Could not fetch monitor summary: ' + err.message });
    }
});

// GET /api/admin/users
// Fetch all users (employees and customers)
router.get('/users', async (req, res) => {
    try {
        const result = await query(
            `SELECT u.user_id, u.username, u.user_type, u.is_locked, u.failed_attempts, u.last_login,
                    e.full_name AS emp_name, e.role,
                    c.full_name AS cust_name 
             FROM USERS u
             LEFT JOIN EMPLOYEES e ON u.user_id = e.user_id
             LEFT JOIN CUSTOMERS c ON u.user_id = c.user_id
             ORDER BY u.username LIMIT 100`
        );
        const users = result.rows.map(r => ({
            user_id: r.user_id,
            username: r.username,
            user_type: r.user_type ? r.user_type.trim() : null,
            is_locked: r.is_locked,
            failed_attempts: r.failed_attempts,
            last_login: r.last_login,
            name: r.emp_name || r.cust_name,
            role: r.role ? r.role.trim() : 'CUSTOMER'
        }));
        console.log(`Admin Sync: Fetched ${users.length} users from PostgreSQL.`);
        res.json({ users });
    } catch (err) {
        console.error('Admin users error:', err);
        res.status(500).json({ message: 'Could not fetch users: ' + err.message });
    }
});

// POST /api/admin/users/unlock/:userId
router.post('/users/unlock/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await query(
            `UPDATE USERS SET is_locked = '0', failed_attempts = 0 WHERE user_id = $1`,
            [userId]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'User not found' });
        res.json({ message: 'User unlocked and attempts reset.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/admin/branches
router.get('/branches', async (req, res) => {
    try {
        const result = await query(
            `SELECT b.branch_id, b.branch_name, b.ifsc_code AS branch_code, b.address, b.city, b.state, b.is_active,
                    e.full_name AS manager_name
             FROM BRANCHES b
             LEFT JOIN EMPLOYEES e ON b.manager_emp_id = e.employee_id
             ORDER BY b.branch_id`
        );
        res.json({ branches: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/admin/branches
// Create a new branch
router.post('/branches', async (req, res) => {
    const { branchId, branchName, ifscCode, address, city, state } = req.body;

    if (!branchId || !branchName || !ifscCode) {
        return res.status(400).json({ message: 'Branch ID, Name, and IFSC are required.' });
    }

    try {
        await query(
            `INSERT INTO BRANCHES (branch_id, branch_name, ifsc_code, address, city, state, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, '1')`,
            [branchId, branchName, ifscCode, address || '', city || '', state || '']
        );
        res.json({ message: 'Branch created successfully.', branchId });
    } catch (err) {
        console.error('Create Branch Error:', err);
        res.status(500).json({ message: 'Failed to create branch: ' + err.message });
    }
});

// POST /api/admin/users
// Create new user and linked employee record
router.post('/users', async (req, res) => {
    const { username, password, fullName, role, branchId, employeeId } = req.body;
    const bcrypt = require('bcryptjs');

    if (!username || !password || !fullName || !role || !branchId || !employeeId) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // 1. Create User
        const userRes = await query(
            `INSERT INTO USERS (username, password_hash, user_type)
             VALUES ($1, $2, 'EMPLOYEE')
             RETURNING user_id`,
            [username, hashedPassword]
        );

        const userId = userRes.rows[0].user_id;

        // 2. Create Employee
        await query(
            `INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, is_active, user_id)
             VALUES ($1, $2, $3, $4, CURRENT_DATE, '1', $5)`,
            [employeeId, branchId, fullName, role, userId]
        );

        res.json({ message: 'Staff member onboarded successfully.', username, employeeId });
    } catch (err) {
        console.error('Onboard Staff Error:', err);
        res.status(500).json({ message: 'Failed to onboard staff: ' + err.message });
    }
});

// GET /api/admin/config
router.get('/config', async (req, res) => {
    try {
        const result = await query(
            `SELECT config_key, config_value, description, updated_at, updated_by FROM SYSTEM_CONFIG ORDER BY config_key`
        );
        res.json({ config: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/admin/config
router.post('/config', async (req, res) => {
    const { key, value } = req.body;
    try {
        const result = await query(
            `UPDATE SYSTEM_CONFIG SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE config_key = $3`,
            [String(value), req.user.id, key]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Config key not found.' });
        res.json({ message: `Config ${key} updated successfully.` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/admin/audit
router.get('/audit', async (req, res) => {
    try {
        const result = await query(
            `SELECT a.audit_id, a.table_name, a.record_id, a.operation, a.changed_by,
                    a.changed_at, a.old_value_json, a.new_value_json, a.change_reason, a.violation_flag
             FROM AUDIT_LOG a
             ORDER BY a.changed_at DESC LIMIT 100`
        );
        // Normalize column names into frontend-friendly lowercase object
        const audit = result.rows.map(r => ({
            audit_id: r.audit_id,
            table_name: r.table_name,
            record_id: r.record_id,
            action_type: r.operation,       // map to what frontend expects
            changed_by: r.changed_by,
            action_date: r.changed_at,      // map to what frontend expects
            details: r.new_value_json || r.change_reason || r.old_value_json || '',
            violation_flag: r.violation_flag
        }));
        res.json({ audit });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/admin/scheduler
router.get('/scheduler', async (req, res) => {
    try {
        let controlRows = [];
        try {
            const control = await query(
                `SELECT bc.run_id, bc.bucket_id, bc.accrual_date, bc.status,
                        bc.accounts_processed, bc.started_at, bc.completed_at, bc.error_message
                 FROM ACCRUAL_BATCH_CONTROL bc
                 ORDER BY bc.accrual_date DESC, bc.bucket_id ASC LIMIT 20`
            );
            // Normalize to lowercase fields the frontend expects
            controlRows = control.rows.map(r => ({
                batch_id: `${r.run_id}-${r.bucket_id}`,
                batch_date: r.accrual_date,
                status: r.status,
                total_accounts: null,
                processed_accounts: r.accounts_processed,
                start_time: r.started_at,
                end_time: r.completed_at,
                error_message: r.error_message
            }));
        } catch (e) {
            console.warn('Scheduler: ACCRUAL_BATCH_CONTROL query failed -', e.message);
        }

        let logRows = [];
        try {
            const logs = await query(
                `SELECT accrual_id AS log_id, account_id, principal_amount, interest_amount, accrual_date AS run_date
                 FROM INTEREST_ACCRUAL_LOG ORDER BY accrual_date DESC LIMIT 20`
            );
            logRows = logs.rows;
        } catch (e) {
            console.warn('Scheduler: INTEREST_ACCRUAL_LOG query failed -', e.message);
        }

        res.json({ control: controlRows, logs: logRows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/admin/backup (Storage Overview)
router.get('/backup', async (req, res) => {
    try {
        // Proxy 'storage' view for PostgreSQL
        const segmentsResult = await query(
            `SELECT relname as "Table", relkind as "Type", pg_size_pretty(pg_total_relation_size(relid)) as "Size"
             FROM pg_catalog.pg_statio_user_tables
             ORDER BY pg_total_relation_size(relid) DESC LIMIT 10`
        );
        const totalResult = await query(
            `SELECT pg_size_pretty(pg_database_size(current_database())) as "Total Size"`
        );
        res.json({ segments: segmentsResult.rows, totalMb: totalResult.rows[0]["Total Size"] || '0 MB' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// --- FEE ENGINE MANAGEMENT ---
// GET /api/admin/fees
router.get('/fees', async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM FEE_SCHEDULE ORDER BY fee_id`
        );
        res.json({ fees: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/admin/fees/update
router.post('/fees/update', async (req, res) => {
    const { feeId, amount, isPercentage, minBalanceThreshold } = req.body;
    try {
        await query(
            `UPDATE FEE_SCHEDULE 
             SET fee_amount = $1, 
                 is_percentage = $2, 
                 min_balance_threshold = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE fee_id = $4`,
            [Number(amount), isPercentage, Number(minBalanceThreshold), feeId]
        );
        res.json({ message: 'Fee updated successfully.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- GLOBAL MIS ---
// GET /api/admin/mis/system-liquidity
router.get('/mis/system-liquidity', async (req, res) => {
    try {
        const result = await query(
            `SELECT b.branch_name, v.total_deposits, v.total_loans, v.liquidity_ratio, v.reserve_status
             FROM v_branch_liquidity v
             JOIN BRANCHES b ON v.branch_id = b.branch_id
             ORDER BY v.liquidity_ratio ASC`
        );
        res.json({ systemLiquidity: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/admin/mis/run-fee-deduction
router.post('/mis/run-fee-deduction', async (req, res) => {
    try {
        await query(
            `CALL sp_deduct_service_charges($1)`,
            [req.user.id]
        );
        res.json({ message: 'Global service charge deduction job triggered.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- ADMIN CUSTOMER UPDATES ---

// GET /api/admin/customers/:userId
// Fetch full customer details
router.get('/customers/:userId', async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM CUSTOMERS WHERE user_id = $1`,
            [req.params.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Customer not found.' });
        res.json({ customer: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/admin/customers/update-otp
// Generate OTP and send to customer's email
router.post('/customers/update-otp', async (req, res) => {
    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ message: 'Customer ID required.' });
    const bcrypt = require('bcryptjs');

    try {
        const result = await query(
            `SELECT email, full_name, user_id FROM CUSTOMERS WHERE customer_id = $1`,
            [customerId]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Customer not found.' });
        const { email, full_name, user_id } = result.rows[0];
        
        if (!email) return res.status(400).json({ message: 'Customer has no email defined.' });

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);
        
        await query(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES ($1, $2, $3, 'ADMIN_PROFILE_UPDATE', CURRENT_TIMESTAMP + INTERVAL '10 minutes', 'PENDING')`,
            [user_id, `UPD-${customerId}`, otpHash]
        );

        const emailHtml = templates.update(full_name, `Your bank administrator is updating your profile. Your OTP to authorize this is: <strong>${otpCode}</strong>.`);
        await sendEmail(email, 'Suraksha Bank - Profile Update OTP', emailHtml, [], true);

        // Send back user_id so customer/update can verify the OTP.
        res.json({ message: 'OTP sent to customer successfully.', userId: user_id });
    } catch (err) {
        console.error('Update OTP Error:', err);
        res.status(500).json({ message: 'Failed to send OTP: ' + err.message });
    }
});

// POST /api/admin/customers/update
// Verify OTP and update address/phone/email
router.post('/customers/update', async (req, res) => {
    const { customerId, userId, otpCode, email, phone, address } = req.body;
    if (!customerId || !userId || !otpCode) return res.status(400).json({ message: 'Missing parameters.' });

    try {
        const validation = await verifyOtp(null, userId, otpCode, 'ADMIN_PROFILE_UPDATE');
        if (!validation.valid) {
            return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        await query(
            `UPDATE CUSTOMERS SET email = $1, phone = $2, address = $3, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $4`,
            [email || '', phone || '', address || '', customerId]
        );
        
        // Log in audit log
        await query(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, change_reason)
             VALUES ('CUSTOMERS', $1, 'ADMIN_UPDATE', $2, CURRENT_TIMESTAMP, 'Profile updated by sys admin with OTP')`,
            [customerId.toString(), req.user.id]
        );

        res.json({ message: 'Customer profile updated successfully.' });
    } catch (err) {
        console.error('Update Profile Error:', err);
        res.status(500).json({ message: 'Failed to update profile: ' + err.message });
    }
});

module.exports = router;
