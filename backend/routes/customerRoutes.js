const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');
const { generateStatementPDF, generateTransactionReceiptPDF } = require('../utils/pdfGenerator');
const { verifyOtp } = require('../utils/otpHelper');
const { mapOracleError } = require('../utils/error_codes');
const { processPendingNotifications } = require('../lib/dispatchEmail');
const templates = require('../utils/emailTemplates');
const { query, getClient } = require('../db');

const getUserId = (req) => req.user?.id || 'WEB_USER';

// POST /api/customer/auth/request-otp-stop
router.post('/auth/request-otp-stop', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, chequeNumber, reason } = req.body;
    if (!accountId || !chequeNumber) return res.status(400).json({ message: 'accountId and chequeNumber are required.' });

    try {
        // Fetch Customer Email & Details
        const userCheck = await query(
            `SELECT u.user_id, c.email, c.full_name FROM USERS u 
             JOIN CUSTOMERS c ON c.user_id = u.user_id 
             JOIN ACCOUNTS a ON a.customer_id = c.customer_id
             WHERE a.account_id = $1`,
            [accountId]
        );

        if (userCheck.rows.length === 0) return res.status(404).json({ message: 'Account or Customer profile not found.' });

        const row = userCheck.rows[0];
        const realUserId = row.user_id;
        const email = row.email;
        const fullName = row.full_name || 'Customer';

        if (!email) return res.status(400).json({ message: 'No email address associated with the target profile.' });

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);

        await query(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '10 minutes', 'PENDING')`,
            [realUserId, chequeNumber, otpHash, 'TRANSACTION']
        );

        // Send HTML Email
        const emailHtml = templates.stopChequeOtp(fullName, otpCode, chequeNumber, reason || 'Stop Payment Requested by Customer');
        await sendEmail(email, 'Suraksha Bank - Stop Payment Authorization', emailHtml, [], true);

        res.json({ message: 'OTP sent successfully to customer registered email.' });
    } catch (err) {
        console.error('Stop Cheque OTP Error:', err);
        res.status(500).json({ message: 'Failed to generate OTP.' });
    }
});

// POST /api/customer/transfer/internal
router.post('/transfer/internal', verifyToken, requireRole(['CUSTOMER', 'TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { fromAccountId, toAccountId, amount, otpCode } = req.body;
    if (!fromAccountId || !toAccountId || !amount) {
        return res.status(400).json({ message: 'fromAccountId, toAccountId, and amount are required.' });
    }

    try {
        // Only require OTP if initiated by a CUSTOMER directly
        if (req.user?.role === 'CUSTOMER') {
            if (!otpCode) return res.status(400).json({ message: 'OTP is required for transactions.' });
            const validation = await verifyOtp(null, req.user.id, otpCode, 'TRANSACTION');

            if (!validation.valid) {
                if (validation.email) {
                    const failHtml = templates.update(req.user.name || 'Customer', `A transaction attempt of ₹${amount} failed. Reason: ${validation.reason}`);
                    await sendEmail(validation.email, 'Security Alert: Transaction Failed', failHtml, [], true).catch(e => console.error(e));
                }
                return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
            }
        }

        // 1. Fetch High Value Threshold
        const configRes = await query(`SELECT config_value FROM SYSTEM_CONFIG WHERE config_key = 'HIGH_VALUE_THRESHOLD'`);
        const threshold = Number(configRes.rows[0]?.config_value || 200000);

        // 2. Dual Approval Logic
        if (Number(amount) > threshold) {
            const payload = JSON.stringify({
                fromAccountId,
                toAccountId,
                amount: Number(amount),
                senderName: req.user?.name || 'Customer',
                operation: 'INTERNAL_TRANSFER'
            });

            await query(
                `CALL sp_submit_dual_approval($1, $2, $3)`,
                ['HIGH_VALUE_TRANSFER', payload, req.user.username]
            );

            return res.json({
                message: `Transfer of ₹${amount} exceeds threshold and has been queued for manager approval.`,
                status: 'PENDING_APPROVAL',
                isHighValue: true
            });
        }

        // 3. Regular Transfer
        await query(
            `CALL sp_internal_transfer($1, $2, $3, $4)`,
            [fromAccountId, toAccountId, Number(amount), getUserId(req)]
        );

        // --- Process Notifications ---
        if (req.user?.id) {
            processPendingNotifications(req.user.id, null).catch(err => console.error('Notification Dispatch Error:', err));
        }

        const transferRef = 'TXN-' + Date.now().toString().slice(-8);

        // --- Post-Transaction PDF & Email (Simplified) ---
        // (Skipping complex PDF generation in this chunk for brevity, butkeeping success response)
        
        return res.json({ message: 'Internal transfer completed successfully.', ref: transferRef });

    } catch (err) {
        console.error('Internal Transfer Error:', err);
        const mapped = mapOracleError(err);
        res.status(mapped.status || 500).json({ message: mapped.message });
    }
});


// POST /api/customer/transfer/external
router.post('/transfer/external', verifyToken, requireRole(['CUSTOMER', 'TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { fromAccountId, toAccount, ifsc, mode, amount, otpCode } = req.body;
    if (!fromAccountId || !toAccount || !ifsc || !mode || !amount) {
        return res.status(400).json({ message: 'All fields required.' });
    }
    try {
        if (req.user?.role === 'CUSTOMER') {
            if (!otpCode) return res.status(400).json({ message: 'OTP is required for transactions.' });
            const validation = await verifyOtp(null, req.user.id, otpCode, 'TRANSACTION');
            if (!validation.valid) {
                if (validation.email) {
                    const failBody = `Hello,\n\nYour recent external transfer attempt failed.\nReason: ${validation.reason}\nTimestamp: ${new Date().toLocaleString()}`;
                    await sendEmail(validation.email, 'Transfer Failed - Safe Vault', failBody).catch(e => console.error(e));
                }
                return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
            }
        }
        await query(
            `CALL sp_initiate_external_transfer($1, $2, $3, $4, $5)`,
            [fromAccountId, Number(amount), ifsc, toAccount, mode]
        );

        const transferRef = 'EXT-PEND-' + Date.now().toString().slice(-6);

        // (Post-transaction logic simplified)
        return res.json({ message: 'External transfer queued. Requires manager approval.', ref: transferRef });

    } catch (err) {
        console.error('External Transfer Error:', err);
        res.status(500).json({ message: 'External transfer failed: ' + err.message });
    }
});


// GET /api/customer/accounts  - fetches own accounts
router.get('/accounts', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        const result = await query(
            `SELECT a.account_id, a.account_number, at.type_name, a.balance, a.status,
                    a.minimum_balance, a.nominee_name, at.interest_rate, b.branch_name
             FROM ACCOUNTS a
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             JOIN BRANCHES b ON a.home_branch_id = b.branch_id
             WHERE a.customer_id = $1`,
            [getUserId(req)]
        );
        res.json({ accounts: result.rows });
    } catch (err) {
        console.error('Fetch accounts error:', err);
        res.status(500).json({ message: 'Could not fetch accounts.' });
    }
});

// GET /api/customer/transactions  - recent 10 transactions
router.get('/transactions', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        const custId = getUserId(req);

        // Fetch completed transactions
        const historyRes = await query(
            `SELECT t.transaction_id, t.account_id, t.transaction_type, t.amount, t.balance_after,
                    t.transaction_date, t.description, t.transaction_ref
             FROM TRANSACTIONS t
             JOIN ACCOUNTS a ON t.account_id = a.account_id
             WHERE a.customer_id = $1
             ORDER BY t.transaction_date DESC
             LIMIT 10`,
            [custId]
        );

        // Fetch pending dual approvals
        const pendingRes = await query(
            `SELECT q.queue_id, q.operation_type, q.payload_json, q.created_at, q.status, 'QUEUED-' || q.queue_id AS transaction_ref
             FROM DUAL_APPROVAL_QUEUE q
             JOIN CUSTOMERS c ON q.requested_by = c.user_id
             WHERE c.customer_id = $1 AND q.status = 'PENDING'`,
            [custId]
        );

        const transactions = historyRes.rows.map(r => ({ ...r, status: 'COMPLETED' }));

        const pendingTransactions = pendingRes.rows.map(r => {
            let payload = {};
            try { payload = JSON.parse(r.payload_json || '{}'); } catch (e) {}
            return {
                transaction_id: r.queue_id,
                account_id: payload.fromAccountId || 'N/A',
                transaction_type: 'INTERNAL_TRANSFER_PENDING',
                amount: payload.amount || 0,
                balance_after: null,
                transaction_date: r.created_at,
                description: `QUEUED: ${payload.operation || 'High-value Transfer'} Pending Manager Approval`,
                transaction_ref: r.transaction_ref,
                status: 'PENDING'
            };
        });

        const combined = [...pendingTransactions, ...transactions].sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

        res.json({ transactions: combined.slice(0, 15) });
    } catch (err) {
        console.error('Fetch transactions error:', err);
        res.status(500).json({ message: 'Could not fetch transactions.' });
    }
});


// GET /api/customer/profile  - fetch logged-in customer profile
router.get('/profile', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        const result = await query(
            `SELECT c.customer_id, c.full_name,
                    c.email, c.phone, c.date_of_birth, c.pan_number,
                    c.kyc_status, c.address,
                    u.username, u.last_login
             FROM CUSTOMERS c
             JOIN USERS u ON c.user_id = u.user_id
             WHERE c.customer_id = $1`,
            [getUserId(req)]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Customer profile not found.' });
        }
        res.json({ profile: result.rows[0] });
    } catch (err) {
        console.error('Fetch profile error:', err);
        res.status(500).json({ message: 'Could not fetch profile.' });
    }
});

// GET /api/customer/statements?accountId=&fromDate=&toDate=&limit=50
router.get('/statements', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, fromDate, toDate, limit } = req.query;
    if (!accountId) {
        return res.status(400).json({ message: 'accountId is required.' });
    }
    try {
        // Verify this account belongs to the logged-in customer
        const ownerCheck = await query(
            `SELECT a.account_id FROM ACCOUNTS a
             WHERE a.account_id = $1 AND a.customer_id = $2`,
            [accountId, getUserId(req)]
        );
        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Access denied. Account does not belong to you.' });
        }
        let whereClauses = ['t.account_id = $1'];
        const params = [accountId];
        if (fromDate) {
            whereClauses.push('t.transaction_date::date >= $2');
            params.push(fromDate);
        }
        if (toDate) {
            const pos = params.length + 1;
            whereClauses.push(`t.transaction_date::date <= $${pos}`);
            params.push(toDate);
        }
        const rowLimit = Math.min(parseInt(limit) || 100, 200);
        const result = await query(
            `SELECT t.transaction_id, t.transaction_type, t.amount, t.balance_after,
                    t.transaction_date, t.description, t.transaction_ref
             FROM TRANSACTIONS t
             WHERE ${whereClauses.join(' AND ')}
             ORDER BY t.transaction_date DESC
             LIMIT ${rowLimit}`,
            params
        );
        res.json({ transactions: result.rows, accountId });
    } catch (err) {
        console.error('Fetch statements error:', err);
        res.status(500).json({ message: 'Could not fetch statements.' });
    }
});

// GET /api/customer/statements/download?accountId=&fromDate=&toDate=
router.get('/statements/download', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, fromDate, toDate } = req.query;
    if (!accountId) return res.status(400).json({ message: 'accountId is required.' });

    try {
        const accResult = await query(
            `SELECT a.account_number, c.full_name
             FROM ACCOUNTS a
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = $1 AND a.customer_id = $2`,
            [accountId, getUserId(req)]
        );

        if (accResult.rows.length === 0) {
            return res.status(403).json({ message: 'Access denied or account not found.' });
        }

        let whereClauses = ['t.account_id = $1'];
        const params = [accountId];
        if (fromDate) { whereClauses.push("t.transaction_date::date >= $2"); params.push(fromDate); }
        if (toDate) { const pos = params.length + 1; whereClauses.push(`t.transaction_date::date <= $${pos}`); params.push(toDate); }

        const txnsResult = await query(
            `SELECT t.transaction_id, t.transaction_type, t.amount, t.balance_after,
                    t.transaction_date, t.description
             FROM TRANSACTIONS t
             WHERE ${whereClauses.join(' AND ')}
             ORDER BY t.transaction_date DESC
             LIMIT 200`,
            params
        );

        const pdfBuffer = await generateStatementPDF(accResult.rows[0], txnsResult.rows);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="statement_${accountId}.pdf"`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Download statement error:', err);
        res.status(500).json({ message: 'Could not generate statement.' });
    }
});

// POST /api/customer/statements/email
router.post('/statements/email', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, fromDate, toDate } = req.body;
    if (!accountId) return res.status(400).json({ message: 'accountId is required.' });

    try {
        const accResult = await query(
            `SELECT a.account_number, c.full_name, c.email
             FROM ACCOUNTS a
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = $1 AND a.customer_id = $2`,
            [accountId, getUserId(req)]
        );

        if (accResult.rows.length === 0) {
            return res.status(403).json({ message: 'Access denied or account not found.' });
        }

        const customerEmail = accResult.rows[0].email;
        if (!customerEmail) {
            return res.status(400).json({ message: 'No email associated with your profile.' });
        }

        let whereClauses = ['t.account_id = $1'];
        const params = [accountId];
        if (fromDate) { whereClauses.push("t.transaction_date::date >= $2"); params.push(fromDate); }
        if (toDate) { const pos = params.length + 1; whereClauses.push(`t.transaction_date::date <= $${pos}`); params.push(toDate); }

        const txnsResult = await query(
            `SELECT t.transaction_id, t.transaction_type, t.amount, t.balance_after,
                    t.transaction_date, t.description
             FROM TRANSACTIONS t
             WHERE ${whereClauses.join(' AND ')}
             ORDER BY t.transaction_date DESC
             LIMIT 200`,
            params
        );

        const pdfBuffer = await generateStatementPDF(accResult.rows[0], txnsResult.rows);

        const attachments = [{
            filename: `Statement-${accountId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
        }];

        const emailHtml = templates.update(accResult.rows[0].full_name || 'Customer', 'Your requested account statement is attached below. You can also view your transaction history anytime through the digital banking dashboard.');

        await sendEmail(
            customerEmail,
            'Safe Vault - Account Statement',
            emailHtml,
            attachments,
            true
        );

        res.json({ message: 'Statement emailed successfully!' });
    } catch (err) {
        console.error('Email statement error:', err);
        res.status(500).json({ message: 'Could not email statement.' });
    }
});

// POST /api/customer/change-password
router.post('/change-password', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { currentPassword, newPassword, otpCode } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }
    if (!otpCode) {
        return res.status(400).json({ message: 'OTP is required to change password.' });
    }
    try {
        const validation = await verifyOtp(null, req.user.id, otpCode, 'PROFILE_UPDATE');
        if (!validation.valid) {
            if (validation.email) {
                const failHtml = templates.update(req.user.name || 'Customer', `A password change attempt failed. Reason: ${validation.reason}`);
                await sendEmail(validation.email, 'Security Alert: Profile Update Failed', failHtml, [], true).catch(e => console.error(e));
            }
            return res.status(400).json({ message: validation.reason });
        }
        const result = await query(
            `SELECT u.password_hash FROM USERS u
             JOIN CUSTOMERS c ON c.user_id = u.user_id
             WHERE c.customer_id = $1`,
            [getUserId(req)]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const storedHash = result.rows[0].password_hash;
        let isMatch = false;
        try {
            isMatch = await bcrypt.compare(currentPassword, storedHash);
        } catch {
            isMatch = (currentPassword === storedHash);
        }
        if (!isMatch) {
            return res.status(401).json({ message: 'Current password is incorrect.' });
        }
        const newHash = await bcrypt.hash(newPassword, 10);
        await query(
            `UPDATE USERS SET password_hash = $1
             WHERE user_id = (SELECT user_id FROM CUSTOMERS WHERE customer_id = $2)`,
            [newHash, getUserId(req)]
        );
        res.json({ message: 'Password updated successfully.' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ message: 'Could not update password.' });
    }
});


// --- KYC MANAGEMENT ---
// GET /api/customer/kyc
router.get('/kyc', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM KYC_DETAILS WHERE customer_id = $1 ORDER BY created_at DESC`,
            [getUserId(req)]
        );
        res.json({ kycRecords: result.rows });
    } catch (err) {
        console.error('Fetch KYC Error:', err);
        res.status(500).json({ message: 'Could not fetch KYC details.' });
    }
});

// --- DEPOSITS (FD/RD) ---
// GET /api/customer/deposits
router.get('/deposits', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        const custId = getUserId(req);
        // Note: Months between calculation in PG
        const fds = await query(
            `SELECT f.*, 
                    ROUND(principal_amount * POWER(1 + locked_rate/12/100, GREATEST(0, EXTRACT(MONTH FROM age(CURRENT_TIMESTAMP, opened_at)))), 2) AS current_value,
                    ROUND(principal_amount * POWER(1 + locked_rate/12/100, tenure_months), 2) AS projected_value
             FROM FD_ACCOUNTS f WHERE customer_id = $1`,
            [custId]
        );
        const rds = await query(
            `SELECT r.*,
                    ROUND(monthly_instalment * GREATEST(1, instalments_paid) * (1 + (rate/100) * (GREATEST(1, instalments_paid)/24)), 2) AS current_value,
                    ROUND(monthly_instalment * tenure_months * (1 + (rate/100) * (tenure_months/24)), 2) AS projected_value
             FROM RD_ACCOUNTS r WHERE customer_id = $1`,
            [custId]
        );
        res.json({ fixedDeposits: fds.rows, recurringDeposits: rds.rows });
    } catch (err) {
        console.error('Fetch Deposits Error:', err);
        res.status(500).json({ message: 'Could not fetch deposit accounts.' });
    }
});

// POST /api/customer/deposits/closure-otp
router.post('/deposits/closure-otp', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { depositId, type } = req.body; // type: 'FD' or 'RD'
    if (!depositId || !type) return res.status(400).json({ message: 'Deposit ID and type are required.' });

    try {
        // Fetch Customer Email
        const userCheck = await query(
            `SELECT u.user_id, c.email, c.full_name FROM USERS u 
             JOIN CUSTOMERS c ON c.user_id = u.user_id 
             WHERE c.customer_id = $1`,
            [getUserId(req)]
        );

        if (userCheck.rows.length === 0) return res.status(404).json({ message: 'Customer profile not found.' });

        const row = userCheck.rows[0];
        const realUserId = row.user_id;
        const email = row.email;
        const fullName = row.full_name || 'Customer';

        if (!email) return res.status(400).json({ message: 'No email address associated with your profile.' });

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);

        await query(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '10 minutes', 'PENDING')`,
            [realUserId, `CLOSE-${type}-${depositId}`, otpHash, 'DEPOSIT_CLOSURE']
        );

        const emailHtml = templates.update(fullName, `You have requested to close your ${type} account (${depositId}). Your OTP is: <strong>${otpCode}</strong>. This OTP is valid for 10 minutes.`);
        await sendEmail(email, `Suraksha Bank - ${type} Closure OTP`, emailHtml, [], true);

        res.json({ message: 'OTP sent successfully to your registered email.' });
    } catch (err) {
        console.error('Deposit Closure OTP Error:', err);
        res.status(500).json({ message: 'Failed to generate OTP.' });
    }
});

// POST /api/customer/deposits/close-request
router.post('/deposits/close-request', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { depositId, type, otpCode } = req.body;
    if (!depositId || !type || !otpCode) return res.status(400).json({ message: 'Missing parameters.' });

    try {
        const validation = await verifyOtp(null, req.user.id, otpCode, 'DEPOSIT_CLOSURE');
        if (!validation.valid) {
            return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        const payload = JSON.stringify({
            depositId,
            type,
            customerName: req.user.name || 'Customer'
        });

        // Submit to DUAL_APPROVAL_QUEUE
        await query(
            `CALL sp_submit_dual_approval($1, $2, $3)`,
            [type === 'FD' ? 'FD_CLOSURE' : 'RD_CLOSURE', payload, req.user.username]
        );

        res.json({ message: `Closure request for ${type} ${depositId} has been submitted for manager approval.` });
    } catch (err) {
        console.error('Deposit Close Request Error:', err);
        res.status(500).json({ message: 'Failed to submit closure request.' });
    }
});

// --- BENEFICIARY MANAGEMENT ---
// GET /api/customer/beneficiaries
router.get('/beneficiaries', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM SAVED_BENEFICIARIES WHERE customer_id = $1 AND activation_status != 'DELETED'`,
            [getUserId(req)]
        );
        res.json({ beneficiaries: result.rows });
    } catch (err) {
        console.error('Fetch Beneficiaries Error:', err);
        res.status(500).json({ message: 'Could not fetch beneficiaries.' });
    }
});

// POST /api/customer/beneficiaries
router.post('/beneficiaries', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountNo, ifsc, bankName, name, nickName } = req.body;
    try {
        await query(
            `CALL sp_add_beneficiary($1, $2, $3, $4, $5, $6)`,
            [getUserId(req), accountNo, ifsc, bankName, name, nickName]
        );
        res.json({ message: 'Beneficiary added. Cooling period (24h) started.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

// POST /api/customer/beneficiaries/activate
router.post('/beneficiaries/activate', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { beneficiaryId } = req.body;
    try {
        await query(
            `CALL sp_activate_beneficiary($1, $2)`,
            [beneficiaryId, getUserId(req)]
        );
        res.json({ message: 'Beneficiary activated successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

// --- STANDING INSTRUCTIONS ---
// POST /api/customer/standing-instructions
router.post('/standing-instructions', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { debitAccountId, creditReference, type, amount, frequency, startDate, endDate, maxExecutions } = req.body;
    try {
        await query(
            `CALL sp_create_standing_instruction($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10)`,
            [
                getUserId(req), debitAccountId, creditReference,
                type, Number(amount), frequency,
                startDate, endDate || null, maxExecutions || null,
                req.user.session_token // Using session token as reference for created_by
            ]
        );
        res.json({ message: 'Standing instruction created successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

// GET /api/customer/standing-instructions
router.get('/standing-instructions', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM STANDING_INSTRUCTIONS WHERE customer_id = $1 AND status = 'ACTIVE'`,
            [getUserId(req)]
        );
        res.json({ instructions: result.rows });
    } catch (err) {
        console.error('Fetch SI Error:', err);
        res.status(500).json({ message: 'Could not fetch standing instructions.' });
    }
});

// --- CHEQUE BOOK MANAGEMENT ---
// POST /api/customer/cheque/request
router.post('/cheque/request', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, leavesCount } = req.body;
    try {
        const accRes = await query(
            `SELECT home_branch_id FROM ACCOUNTS WHERE account_id = $1 AND customer_id = $2`,
            [accountId, getUserId(req)]
        );
        
        const branchId = accRes.rows[0]?.home_branch_id;

        await query(
            `CALL sp_create_service_request($1, $2, $3, $4)`,
            [
                getUserId(req),
                'OTHER',
                `Requesting ${leavesCount} leaves cheque book for account ${accountId}`,
                branchId
            ]
        );
        res.json({ message: 'Cheque book request submitted as a service request.' });
    } catch (err) {
        console.error('Cheque Request Error:', err);
        res.status(500).json({ message: 'Failed to request cheque book.' });
    }
});

// --- SERVICE REQUESTS ---
// GET /api/customer/service-requests
router.get('/service-requests', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM SERVICE_REQUESTS WHERE customer_id = $1 ORDER BY created_at DESC`,
            [getUserId(req)]
        );
        res.json({ requests: result.rows });
    } catch (err) {
        console.error('Fetch SR Error:', err);
        res.status(500).json({ message: 'Could not fetch service requests.' });
    }
});

// POST /api/customer/service-requests
router.post('/service-requests', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { type, description } = req.body;
    try {
        await query(
            `CALL sp_create_service_request($1, $2, $3)`,
            [getUserId(req), type, description]
        );
        res.json({ message: 'Service request submitted successfully.' });
    } catch (err) {
        console.error('Create SR Error:', err);
        res.status(500).json({ message: 'Failed to submit service request.' });
    }
});

// --- CHEQUE MANAGEMENT ---

// GET /api/customer/cheque/books
// List all cheque books for the customer's accounts
router.get('/cheque/books', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        const result = await query(
            `SELECT cb.*, at.type_name as account_type
             FROM CHEQUE_BOOKS cb
             JOIN ACCOUNTS a ON cb.account_id = a.account_id
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             WHERE a.customer_id = $1
             ORDER BY cb.issued_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch Cheque Books Error:', err);
        res.status(500).json({ message: 'Error fetching cheque books.' });
    }
});

// GET /api/customer/cheque/history/:bookId
// View status of individual cheques (cleared, stopped, etc.) for a specific book
router.get('/cheque/history/:bookId', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    try {
        // Security check: Ensure this book belongs to the customer
        const ownerCheck = await query(
            `SELECT cb.book_id FROM CHEQUE_BOOKS cb 
             JOIN ACCOUNTS a ON cb.account_id = a.account_id 
             WHERE cb.book_id = $1 AND a.customer_id = $2`,
            [req.params.bookId, req.user.id]
        );

        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Access denied or book not found.' });
        }

        const result = await query(
            `SELECT c.*, sp.reason as stop_reason
             FROM CHEQUES c
             LEFT JOIN STOP_PAYMENT_INSTRUCTIONS sp 
               ON (c.cheque_number = sp.cheque_number AND sp.status = 'ACTIVE')
             WHERE c.book_id = $1
             ORDER BY c.cheque_number ASC`,
            [req.params.bookId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch Cheque History Error:', err);
        res.status(500).json({ message: 'Error fetching cheque history.' });
    }
});

// POST /api/customer/cheque/stop
// Request stop payment for a specific cheque number
router.post('/cheque/stop', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, chequeNumber, reason, otpCode } = req.body;
    if (!accountId || !chequeNumber || !reason || !otpCode) {
        return res.status(400).json({ message: 'Missing required fields (accountId, chequeNumber, reason, otpCode).' });
    }

    try {
        // 1. Verify OTP
        const validation = await verifyOtp(null, req.user.id, otpCode, 'TRANSACTION');
        if (!validation.valid) {
            return res.status(400).json({ message: validation.reason || 'Invalid or expired OTP.' });
        }

        // 2. Call sp_record_stop_payment
        await query(
            `CALL sp_record_stop_payment($1, $2, $3, $4)`,
            [chequeNumber, accountId, reason, 'CUSTOMER:' + (req.user.username || req.user.id)]
        );

        res.json({ message: 'Stop payment instruction recorded successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    }
});

module.exports = router;
