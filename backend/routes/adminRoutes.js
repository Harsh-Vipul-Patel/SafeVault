const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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
// Create a new branch + auto-create its bank pool account + generate pool password
router.post('/branches', async (req, res) => {
    const { branchId, branchName, ifscCode, address, city, state } = req.body;

    if (!branchId || !branchName || !ifscCode) {
        return res.status(400).json({ message: 'Branch ID, Name, and IFSC are required.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();

        // 1. Create the branch
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
            }
        );

        // 2. Auto-create bank pool account for this branch
        const poolAccountId = 'ACC-BANK-' + branchId;
        const poolAccountNumber = '999' + branchId.replace(/[^0-9]/g, '').padStart(15, '0').slice(0, 15);
        await connection.execute(
            `INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id,
                 home_branch_id, balance, status, opened_date, minimum_balance)
             VALUES (:aid, :anum, 'CUST-BANK-001', 2, :bid, 100000000, 'ACTIVE', SYSDATE, 0)`,
            { aid: poolAccountId, anum: poolAccountNumber, bid: branchId }
        );

        // 3. Generate random pool access password (shown ONCE to admin)
        const poolPassword = crypto.randomBytes(6).toString('hex').toUpperCase(); // e.g., 'A3F8B2C1D9E4'
        const passwordHash = await bcrypt.hash(poolPassword, 10);
        await connection.execute(
            `INSERT INTO POOL_ACCESS_CREDENTIALS (pool_account_id, password_hash)
             VALUES (:paid, :phash)`,
            { paid: poolAccountId, phash: passwordHash }
        );

        await connection.commit();

        // Audit log
        await connection.execute(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, change_reason)
             VALUES ('ACCOUNTS', :aid, 'INSERT', :admin, SYSTIMESTAMP, 'Bank pool account auto-created for new branch')`,
            { aid: poolAccountId, admin: req.user.id },
            { autoCommit: true }
        );

        res.json({
            message: 'Branch created successfully with bank pool account.',
            branchId,
            poolAccountId,
            poolAccessPassword: poolPassword,
            warning: 'SAVE THIS PASSWORD. It will NOT be shown again. Required to view pool account funds.'
        });
    } catch (err) {
        if (connection) await connection.rollback();
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

// --- BRANCH CRUD ---

// PUT /api/admin/branches/:branchId — Update branch details
router.put('/branches/:branchId', async (req, res) => {
    const { branchId } = req.params;
    const { branchName, ifscCode, address, city, state, isActive } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();

        // Build dynamic update
        const sets = [];
        const binds = { bid: branchId };
        if (branchName !== undefined) { sets.push('branch_name = :bname'); binds.bname = branchName; }
        if (ifscCode !== undefined) { sets.push('ifsc_code = :ifsc'); binds.ifsc = ifscCode; }
        if (address !== undefined) { sets.push('address = :addr'); binds.addr = address; }
        if (city !== undefined) { sets.push('city = :city'); binds.city = city; }
        if (state !== undefined) { sets.push('state = :state'); binds.state = state; }
        if (isActive !== undefined) { sets.push("is_active = :active"); binds.active = isActive; }

        if (sets.length === 0) return res.status(400).json({ message: 'No fields to update.' });

        const sql = `UPDATE BRANCHES SET ${sets.join(', ')} WHERE branch_id = :bid`;
        const result = await connection.execute(sql, binds, { autoCommit: true });

        if (result.rowsAffected === 0) return res.status(404).json({ message: 'Branch not found.' });

        // Audit log
        await connection.execute(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, change_reason)
             VALUES ('BRANCHES', :bid, 'UPDATE', :admin, SYSTIMESTAMP, 'Branch details updated by sys admin')`,
            { bid: branchId, admin: req.user.id },
            { autoCommit: true }
        );

        res.json({ message: 'Branch updated successfully.' });
    } catch (err) {
        console.error('Update Branch Error:', err);
        res.status(500).json({ message: 'Failed to update: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// DELETE /api/admin/branches/:branchId — Soft-delete (deactivate) a branch
router.delete('/branches/:branchId', async (req, res) => {
    const { branchId } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `UPDATE BRANCHES SET is_active = '0' WHERE branch_id = :bid`,
            { bid: branchId },
            { autoCommit: true }
        );
        if (result.rowsAffected === 0) return res.status(404).json({ message: 'Branch not found.' });

        await connection.execute(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, change_reason)
             VALUES ('BRANCHES', :bid, 'DEACTIVATE', :admin, SYSTIMESTAMP, 'Branch deactivated by sys admin')`,
            { bid: branchId, admin: req.user.id },
            { autoCommit: true }
        );

        res.json({ message: 'Branch deactivated successfully.' });
    } catch (err) {
        console.error('Deactivate Branch Error:', err);
        res.status(500).json({ message: 'Failed to deactivate: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// --- STAFF / EMPLOYEE CRUD ---

// PUT /api/admin/users/:userId — Update employee role, branch, or full name
router.put('/users/:userId', async (req, res) => {
    const { userId } = req.params;
    const { fullName, role, branchId } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();

        const sets = [];
        const binds = { uid: userId };
        if (fullName !== undefined) { sets.push('full_name = :fname'); binds.fname = fullName; }
        if (role !== undefined) { sets.push('role = :role'); binds.role = role; }
        if (branchId !== undefined) { sets.push('branch_id = :bid'); binds.bid = branchId; }

        if (sets.length === 0) return res.status(400).json({ message: 'No fields to update.' });

        const sql = `UPDATE EMPLOYEES SET ${sets.join(', ')} WHERE user_id = HEXTORAW(:uid)`;
        const result = await connection.execute(sql, binds, { autoCommit: true });

        if (result.rowsAffected === 0) return res.status(404).json({ message: 'Employee not found for this user.' });

        // Also update USERS.user_type if role changes between employee types
        if (role) {
            await connection.execute(
                `UPDATE USERS SET user_type = 'EMPLOYEE' WHERE user_id = HEXTORAW(:uid)`,
                { uid: userId },
                { autoCommit: true }
            );
        }

        await connection.execute(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, change_reason)
             VALUES ('EMPLOYEES', :uid, 'UPDATE', :admin, SYSTIMESTAMP, 'Employee profile updated by sys admin')`,
            { uid: userId, admin: req.user.id },
            { autoCommit: true }
        );

        res.json({ message: 'Employee updated successfully.' });
    } catch (err) {
        console.error('Update Employee Error:', err);
        res.status(500).json({ message: 'Failed to update employee: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// DELETE /api/admin/users/:userId — Soft-deactivate employee (lock user + set employee inactive)
router.delete('/users/:userId', async (req, res) => {
    const { userId } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection();

        // Deactivate employee record
        const empResult = await connection.execute(
            `UPDATE EMPLOYEES SET is_active = '0' WHERE user_id = HEXTORAW(:uid)`,
            { uid: userId }
        );

        // Lock user account
        await connection.execute(
            `UPDATE USERS SET is_locked = '1' WHERE user_id = HEXTORAW(:uid)`,
            { uid: userId }
        );

        await connection.commit();

        if (empResult.rowsAffected === 0) {
            return res.status(404).json({ message: 'Employee not found for this user.' });
        }

        await connection.execute(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, change_reason)
             VALUES ('EMPLOYEES', :uid, 'DEACTIVATE', :admin, SYSTIMESTAMP, 'Employee deactivated by sys admin')`,
            { uid: userId, admin: req.user.id },
            { autoCommit: true }
        );

        res.json({ message: 'Employee deactivated and account locked.' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Deactivate Employee Error:', err);
        res.status(500).json({ message: 'Failed to deactivate: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ===============================================================
// --- BANK POOL MANAGEMENT (TWO-STEP AUTH: PASSWORD + OTP) ---
// ===============================================================

// STEP 1: POST /api/admin/bank-pool/verify-password
// Admin enters the branch pool password → if correct, OTP is sent to admin's email
router.post('/bank-pool/verify-password', async (req, res) => {
    const { poolAccountId, password } = req.body;
    if (!poolAccountId || !password) {
        return res.status(400).json({ message: 'Pool account ID and password are required.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();

        // 1. Fetch stored password hash
        const credResult = await connection.execute(
            `SELECT password_hash FROM POOL_ACCESS_CREDENTIALS WHERE pool_account_id = :paid`,
            { paid: poolAccountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (credResult.rows.length === 0) {
            return res.status(404).json({ message: 'No credentials found for this pool account. Use reset-password first.' });
        }

        const isMatch = await bcrypt.compare(password, credResult.rows[0].PASSWORD_HASH);
        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect pool access password.' });
        }

        // 2. Password correct → Generate OTP and send to admin's email
        const adminEmpId = req.user.employeeId;
        const empResult = await connection.execute(
            `SELECT e.email, e.full_name, e.user_id FROM EMPLOYEES e WHERE e.employee_id = :eid`,
            { eid: adminEmpId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (empResult.rows.length === 0 || !empResult.rows[0].EMAIL) {
            return res.status(400).json({ message: 'Admin email not configured. Cannot send OTP.' });
        }

        const adminEmail = empResult.rows[0].EMAIL;
        const adminName = empResult.rows[0].FULL_NAME;
        const adminUserId = empResult.rows[0].USER_ID;

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);

        // Store OTP in OTPS table
        await connection.execute(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES (:uid, :txid, :ohash, 'POOL_ACCESS', CURRENT_TIMESTAMP + INTERVAL '5' MINUTE, 'PENDING')`,
            { uid: adminUserId, txid: 'POOL-' + poolAccountId, ohash: otpHash },
            { autoCommit: true }
        );

        // Send OTP email
        const emailHtml = templates.otp(adminName, otpCode);
        await sendEmail(adminEmail, 'Suraksha Bank - Pool Account Access OTP', emailHtml, [], true);

        res.json({
            message: 'Password verified. OTP sent to your registered email.',
            poolAccountId,
            adminEmployeeId: adminEmpId
        });
    } catch (err) {
        console.error('Pool Password Verify Error:', err);
        res.status(500).json({ message: 'Verification failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// STEP 2: POST /api/admin/bank-pool/verify-otp
// Admin enters the OTP → if correct, return full pool account data
router.post('/bank-pool/verify-otp', async (req, res) => {
    const { poolAccountId, otpCode } = req.body;
    if (!poolAccountId || !otpCode) {
        return res.status(400).json({ message: 'Pool account ID and OTP are required.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();

        // Verify OTP from OTPS table for this admin
        const adminEmpId = req.user.employeeId;
        const empResult = await connection.execute(
            `SELECT user_id FROM EMPLOYEES WHERE employee_id = :eid`,
            { eid: adminEmpId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (empResult.rows.length === 0) {
            return res.status(400).json({ message: 'Admin employee not found.' });
        }
        const adminUserId = empResult.rows[0].USER_ID;

        // Get latest OTP for this user + purpose
        const otpResult = await connection.execute(
            `SELECT otp_id, otp_hash, expires_at, attempts, status
             FROM OTPS
             WHERE user_id = :uid AND purpose = 'POOL_ACCESS' AND transaction_id = :txid
             ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
            { uid: adminUserId, txid: 'POOL-' + poolAccountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({ message: 'No OTP found. Please verify password first.' });
        }

        const otpData = otpResult.rows[0];

        if (otpData.STATUS !== 'PENDING') {
            return res.status(400).json({ message: 'OTP already used or expired. Start over.' });
        }
        if (new Date() > new Date(otpData.EXPIRES_AT)) {
            await connection.execute(`UPDATE OTPS SET status = 'FAILED' WHERE otp_id = :1`, [otpData.OTP_ID], { autoCommit: true });
            return res.status(400).json({ message: 'OTP expired. Please verify password again.' });
        }
        if (otpData.ATTEMPTS >= 3) {
            await connection.execute(`UPDATE OTPS SET status = 'FAILED' WHERE otp_id = :1`, [otpData.OTP_ID], { autoCommit: true });
            return res.status(400).json({ message: 'Maximum OTP attempts reached.' });
        }

        const isMatch = await bcrypt.compare(otpCode, otpData.OTP_HASH);
        if (!isMatch) {
            const newAttempts = otpData.ATTEMPTS + 1;
            await connection.execute(
                `UPDATE OTPS SET attempts = :a, status = :s WHERE otp_id = :oid`,
                { a: newAttempts, s: newAttempts >= 3 ? 'FAILED' : 'PENDING', oid: otpData.OTP_ID },
                { autoCommit: true }
            );
            return res.status(401).json({ message: 'Incorrect OTP.', attemptsLeft: 3 - newAttempts });
        }

        // OTP verified
        await connection.execute(`UPDATE OTPS SET status = 'SUCCESS' WHERE otp_id = :1`, [otpData.OTP_ID], { autoCommit: true });

        // Update access tracking
        await connection.execute(
            `UPDATE POOL_ACCESS_CREDENTIALS SET last_accessed_at = SYSTIMESTAMP, access_count = access_count + 1
             WHERE pool_account_id = :paid`,
            { paid: poolAccountId },
            { autoCommit: true }
        );

        // Audit Log
        await connection.execute(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, change_reason)
             VALUES ('POOL_ACCESS_CREDENTIALS', :paid, 'ACCESS', :admin, SYSTIMESTAMP, 'Pool account accessed after password + OTP verification')`,
            { paid: poolAccountId, admin: req.user.id },
            { autoCommit: true }
        );

        // ===== RETURN POOL DATA =====
        // 1. Pool account details
        const poolResult = await connection.execute(
            `SELECT a.account_id, a.balance, a.home_branch_id, b.branch_name,
                    a.opened_date, a.status
             FROM ACCOUNTS a
             JOIN BRANCHES b ON a.home_branch_id = b.branch_id
             WHERE a.account_id = :paid`,
            { paid: poolAccountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // 2. Recent transactions for this pool account
        const txnResult = await connection.execute(
            `SELECT t.transaction_id, t.account_id, t.transaction_type, t.amount,
                    t.balance_after, t.transaction_date, t.description, t.initiated_by
             FROM TRANSACTIONS t
             WHERE t.account_id = :paid
             ORDER BY t.transaction_date DESC
             FETCH FIRST 50 ROWS ONLY`,
            { paid: poolAccountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // 3. Summary stats for this pool account
        const summaryResult = await connection.execute(
            `SELECT
                NVL(SUM(CASE WHEN transaction_type = 'FEE_CREDIT' THEN amount ELSE 0 END), 0) AS total_fee_income,
                NVL(SUM(CASE WHEN transaction_type = 'LOAN_EMI_CREDIT' THEN amount ELSE 0 END), 0) AS total_emi_income,
                NVL(SUM(CASE WHEN transaction_type = 'LOAN_DISBURSE_DEBIT' THEN amount ELSE 0 END), 0) AS total_disbursed,
                NVL(SUM(CASE WHEN transaction_type = 'INTEREST_DEBIT' THEN amount ELSE 0 END), 0) AS total_interest_paid,
                NVL(SUM(CASE WHEN transaction_type = 'LOAN_PENALTY_CREDIT' THEN amount ELSE 0 END), 0) AS total_penalty_income
             FROM TRANSACTIONS WHERE account_id = :paid`,
            { paid: poolAccountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            verified: true,
            poolAccount: poolResult.rows[0] || {},
            recentTransactions: txnResult.rows,
            summary: summaryResult.rows[0] || {}
        });
    } catch (err) {
        console.error('Pool OTP Verify Error:', err);
        res.status(500).json({ message: 'OTP verification failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/admin/bank-pool/list
// List all pool accounts (no sensitive data, just IDs and branch names)
router.get('/bank-pool/list', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT a.account_id, a.home_branch_id, b.branch_name, a.status,
                    pc.last_accessed_at, pc.access_count
             FROM ACCOUNTS a
             JOIN BRANCHES b ON a.home_branch_id = b.branch_id
             LEFT JOIN POOL_ACCESS_CREDENTIALS pc ON a.account_id = pc.pool_account_id
             WHERE a.customer_id = 'CUST-BANK-001'
             ORDER BY a.home_branch_id`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ poolAccounts: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/admin/bank-pool/reset-password
// Generate a new password for an existing pool account (for migration or if lost)
router.post('/bank-pool/reset-password', async (req, res) => {
    const { poolAccountId } = req.body;
    if (!poolAccountId) {
        return res.status(400).json({ message: 'Pool account ID is required.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();

        // Verify the account exists and is a pool account
        const accResult = await connection.execute(
            `SELECT account_id FROM ACCOUNTS WHERE account_id = :paid AND customer_id = 'CUST-BANK-001'`,
            { paid: poolAccountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (accResult.rows.length === 0) {
            return res.status(404).json({ message: 'Pool account not found.' });
        }

        // Generate new password
        const newPassword = crypto.randomBytes(6).toString('hex').toUpperCase();
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Upsert credential
        const updateResult = await connection.execute(
            `UPDATE POOL_ACCESS_CREDENTIALS SET password_hash = :phash, created_at = SYSTIMESTAMP
             WHERE pool_account_id = :paid`,
            { phash: passwordHash, paid: poolAccountId }
        );

        if (updateResult.rowsAffected === 0) {
            await connection.execute(
                `INSERT INTO POOL_ACCESS_CREDENTIALS (pool_account_id, password_hash)
                 VALUES (:paid, :phash)`,
                { paid: poolAccountId, phash: passwordHash }
            );
        }

        await connection.commit();

        // Audit log
        await connection.execute(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, change_reason)
             VALUES ('POOL_ACCESS_CREDENTIALS', :paid, 'PASSWORD_RESET', :admin, SYSTIMESTAMP, 'Pool password reset by sys admin')`,
            { paid: poolAccountId, admin: req.user.id },
            { autoCommit: true }
        );

        res.json({
            message: 'Pool access password reset successfully.',
            poolAccountId,
            newPassword,
            warning: 'SAVE THIS PASSWORD. It will NOT be shown again.'
        });
    } catch (err) {
        console.error('Pool Password Reset Error:', err);
        res.status(500).json({ message: 'Failed to reset password: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
