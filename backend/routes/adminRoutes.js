const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
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
    let connection;
    try {
        connection = await oracledb.getConnection();

        let activeSessions = 0;
        let activeJobs = 0;
        let failedLogins = 0;

        // 1. Activity (v$session) - requires elevated privileges
        try {
            const res = await connection.execute(
                `SELECT COUNT(*) AS count FROM v$session WHERE status = 'ACTIVE' AND type != 'BACKGROUND'`,
                {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            activeSessions = res.rows[0].COUNT || 0;
        } catch (e) {
            // console.debug('v$session access denied - expected for non-DBA.');
        }

        // 2. Batch Jobs
        try {
            const res = await connection.execute(
                `SELECT COUNT(*) AS count FROM ACCRUAL_BATCH_CONTROL WHERE status IN ('PROCESSING', 'PENDING')`,
                {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            activeJobs = res.rows[0].COUNT || 0;
        } catch (e) {
            console.warn('Dashboard Monitor: ACCRUAL_BATCH_CONTROL not found.');
        }

        // 3. Security (Failed Logins)
        try {
            const res = await connection.execute(
                `SELECT SUM(failed_attempts) AS count FROM USERS WHERE failed_attempts > 0`,
                {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            failedLogins = res.rows[0].COUNT || 0;
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
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/admin/users
// Fetch all users (employees and customers)
router.get('/users', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT u.user_id, u.username, u.user_type, u.is_locked, u.failed_attempts, u.last_login,
                    e.full_name AS emp_name, e.role,
                    c.full_name AS cust_name 
             FROM USERS u
             LEFT JOIN EMPLOYEES e ON u.user_id = e.user_id
             LEFT JOIN CUSTOMERS c ON u.user_id = c.user_id
             ORDER BY u.username FETCH FIRST 100 ROWS ONLY`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const users = result.rows.map(r => ({
            user_id: r.USER_ID ? r.USER_ID.toString('hex') : null,
            username: r.USERNAME,
            user_type: r.USER_TYPE ? r.USER_TYPE.trim() : null,
            is_locked: r.IS_LOCKED,
            failed_attempts: r.FAILED_ATTEMPTS,
            last_login: r.LAST_LOGIN,
            name: r.EMP_NAME || r.CUST_NAME,
            role: r.ROLE ? r.ROLE.trim() : 'CUSTOMER'
        }));
        console.log(`Admin Sync: Fetched ${users.length} users from Oracle.`);
        res.json({ users });
    } catch (err) {
        console.error('Admin users error:', err);
        res.status(500).json({ message: 'Could not fetch users: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/admin/users/unlock/:userId
router.post('/users/unlock/:userId', async (req, res) => {
    const { userId } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `UPDATE USERS SET is_locked = '0', failed_attempts = 0 WHERE user_id = HEXTORAW(:uid)`,
            { uid: userId }, { autoCommit: true }
        );
        if (result.rowsAffected === 0) return res.status(404).json({ message: 'User not found' });
        res.json({ message: 'User unlocked and attempts reset.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/admin/branches
router.get('/branches', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT b.branch_id, b.branch_name, b.ifsc_code AS branch_code, b.address, b.city, b.state, b.is_active,
                    e.full_name AS manager_name
             FROM BRANCHES b
             LEFT JOIN EMPLOYEES e ON b.manager_emp_id = e.employee_id
             ORDER BY b.branch_id`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ branches: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/admin/branches
// Create a new branch
router.post('/branches', async (req, res) => {
    const { branchId, branchName, ifscCode, address, city, state } = req.body;

    if (!branchId || !branchName || !ifscCode) {
        return res.status(400).json({ message: 'Branch ID, Name, and IFSC are required.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `INSERT INTO BRANCHES (branch_id, branch_name, ifsc_code, address, city, state, is_active)
             VALUES (:id, :name, :ifsc, :addr, :city, :state, '1')`,
            {
                id: branchId,
                name: branchName,
                ifsc: ifscCode,
                addr: address || '',
                city: city || '',
                state: state || ''
            },
            { autoCommit: true }
        );
        res.json({ message: 'Branch created successfully.', branchId });
    } catch (err) {
        console.error('Create Branch Error:', err);
        res.status(500).json({ message: 'Failed to create branch: ' + err.message });
    } finally {
        if (connection) await connection.close();
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

    let connection;
    try {
        connection = await oracledb.getConnection();
        const hashedPassword = await bcrypt.hash(password, 10);

        // 1. Create User
        const userResult = await connection.execute(
            `INSERT INTO USERS (username, password_hash, user_type)
             VALUES (:uname, :phash, 'EMPLOYEE')
             RETURNING user_id INTO :uid`,
            {
                uname: username,
                phash: hashedPassword,
                uid: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT }
            }
        );

        const userId = userResult.outBinds.uid[0];

        // 2. Create Employee
        await connection.execute(
            `INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, is_active, user_id)
             VALUES (:eid, :bid, :fname, :role, SYSDATE, '1', :uid)`,
            {
                eid: employeeId,
                bid: branchId,
                fname: fullName,
                role: role,
                uid: userId
            }
        );

        await connection.commit();
        res.json({ message: 'Staff member onboarded successfully.', username, employeeId });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Onboard Staff Error:', err);
        res.status(500).json({ message: 'Failed to onboard staff: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/admin/config
router.get('/config', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT config_key, config_value, description, updated_at, updated_by FROM SYSTEM_CONFIG ORDER BY config_key`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ config: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/admin/config
router.post('/config', async (req, res) => {
    const { key, value } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `UPDATE SYSTEM_CONFIG SET config_value = :val, updated_at = SYSDATE, updated_by = :user WHERE config_key = :k`,
            { val: String(value), user: req.user.id, k: key }, { autoCommit: true }
        );
        if (result.rowsAffected === 0) return res.status(404).json({ message: 'Config key not found.' });
        res.json({ message: `Config ${key} updated successfully.` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/admin/audit
router.get('/audit', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT a.audit_id, a.table_name, a.record_id, a.operation, a.changed_by,
                    a.changed_at, a.old_value_json, a.new_value_json, a.change_reason, a.violation_flag
             FROM AUDIT_LOG a
             ORDER BY a.changed_at DESC FETCH FIRST 100 ROWS ONLY`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        // Normalize column names into frontend-friendly lowercase object
        const audit = result.rows.map(r => ({
            audit_id: r.AUDIT_ID,
            table_name: r.TABLE_NAME,
            record_id: r.RECORD_ID,
            action_type: r.OPERATION,       // map to what frontend expects
            changed_by: r.CHANGED_BY,
            action_date: r.CHANGED_AT,      // map to what frontend expects
            details: r.NEW_VALUE_JSON || r.CHANGE_REASON || r.OLD_VALUE_JSON || '',
            violation_flag: r.VIOLATION_FLAG
        }));
        res.json({ audit });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/admin/scheduler
router.get('/scheduler', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();

        let controlRows = [];
        try {
            const control = await connection.execute(
                `SELECT bc.run_id, bc.bucket_id, bc.accrual_date, bc.status,
                        bc.accounts_processed, bc.started_at, bc.completed_at, bc.error_message
                 FROM ACCRUAL_BATCH_CONTROL bc
                 ORDER BY bc.accrual_date DESC, bc.bucket_id ASC FETCH FIRST 20 ROWS ONLY`,
                {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            // Normalize to lowercase fields the frontend expects
            controlRows = control.rows.map(r => ({
                batch_id: `${r.RUN_ID}-${r.BUCKET_ID}`,
                batch_date: r.ACCRUAL_DATE,
                status: r.STATUS,
                total_accounts: null,
                processed_accounts: r.ACCOUNTS_PROCESSED,
                start_time: r.STARTED_AT,
                end_time: r.COMPLETED_AT,
                error_message: r.ERROR_MESSAGE
            }));
        } catch (e) {
            console.warn('Scheduler: ACCRUAL_BATCH_CONTROL query failed -', e.message);
        }

        let logRows = [];
        try {
            const logs = await connection.execute(
                `SELECT accrual_id AS log_id, account_id, principal_amount, interest_amount, accrual_date AS run_date
                 FROM INTEREST_ACCRUAL_LOG ORDER BY accrual_date DESC FETCH FIRST 20 ROWS ONLY`,
                {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            logRows = logs.rows;
        } catch (e) {
            console.warn('Scheduler: INTEREST_ACCRUAL_LOG query failed -', e.message);
        }

        res.json({ control: controlRows, logs: logRows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/admin/backup (Storage Overview)
router.get('/backup', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        // Since we may not have DBA privileges, we query USER_ segments for a proxy 'storage' view
        const segments = await connection.execute(
            `SELECT segment_name as "Table", segment_type as "Type", ROUND(bytes/1024/1024, 2) "Size MB"
             FROM USER_SEGMENTS WHERE segment_type IN ('TABLE', 'INDEX')
             ORDER BY bytes DESC FETCH FIRST 10 ROWS ONLY`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const total = await connection.execute(
            `SELECT ROUND(SUM(bytes)/1024/1024, 2) "Total Size MB" FROM USER_SEGMENTS`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ segments: segments.rows, totalMb: total.rows[0]["Total Size MB"] || 0 });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});


// --- FEE ENGINE MANAGEMENT ---
// GET /api/admin/fees
router.get('/fees', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT * FROM FEE_SCHEDULE ORDER BY fee_id`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ fees: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/admin/fees/update
router.post('/fees/update', async (req, res) => {
    const { feeId, amount, isPercentage, minBalanceThreshold } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `UPDATE FEE_SCHEDULE 
             SET fee_amount = :amt, 
                 is_percentage = :pct, 
                 min_balance_threshold = :mbt,
                 updated_at = SYSTIMESTAMP
             WHERE fee_id = :id`,
            { amt: Number(amount), pct: isPercentage, mbt: Number(minBalanceThreshold), id: feeId },
            { autoCommit: true }
        );
        res.json({ message: 'Fee updated successfully.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// --- GLOBAL MIS ---
// GET /api/admin/mis/system-liquidity
router.get('/mis/system-liquidity', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT b.branch_name, v.total_deposits, v.total_loans, v.liquidity_ratio, v.reserve_status
             FROM v_branch_liquidity v
             JOIN BRANCHES b ON v.branch_id = b.branch_id
             ORDER BY v.liquidity_ratio ASC`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ systemLiquidity: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/admin/mis/run-fee-deduction
router.post('/mis/run-fee-deduction', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_deduct_service_charges(:admin); END;`,
            { admin: req.user.id },
            { autoCommit: true }
        );
        res.json({ message: 'Global service charge deduction job triggered.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// --- ADMIN CUSTOMER UPDATES ---

// GET /api/admin/customers/:userId
// Fetch full customer details
router.get('/customers/:userId', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT * FROM CUSTOMERS WHERE user_id = HEXTORAW(:uid)`,
            { uid: req.params.userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Customer not found.' });
        res.json({ customer: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/admin/customers/update-otp
// Generate OTP and send to customer's email
router.post('/customers/update-otp', async (req, res) => {
    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ message: 'Customer ID required.' });
    const bcrypt = require('bcryptjs');

    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT email, full_name, user_id FROM CUSTOMERS WHERE customer_id = :cid`,
            { cid: customerId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Customer not found.' });
        const { EMAIL, FULL_NAME, USER_ID } = result.rows[0];
        
        if (!EMAIL) return res.status(400).json({ message: 'Customer has no email defined.' });

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);
        
        await connection.execute(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES (:user_id, :tx_id, :otp_hash, 'ADMIN_PROFILE_UPDATE', CURRENT_TIMESTAMP + INTERVAL '10' MINUTE, 'PENDING')`,
            { user_id: USER_ID, tx_id: `UPD-${customerId}`, otp_hash: otpHash },
            { autoCommit: true }
        );

        const emailHtml = templates.update(FULL_NAME, `Your bank administrator is updating your profile. Your OTP to authorize this is: <strong>${otpCode}</strong>.`);
        await sendEmail(EMAIL, 'Suraksha Bank - Profile Update OTP', emailHtml, [], true);

        // Send back USER_ID hex so customer/update can verify the OTP.
        res.json({ message: 'OTP sent to customer successfully.', userIdHex: USER_ID.toString('hex') });
    } catch (err) {
        console.error('Update OTP Error:', err);
        res.status(500).json({ message: 'Failed to send OTP: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/admin/customers/update
// Verify OTP and update address/phone/email
router.post('/customers/update', async (req, res) => {
    const { customerId, userIdHex, otpCode, email, phone, address } = req.body;
    if (!customerId || !userIdHex || !otpCode) return res.status(400).json({ message: 'Missing parameters.' });

    let connection;
    try {
        connection = await oracledb.getConnection();
        
        const validation = await verifyOtp(connection, userIdHex, otpCode, 'ADMIN_PROFILE_UPDATE');
        if (!validation.valid) {
            return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        await connection.execute(
            `UPDATE CUSTOMERS SET email = :email, phone = :phone, address = :address, updated_at = SYSDATE WHERE customer_id = :cid`,
            { email: email || '', phone: phone || '', address: address || '', cid: customerId },
            { autoCommit: true }
        );
        
        // Log in audit log
        await connection.execute(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, change_reason)
             VALUES ('CUSTOMERS', :cid, 'ADMIN_UPDATE', :admin, SYSTIMESTAMP, 'Profile updated by sys admin with OTP')`,
            { cid: customerId.toString(), admin: req.user.id },
            { autoCommit: true }
        );

        res.json({ message: 'Customer profile updated successfully.' });
    } catch (err) {
        console.error('Update Profile Error:', err);
        res.status(500).json({ message: 'Failed to update profile: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
