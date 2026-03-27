const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');
const { generateStatementPDF, generateTransactionReceiptPDF } = require('../utils/pdfGenerator');
const { verifyOtp } = require('../utils/otpHelper');
const { mapOracleError } = require('../utils/error_codes');
const { processPendingNotifications } = require('../lib/dispatchEmail');
const templates = require('../utils/emailTemplates');

const getUserId = (req) => req.user?.id || 'WEB_USER';

// POST /api/customer/auth/request-otp-stop
// Called by tellers to request OTP from the customer for stopping a cheque
router.post('/auth/request-otp-stop', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, chequeNumber, reason } = req.body;
    if (!accountId || !chequeNumber) return res.status(400).json({ message: 'accountId and chequeNumber are required.' });

    let connection;
    try {
        connection = await oracledb.getConnection();
        
        // Fetch Customer Email & Details
        const userCheck = await connection.execute(
            `SELECT u.user_id, c.email, c.full_name FROM USERS u 
             JOIN CUSTOMERS c ON c.user_id = u.user_id 
             JOIN ACCOUNTS a ON a.customer_id = c.customer_id
             WHERE a.account_id = :id`,
            { id: accountId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (userCheck.rows.length === 0) return res.status(404).json({ message: 'Account or Customer profile not found.' });

        const row = userCheck.rows[0];
        const realUserId = row.USER_ID;
        const email = row.EMAIL;
        const fullName = row.FULL_NAME || 'Customer';

        if (!email) return res.status(400).json({ message: 'No email address associated with the target profile.' });

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);

        // Expire in 10 minute for cheque stop (higher importance)
        await connection.execute(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES (:user_id, :tx_id, :otp_hash, :purpose, CURRENT_TIMESTAMP + INTERVAL '10' MINUTE, 'PENDING')`,
            {
                user_id: realUserId,
                tx_id: chequeNumber,
                otp_hash: otpHash,
                purpose: 'TRANSACTION'
            },
            { autoCommit: true }
        );

        // Send HTML Email using the specific stop cheque Template
        const emailHtml = templates.stopChequeOtp(fullName, otpCode, chequeNumber, reason || 'Stop Payment Requested by Customer');
        await sendEmail(email, 'Suraksha Bank - Stop Payment Authorization', emailHtml, [], true);

        res.json({ message: 'OTP sent successfully to customer registered email.' });
    } catch (err) {
        console.error('Stop Cheque OTP Error:', err);
        res.status(500).json({ message: 'Failed to generate OTP.' });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/customer/transfer/internal
// Calls: sp_internal_transfer(p_sender_account_id, p_receiver_account_id, p_amount, p_initiated_by)
router.post('/transfer/internal', verifyToken, requireRole(['CUSTOMER', 'TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { fromAccountId, toAccountId, amount, otpCode } = req.body;
    if (!fromAccountId || !toAccountId || !amount) {
        return res.status(400).json({ message: 'fromAccountId, toAccountId, and amount are required.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();

        // Only require OTP if initiated by a CUSTOMER directly
        if (req.user?.role === 'CUSTOMER') {
            if (!otpCode) return res.status(400).json({ message: 'OTP is required for transactions.' });
            const validation = await verifyOtp(connection, req.user.id, otpCode, 'TRANSACTION');

            if (!validation.valid) {
                // Send Failure Email to Sender
                if (validation.email) {
                    const failHtml = templates.update(req.user.name || 'Customer', `A transaction attempt of ₹${amount} failed. Reason: ${validation.reason}`);
                    await sendEmail(validation.email, 'Security Alert: Transaction Failed', failHtml, [], true).catch(e => console.error(e));
                }
                return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
            }
        }
        // 1. Fetch High Value Threshold & Check for Same-Customer Exemption
        const configRes = await connection.execute(
            `SELECT config_value FROM SYSTEM_CONFIG WHERE config_key = 'HIGH_VALUE_THRESHOLD'`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const threshold = Number(configRes.rows[0]?.CONFIG_VALUE || 200000);

        // Fetch Customer IDs for both accounts to check for exemption
        const accountsRes = await connection.execute(
            `SELECT account_id, customer_id FROM ACCOUNTS WHERE account_id IN (:sender, :receiver) OR account_number IN (:sender, :receiver)`,
            { sender: fromAccountId, receiver: toAccountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const senderAcc = accountsRes.rows.find(r => r.ACCOUNT_ID === fromAccountId || r.ACCOUNT_NUMBER === fromAccountId);
        const receiverAcc = accountsRes.rows.find(r => r.ACCOUNT_ID === toAccountId || r.ACCOUNT_NUMBER === toAccountId);

        if (!senderAcc) return res.status(404).json({ message: 'Sender account not found.' });
        if (!receiverAcc) return res.status(404).json({ message: 'Receiver account not found.' });

        const isHighValue = Number(amount) > threshold;

        // 2. Dual Approval Logic: Queue ALL transfers above threshold
        if (isHighValue) {

            const payload = JSON.stringify({
                fromAccountId,
                toAccountId,
                amount: Number(amount),
                senderName: req.user?.name || 'Customer',
                operation: 'INTERNAL_TRANSFER'
            });

            await connection.execute(
                `BEGIN sp_submit_dual_approval(:op, :payload, :req_by); END;`,
                {
                    op: 'HIGH_VALUE_TRANSFER',
                    payload: payload,
                    req_by: req.user.username // Corrected: pass username to handle RAW user_id lookup in SP
                },
                { autoCommit: true }
            );

            const ref = 'QUEUED-' + Date.now().toString().slice(-6);

            // --- Post-Transaction Non-Critical Logic: Email Notification for Pending Transfer ---
            try {
                if (req.user?.role === 'CUSTOMER') {
                    const senderResult = await connection.execute(
                        `SELECT email, full_name FROM CUSTOMERS WHERE customer_id = :id`, [req.user.id], { outFormat: oracledb.OUT_FORMAT_OBJECT }
                    );
                    const sender = senderResult.rows[0];
                    if (sender?.EMAIL) {
                        const senderHtml = templates.pendingApproval(sender.FULL_NAME, {
                            amount,
                            ref: ref,
                            type: 'Internal Transfer',
                            receiver: toAccountId
                        });
                        await sendEmail(sender.EMAIL, 'Transfer Queued for Approval - Safe Vault', senderHtml, [], true).catch(e => console.error('Email Error:', e));
                    }
                }
            } catch (postErr) {
                console.error('Post-Transaction logic error (Internal High Value):', postErr);
            }

            return res.json({
                message: `Transfer of ₹${amount} exceeds threshold and has been queued for manager approval.`,
                status: 'PENDING_APPROVAL',
                isHighValue: true,
                ref: ref
            });
        }

        // 3. Regular Transfer (Below threshold or Same Customer)
        await connection.execute(
            `BEGIN sp_internal_transfer(:sender, :receiver, :amount, :initiated_by); END;`,
            {
                sender: fromAccountId,
                receiver: toAccountId,
                amount: Number(amount),
                initiated_by: getUserId(req)
            },
            { autoCommit: true }
        );


        // --- Process Notifications ---
        if (req.user?.id) {
            await processPendingNotifications(req.user.id, connection, false).catch(err => console.error('Notification Dispatch Error:', err));
        }

        const transferRef = 'TXN-' + Date.now().toString().slice(-8);

        // --- Post-Transaction Non-Critical Logic ---
        try {
            if (req.user?.role === 'CUSTOMER') {
                const senderResult = await connection.execute(
                    `SELECT email, full_name FROM CUSTOMERS WHERE customer_id = :id`, [req.user.id], { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );

                // Flexible Receiver Lookup (matches SP logic)
                const receiverResult = await connection.execute(
                    `SELECT c.email, c.full_name, a.balance, a.account_number 
                     FROM ACCOUNTS a 
                     JOIN CUSTOMERS c ON a.customer_id = c.customer_id 
                     WHERE a.account_id = :acc OR a.account_number = :acc`,
                    { acc: toAccountId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );

                const senderBalRes = await connection.execute(
                    `SELECT balance FROM ACCOUNTS WHERE account_id = :acc`, [fromAccountId], { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );

                const sender = senderResult.rows[0];
                const receiver = receiverResult.rows[0];
                const senderBalance = senderBalRes.rows[0]?.BALANCE;

                // Sender PDF (Debit)
                const senderPdfBuffer = await generateTransactionReceiptPDF({
                    ref: transferRef,
                    date: new Date(),
                    sender: sender ? sender.FULL_NAME : fromAccountId,
                    receiver: receiver ? receiver.FULL_NAME : toAccountId,
                    status: 'INTERNAL TRANSFER — DEBIT',
                    type: 'Internal Transfer Out',
                    source: 'internal',
                    procedure: 'sp_internal_transfer()',
                    isolation: 'SERIALIZABLE + FOR UPDATE',
                    auth: 'OTP VERIFIED (Authenticated session)',
                    amount: amount,
                    balance: senderBalance,
                    isReceiver: false,
                    scopeNote: '✓ IN SCOPE — Handled by sp_internal_transfer() · TRANSACTIONS table · type = TRANSFER_DEBIT'
                });

                // Receiver PDF (Credit)
                let receiverPdfBuffer;
                if (receiver) {
                    receiverPdfBuffer = await generateTransactionReceiptPDF({
                        ref: transferRef,
                        date: new Date(),
                        sender: sender ? sender.FULL_NAME : fromAccountId,
                        receiver: receiver.FULL_NAME,
                        status: 'INTERNAL TRANSFER — CREDIT',
                        type: 'Internal Transfer In',
                        source: 'internal',
                        procedure: 'sp_internal_transfer()',
                        auth: 'SECURE LEDGER CREDIT (Automated)',
                        amount: amount,
                        balance: receiver.BALANCE,
                        isReceiver: true,
                        scopeNote: '✓ IN SCOPE — Mirror credit leg of same SP · type = TRANSFER_CREDIT'
                    });
                }

                if (sender?.EMAIL) {
                    const attachments = [{ filename: `Receipt-${transferRef}.pdf`, content: senderPdfBuffer, contentType: 'application/pdf' }];
                    const senderHtml = templates.transaction(sender.FULL_NAME, {
                        amount,
                        ref: transferRef,
                        type: 'Internal Transfer Out'
                    });
                    await sendEmail(sender.EMAIL, 'Transaction Successful - Safe Vault', senderHtml, attachments, true).catch(e => console.error('Sender Email Error:', e));
                }
                if (receiver?.EMAIL && receiverPdfBuffer) {
                    const attachments = [{ filename: `Credit-Note-${transferRef}.pdf`, content: receiverPdfBuffer, contentType: 'application/pdf' }];
                    const receiverHtml = templates.transaction(receiver.FULL_NAME, {
                        amount,
                        ref: transferRef,
                        type: 'Internal Transfer In'
                    });
                    await sendEmail(receiver.EMAIL, 'Funds Received - Suraksha Bank', receiverHtml, attachments, true).catch(e => console.error('Receiver Email Error:', e));
                }
            }
        } catch (postErr) {
            console.error('Post-Transaction logic error (ignored for UX):', postErr);
        }

        return res.json({ message: 'Internal transfer completed successfully.', ref: transferRef });

    } catch (err) {
        console.error('Internal Transfer Error:', err);
        const msg = err.message?.includes('ORA-20001') ? 'Insufficient funds for transfer.'
            : err.message?.includes('ORA-20002') ? 'Receiver account is not ACTIVE.'
                : err.message?.includes('ORA-20004') ? 'Sender account not found.'
                    : err.message?.includes('ORA-20005') ? 'Receiver account not found.'
                        : 'Transfer failed. Please contact support.';
        res.status(500).json({ message: msg });
    } finally {
        if (connection) await connection.close();
    }
});


// POST /api/customer/transfer/external
// Calls: sp_initiate_external_transfer
router.post('/transfer/external', verifyToken, requireRole(['CUSTOMER', 'TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { fromAccountId, toAccount, ifsc, mode, amount, otpCode } = req.body;
    if (!fromAccountId || !toAccount || !ifsc || !mode || !amount) {
        return res.status(400).json({ message: 'All fields required.' });
    }
    let connection;
    try {
        connection = await oracledb.getConnection();

        if (req.user?.role === 'CUSTOMER') {
            if (!otpCode) return res.status(400).json({ message: 'OTP is required for transactions.' });
            const validation = await verifyOtp(connection, req.user.id, otpCode, 'TRANSACTION');
            if (!validation.valid) {
                if (validation.email) {
                    const failBody = `Hello,\n\nYour recent external transfer attempt failed.\nReason: ${validation.reason}\nTimestamp: ${new Date().toLocaleString()}`;
                    await sendEmail(validation.email, 'Transfer Failed - Safe Vault', failBody).catch(e => console.error(e));
                }
                return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
            }
        }
        await connection.execute(
            `BEGIN sp_initiate_external_transfer(:account_id, :amount, :ifsc, :acc_no, :mode, :initiated_by); END;`,
            {
                account_id: fromAccountId,
                amount: Number(amount),
                ifsc: ifsc,
                acc_no: toAccount,
                mode: mode,
                initiated_by: getUserId(req)
            },
            { autoCommit: true }
        );

        const transferRef = 'EXT-PEND-' + Date.now().toString().slice(-6);

        // --- Post-Transaction Non-Critical Logic ---
        try {
            if (req.user?.role === 'CUSTOMER') {
                const senderResult = await connection.execute(
                    `SELECT email, full_name FROM CUSTOMERS WHERE customer_id = :id`, [req.user.id], { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );

                const senderBalRes = await connection.execute(
                    `SELECT balance FROM ACCOUNTS WHERE account_id = :acc`, [fromAccountId], { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );

                const sender = senderResult.rows[0];
                const senderBalance = senderBalRes.rows[0]?.BALANCE;

                // PDF Receipt
                const pdfBuffer = await generateTransactionReceiptPDF({
                    ref: transferRef,
                    date: new Date(),
                    sender: sender ? sender.FULL_NAME : fromAccountId,
                    receiver: `${toAccount} (${mode})`,
                    status: `${mode} TRANSFER INITIATED`,
                    type: 'External Transfer (Pending)',
                    source: 'external',
                    mode: mode,
                    procedure: 'sp_initiate_external_transfer()',
                    auth: 'OTP VERIFIED (Customer Session)',
                    amount: amount,
                    balance: senderBalance,
                    scopeNote: `✓ IN SCOPE — Phase 1 of two-phase external transfer · PENDING_EXTERNAL_TRANSFERS table. Mode = ${mode}. Requires Manager Approval.`
                });

                if (sender?.EMAIL) {
                    const attachments = [{ filename: `Receipt-${transferRef}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];
                    const senderHtml = templates.pendingApproval(sender.FULL_NAME, {
                        amount,
                        ref: transferRef,
                        type: 'External Transfer',
                        receiver: `${toAccount} (${mode})`
                    });
                    await sendEmail(sender.EMAIL, 'External Transfer Queued - Safe Vault', senderHtml, attachments, true).catch(e => console.error('Email Error:', e));
                }
            }
        } catch (postErr) {
            console.error('Post-Transaction logic error (External):', postErr);
        }

        // Process pending DB notifications (EXT_TXN_INITIATED)
        if (req.user?.id) {
            await processPendingNotifications(req.user.id, connection, true).catch(err => console.error('Notification Dispatch Error for EXT:', err));
        }

        return res.json({ message: 'External transfer queued. Requires manager approval.', ref: transferRef });

    } catch (err) {
        console.error('External Transfer Error:', err);
        const error = mapOracleError(err);
        res.status(error.status).json({ message: 'External transfer failed: ' + error.message });
    } finally {
        if (connection) await connection.close();
    }
});


// GET /api/customer/accounts  - fetches own accounts
router.get('/accounts', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT a.account_id, a.account_number, at.type_name, a.balance, a.status,
                    a.minimum_balance, a.nominee_name, at.interest_rate, b.branch_name
             FROM ACCOUNTS a
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             JOIN BRANCHES b ON a.home_branch_id = b.branch_id
             WHERE a.customer_id = :cust_id`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ accounts: result.rows });
    } catch (err) {
        console.error('Fetch accounts error:', err);
        res.status(500).json({ message: 'Could not fetch accounts.' });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/customer/transactions  - recent 10 transactions
router.get('/transactions', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const custId = getUserId(req);

        // Fetch completed transactions
        const historyRes = await connection.execute(
            `SELECT t.transaction_id, t.account_id, t.transaction_type, t.amount, t.balance_after,
                    t.transaction_date, t.description, t.transaction_ref
             FROM TRANSACTIONS t
             JOIN ACCOUNTS a ON t.account_id = a.account_id
             WHERE a.customer_id = :cust_id
             ORDER BY t.transaction_date DESC
             FETCH FIRST 10 ROWS ONLY`,
            { cust_id: custId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Fetch pending dual approvals
        const pendingRes = await connection.execute(
            `SELECT RAWTOHEX(q.queue_id) AS queue_id, q.operation_type, q.payload_json, q.created_at, q.status, 'QUEUED-' || RAWTOHEX(q.queue_id) AS transaction_ref
             FROM DUAL_APPROVAL_QUEUE q
             JOIN CUSTOMERS c ON q.requested_by = c.user_id
             WHERE c.customer_id = :cust_id AND q.status = 'PENDING'`,
            { cust_id: custId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const transactions = historyRes.rows.map(r => ({ ...r, STATUS: 'COMPLETED' }));

        const pendingTransactions = pendingRes.rows.map(r => {
            let payload = {};
            try { payload = JSON.parse(r.PAYLOAD_JSON || '{}'); } catch (e) {}
            return {
                TRANSACTION_ID: r.QUEUE_ID,
                ACCOUNT_ID: payload.fromAccountId || 'N/A',
                TRANSACTION_TYPE: 'INTERNAL_TRANSFER_PENDING',
                AMOUNT: payload.amount || 0,
                BALANCE_AFTER: null,
                TRANSACTION_DATE: r.CREATED_AT,
                DESCRIPTION: `QUEUED: ${payload.operation || 'High-value Transfer'} Pending Manager Approval`,
                TRANSACTION_REF: r.TRANSACTION_REF,
                STATUS: 'PENDING'
            };
        });

        const combined = [...pendingTransactions, ...transactions].sort((a, b) => new Date(b.TRANSACTION_DATE) - new Date(a.TRANSACTION_DATE));

        res.json({ transactions: combined.slice(0, 15) });
    } catch (err) {
        console.error('Fetch transactions error:', err);
        res.status(500).json({ message: 'Could not fetch transactions.' });
    } finally {
        if (connection) await connection.close();
    }
});


// GET /api/customer/profile  - fetch logged-in customer profile
router.get('/profile', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT c.customer_id, c.full_name,
                    c.email, c.phone, c.date_of_birth, c.pan_number,
                    c.kyc_status, c.address,
                    u.username, u.last_login
             FROM CUSTOMERS c
             JOIN USERS u ON c.user_id = u.user_id
             WHERE c.customer_id = :cust_id`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Customer profile not found.' });
        }
        res.json({ profile: result.rows[0] });
    } catch (err) {
        console.error('Fetch profile error:', err);
        res.status(500).json({ message: 'Could not fetch profile.' });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/customer/statements?accountId=&fromDate=&toDate=&limit=50
router.get('/statements', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, fromDate, toDate, limit } = req.query;
    if (!accountId) {
        return res.status(400).json({ message: 'accountId is required.' });
    }
    let connection;
    try {
        connection = await oracledb.getConnection();
        // Verify this account belongs to the logged-in customer
        const ownerCheck = await connection.execute(
            `SELECT a.account_id FROM ACCOUNTS a
             WHERE a.account_id = :acc_id AND a.customer_id = :cust_id`,
            { acc_id: accountId, cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Access denied. Account does not belong to you.' });
        }
        let whereClauses = ['t.account_id = :acc_id'];
        const binds = { acc_id: accountId };
        if (fromDate) {
            whereClauses.push('TRUNC(t.transaction_date) >= TO_DATE(:from_date, \'YYYY-MM-DD\')');
            binds.from_date = fromDate;
        }
        if (toDate) {
            whereClauses.push('TRUNC(t.transaction_date) <= TO_DATE(:to_date, \'YYYY-MM-DD\')');
            binds.to_date = toDate;
        }
        const rowLimit = Math.min(parseInt(limit) || 100, 200);
        const result = await connection.execute(
            `SELECT t.transaction_id, t.transaction_type, t.amount, t.balance_after,
                    t.transaction_date, t.description, t.transaction_ref
             FROM TRANSACTIONS t
             WHERE ${whereClauses.join(' AND ')}
             ORDER BY t.transaction_date DESC
             FETCH FIRST ${rowLimit} ROWS ONLY`,
            binds,
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ transactions: result.rows, accountId });
    } catch (err) {
        console.error('Fetch statements error:', err);
        res.status(500).json({ message: 'Could not fetch statements.' });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/customer/statements/download?accountId=&fromDate=&toDate=
router.get('/statements/download', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, fromDate, toDate } = req.query;
    if (!accountId) return res.status(400).json({ message: 'accountId is required.' });

    let connection;
    try {
        connection = await oracledb.getConnection();

        const accResult = await connection.execute(
            `SELECT a.account_number, c.full_name
             FROM ACCOUNTS a
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = :acc_id AND a.customer_id = :cust_id`,
            { acc_id: accountId, cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (accResult.rows.length === 0) {
            return res.status(403).json({ message: 'Access denied or account not found.' });
        }

        let whereClauses = ['t.account_id = :acc_id'];
        const binds = { acc_id: accountId };
        if (fromDate) { whereClauses.push("TRUNC(t.transaction_date) >= TO_DATE(:from_date, 'YYYY-MM-DD')"); binds.from_date = fromDate; }
        if (toDate) { whereClauses.push("TRUNC(t.transaction_date) <= TO_DATE(:to_date, 'YYYY-MM-DD')"); binds.to_date = toDate; }

        const txnsResult = await connection.execute(
            `SELECT t.transaction_id, t.transaction_type, t.amount, t.balance_after,
                    t.transaction_date, t.description
             FROM TRANSACTIONS t
             WHERE ${whereClauses.join(' AND ')}
             ORDER BY t.transaction_date DESC
             FETCH FIRST 200 ROWS ONLY`,
            binds,
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
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
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/customer/statements/email
router.post('/statements/email', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, fromDate, toDate } = req.body;
    if (!accountId) return res.status(400).json({ message: 'accountId is required.' });

    let connection;
    try {
        connection = await oracledb.getConnection();

        const accResult = await connection.execute(
            `SELECT a.account_number, c.full_name, c.email
             FROM ACCOUNTS a
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = :acc_id AND a.customer_id = :cust_id`,
            { acc_id: accountId, cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (accResult.rows.length === 0) {
            return res.status(403).json({ message: 'Access denied or account not found.' });
        }

        const customerEmail = accResult.rows[0].EMAIL;
        if (!customerEmail) {
            return res.status(400).json({ message: 'No email associated with your profile.' });
        }

        let whereClauses = ['t.account_id = :acc_id'];
        const binds = { acc_id: accountId };
        if (fromDate) { whereClauses.push("TRUNC(t.transaction_date) >= TO_DATE(:from_date, 'YYYY-MM-DD')"); binds.from_date = fromDate; }
        if (toDate) { whereClauses.push("TRUNC(t.transaction_date) <= TO_DATE(:to_date, 'YYYY-MM-DD')"); binds.to_date = toDate; }

        const txnsResult = await connection.execute(
            `SELECT t.transaction_id, t.transaction_type, t.amount, t.balance_after,
                    t.transaction_date, t.description
             FROM TRANSACTIONS t
             WHERE ${whereClauses.join(' AND ')}
             ORDER BY t.transaction_date DESC
             FETCH FIRST 200 ROWS ONLY`,
            binds,
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const pdfBuffer = await generateStatementPDF(accResult.rows[0], txnsResult.rows);

        const attachments = [{
            filename: `Statement-${accountId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
        }];

        const emailHtml = templates.update(accResult.rows[0].FULL_NAME || 'Customer', 'Your requested account statement is attached below. You can also view your transaction history anytime through the digital banking dashboard.');

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
    } finally {
        if (connection) await connection.close();
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
    let connection;
    try {
        connection = await oracledb.getConnection();

        const validation = await verifyOtp(connection, req.user.id, otpCode, 'PROFILE_UPDATE');
        if (!validation.valid) {
            if (validation.email) {
                const failHtml = templates.update(req.user.name || 'Customer', `A password change attempt failed. Reason: ${validation.reason}`);
                await sendEmail(validation.email, 'Security Alert: Profile Update Failed', failHtml, [], true).catch(e => console.error(e));
            }
            return res.status(400).json({ message: validation.reason });
        }
        const result = await connection.execute(
            `SELECT u.password_hash FROM USERS u
             JOIN CUSTOMERS c ON c.user_id = u.user_id
             WHERE c.customer_id = :cust_id`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const storedHash = result.rows[0].PASSWORD_HASH;
        let isMatch = false;

        const bcrypt = require('bcryptjs');
        try {
            if (storedHash.startsWith('$2')) {
                isMatch = await bcrypt.compare(currentPassword, storedHash);
            } else {
                const crypto = require('crypto');
                const sha256 = crypto.createHash('sha256').update(currentPassword).digest('hex');
                isMatch = sha256 === storedHash;
            }
        } catch {
            isMatch = (currentPassword === storedHash);
        }

        if (!isMatch) {
            return res.status(401).json({ message: 'Current password is incorrect.' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await connection.execute(
            `UPDATE USERS SET password_hash = :hash
             WHERE user_id = (SELECT user_id FROM CUSTOMERS WHERE customer_id = :cust_id)`,
            { hash: newHash, cust_id: getUserId(req) },
            { autoCommit: true }
        );
        res.json({ message: 'Password updated successfully.' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ message: 'Could not update password.' });
    } finally {
        if (connection) await connection.close();
    }
});


// --- KYC MANAGEMENT ---
// GET /api/customer/kyc
router.get('/kyc', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT * FROM KYC_DETAILS WHERE customer_id = :cust_id ORDER BY created_at DESC`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ kycRecords: result.rows });
    } catch (err) {
        console.error('Fetch KYC Error:', err);
        res.status(500).json({ message: 'Could not fetch KYC details.' });
    } finally {
        if (connection) await connection.close();
    }
});

// --- DEPOSITS (FD/RD) ---
// GET /api/customer/deposits
router.get('/deposits', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const fds = await connection.execute(
            `SELECT f.*, 
                    ROUND(principal_amount * POWER(1 + locked_rate/12/100, GREATEST(0, MONTHS_BETWEEN(SYSDATE, opened_at))), 2) AS CURRENT_VALUE,
                    ROUND(principal_amount * POWER(1 + locked_rate/12/100, tenure_months), 2) AS PROJECTED_VALUE
             FROM FD_ACCOUNTS f WHERE customer_id = :cust_id`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const rds = await connection.execute(
            `SELECT r.*,
                    ROUND(monthly_instalment * GREATEST(1, instalments_paid) * (1 + (rate/100) * (GREATEST(1, instalments_paid)/24)), 2) AS CURRENT_VALUE,
                    ROUND(monthly_instalment * tenure_months * (1 + (rate/100) * (tenure_months/24)), 2) AS PROJECTED_VALUE
             FROM RD_ACCOUNTS r WHERE customer_id = :cust_id`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ fixedDeposits: fds.rows, recurringDeposits: rds.rows });
    } catch (err) {
        console.error('Fetch Deposits Error:', err);
        res.status(500).json({ message: 'Could not fetch deposit accounts.' });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/customer/loans — fetch customer's loan applications and accounts
router.get('/loans', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const custId = getUserId(req);

        // Loan applications with account details
        const apps = await connection.execute(
            `SELECT RAWTOHEX(la.loan_app_id) AS loan_app_id,
                    la.loan_type, la.requested_amount, la.tenure_months,
                    la.annual_rate, la.status AS app_status, la.applied_at,
                    lac.loan_account_id, lac.disbursed_amount,
                    lac.outstanding_principal, lac.status AS account_status,
                    lac.disbursed_at
             FROM LOAN_APPLICATIONS la
             LEFT JOIN LOAN_ACCOUNTS lac ON la.loan_app_id = lac.loan_app_id
             WHERE la.customer_id = :cust_id
             ORDER BY la.applied_at DESC`,
            { cust_id: custId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Next due EMIs for active loans
        let emis = [];
        if (apps.rows.length > 0) {
            const loanAccountIds = apps.rows
                .filter(r => r.LOAN_ACCOUNT_ID)
                .map(r => r.LOAN_ACCOUNT_ID);

            if (loanAccountIds.length > 0) {
                const emiResult = await connection.execute(
                    `SELECT es.loan_account_id, es.emi_id, es.emi_number, es.due_date,
                            es.emi_amount, es.principal_component, es.interest_component,
                            es.closing_balance, es.status, es.penalty_amount
                     FROM EMI_SCHEDULE es
                     WHERE es.loan_account_id IN (${loanAccountIds.map((_, i) => ':id' + i).join(',')})
                     ORDER BY es.loan_account_id, es.emi_number ASC`,
                    loanAccountIds.reduce((acc, id, i) => { acc['id' + i] = id; return acc; }, {}),
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
                emis = emiResult.rows;
            }
        }

        res.json({ loanApplications: apps.rows, emiSchedules: emis });
    } catch (err) {
        console.error('Fetch Customer Loans Error:', err);
        res.status(500).json({ message: 'Could not fetch loan details.' });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/customer/loan-request — customer submits a loan application
router.post('/loan-request', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { loanType, requestedAmount, tenureMonths, annualRate } = req.body;

    if (!loanType || !requestedAmount || !tenureMonths) {
        return res.status(400).json({ message: 'Loan type, requested amount, and tenure are required.' });
    }

    const validTypes = ['PERSONAL', 'HOME', 'VEHICLE', 'EDUCATION'];
    if (!validTypes.includes(loanType)) {
        return res.status(400).json({ message: `Invalid loan type. Must be one of: ${validTypes.join(', ')}` });
    }

    if (Number(requestedAmount) <= 0) {
        return res.status(400).json({ message: 'Requested amount must be greater than 0.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();
        const custId = getUserId(req);

        // Get customer's first active account for linked_account_id and branch_id
        const accResult = await connection.execute(
            `SELECT account_id, home_branch_id FROM ACCOUNTS 
             WHERE customer_id = :cust_id AND status = 'ACTIVE'
             ORDER BY opened_date ASC FETCH FIRST 1 ROWS ONLY`,
            { cust_id: custId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (accResult.rows.length === 0) {
            return res.status(400).json({ message: 'No active account found. You need an active account to apply for a loan.' });
        }

        const linkedAccount = accResult.rows[0].ACCOUNT_ID;
        const branchId = accResult.rows[0].HOME_BRANCH_ID;

        // Default annual rate if not provided (will be set by loan manager during review)
        const rate = Number(annualRate) || 10.5;

        const result = await connection.execute(
            `INSERT INTO LOAN_APPLICATIONS (customer_id, branch_id, loan_type, requested_amount, tenure_months, annual_rate, linked_account_id, status)
             VALUES (:cid, :bid, :ltype, :amt, :tenure, :rate, :lnk, 'RECEIVED')
             RETURNING RAWTOHEX(loan_app_id) INTO :appid`,
            {
                cid: custId,
                bid: branchId,
                ltype: loanType,
                amt: Number(requestedAmount),
                tenure: Number(tenureMonths),
                rate: rate,
                lnk: linkedAccount,
                appid: { type: oracledb.STRING, dir: oracledb.BIND_OUT }
            },
            { autoCommit: true }
        );

        // Send notification
        try {
            const custRes = await connection.execute(
                `SELECT full_name, user_id FROM CUSTOMERS WHERE customer_id = :cid`,
                { cid: custId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (custRes.rows.length > 0) {
                const v_json = JSON.stringify({
                    customer_name: custRes.rows[0].FULL_NAME,
                    loan_type: loanType,
                    amount: requestedAmount
                });
                await connection.execute(
                    `INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
                     VALUES (:cid, :uid, 'LOAN_APPLIED', 'EMAIL', :msg)`,
                    { cid: custId, uid: custRes.rows[0].USER_ID, msg: v_json },
                    { autoCommit: true }
                );
            }
        } catch (notifErr) {
            console.error('Loan notification error (non-critical):', notifErr.message);
        }

        res.json({ 
            message: 'Loan application submitted successfully! It will be reviewed by the loan manager.',
            loanAppId: result.outBinds.appid[0]
        });
    } catch (err) {
        console.error('Loan Request Error:', err);
        res.status(500).json({ message: 'Failed to submit loan application: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/customer/deposits/closure-otp
router.post('/deposits/closure-otp', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { depositId, type } = req.body; // type: 'FD' or 'RD'
    if (!depositId || !type) return res.status(400).json({ message: 'Deposit ID and type are required.' });

    let connection;
    try {
        connection = await oracledb.getConnection();
        
        // Fetch Customer Email
        const userCheck = await connection.execute(
            `SELECT u.user_id, c.email, c.full_name FROM USERS u 
             JOIN CUSTOMERS c ON c.user_id = u.user_id 
             WHERE c.customer_id = :cust_id`,
            { cust_id: getUserId(req) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (userCheck.rows.length === 0) return res.status(404).json({ message: 'Customer profile not found.' });

        const row = userCheck.rows[0];
        const realUserId = row.USER_ID;
        const email = row.EMAIL;
        const fullName = row.FULL_NAME || 'Customer';

        if (!email) return res.status(400).json({ message: 'No email address associated with your profile.' });

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);

        await connection.execute(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES (:user_id, :tx_id, :otp_hash, :purpose, CURRENT_TIMESTAMP + INTERVAL '10' MINUTE, 'PENDING')`,
            {
                user_id: realUserId,
                tx_id: `CLOSE-${type}-${depositId}`,
                otp_hash: otpHash,
                purpose: 'DEPOSIT_CLOSURE'
            },
            { autoCommit: true }
        );

        const emailHtml = templates.update(fullName, `You have requested to close your ${type} account (${depositId}). Your OTP is: <strong>${otpCode}</strong>. This OTP is valid for 10 minutes.`);
        await sendEmail(email, `Suraksha Bank - ${type} Closure OTP`, emailHtml, [], true);

        res.json({ message: 'OTP sent successfully to your registered email.' });
    } catch (err) {
        console.error('Deposit Closure OTP Error:', err);
        res.status(500).json({ message: 'Failed to generate OTP.' });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/customer/deposits/close-request
router.post('/deposits/close-request', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { depositId, type, otpCode } = req.body;
    if (!depositId || !type || !otpCode) return res.status(400).json({ message: 'Missing parameters.' });

    let connection;
    try {
        connection = await oracledb.getConnection();
        
        const validation = await verifyOtp(connection, req.user.id, otpCode, 'DEPOSIT_CLOSURE');
        if (!validation.valid) {
            return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        const payload = JSON.stringify({
            depositId,
            type,
            customerName: req.user.name || 'Customer'
        });

        // Submit to DUAL_APPROVAL_QUEUE
        await connection.execute(
            `BEGIN sp_submit_dual_approval(:op, :payload, :req_by); END;`,
            {
                op: type === 'FD' ? 'FD_CLOSURE' : 'RD_CLOSURE',
                payload: payload,
                req_by: req.user.username
            },
            { autoCommit: true }
        );

        res.json({ message: `Closure request for ${type} ${depositId} has been submitted for manager approval.` });
    } catch (err) {
        console.error('Deposit Close Request Error:', err);
        res.status(500).json({ message: 'Failed to submit closure request.' });
    } finally {
        if (connection) await connection.close();
    }
});

// --- BENEFICIARY MANAGEMENT ---
// GET /api/customer/beneficiaries
router.get('/beneficiaries', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT * FROM SAVED_BENEFICIARIES WHERE customer_id = :cust_id AND activation_status != 'DELETED'`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ beneficiaries: result.rows });
    } catch (err) {
        console.error('Fetch Beneficiaries Error:', err);
        res.status(500).json({ message: 'Could not fetch beneficiaries.' });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/customer/beneficiaries
router.post('/beneficiaries', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountNo, ifsc, bankName, name, nickName } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_add_beneficiary(:cust_id, :acc, :ifsc, :bank, :name, :nick); END;`,
            {
                cust_id: getUserId(req), acc: accountNo, ifsc,
                bank: bankName, name, nick: nickName
            },
            { autoCommit: true }
        );
        res.json({ message: 'Beneficiary added. Cooling period (24h) started.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/customer/beneficiaries/activate
router.post('/beneficiaries/activate', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { beneficiaryId } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_activate_beneficiary(:id, :cust_id); END;`,
            { id: beneficiaryId, cust_id: getUserId(req) },
            { autoCommit: true }
        );
        res.json({ message: 'Beneficiary activated successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// --- STANDING INSTRUCTIONS ---
// POST /api/customer/standing-instructions
router.post('/standing-instructions', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { fromAccountId, creditReference, toAccountId, type, amount, frequency, startDate, nextRun, endDate, maxExecutions } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_create_standing_instruction(:cust_id, :debit, :credit, :type, :amt, :freq, 
                TO_DATE(:start, 'YYYY-MM-DD'), TO_DATE(:end, 'YYYY-MM-DD'), :max, :uid); END;`,
            {
                cust_id: getUserId(req), debit: fromAccountId || req.body.debitAccountId, credit: toAccountId || creditReference,
                type: type || 'INTERNAL_TRANSFER', amt: Number(amount), freq: frequency,
                start: nextRun || startDate, end: endDate || null, max: maxExecutions || null,
                uid: req.user.session_token // Using session token as reference for created_by
            },
            { autoCommit: true }
        );
        res.json({ message: 'Standing instruction created successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/customer/standing-instructions
router.get('/standing-instructions', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT * FROM STANDING_INSTRUCTIONS WHERE customer_id = :cust_id AND status = 'ACTIVE'`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ instructions: result.rows });
    } catch (err) {
        console.error('Fetch SI Error:', err);
        res.status(500).json({ message: 'Could not fetch standing instructions.' });
    } finally {
        if (connection) await connection.close();
    }
});

// --- CHEQUE BOOK MANAGEMENT ---
// POST /api/customer/cheque/request
router.post('/cheque/request', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, leavesCount } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        // Since we don't have a separate table for 'Requests', we can either:
        // 1. Directly issue it (if policy allows)
        // 2. Create a Service Request of type 'CHEQUE_BOOK'
        // Fetch the branch ID for the specific account
        const accRes = await connection.execute(
            `SELECT home_branch_id FROM ACCOUNTS WHERE account_id = :aid AND customer_id = :cid`,
            { aid: accountId, cid: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        const branchId = accRes.rows[0]?.HOME_BRANCH_ID;

        await connection.execute(
            `BEGIN sp_create_service_request(:cust_id, 'OTHER', :desc, :bid); END;`,
            {
                cust_id: getUserId(req),
                desc: `Requesting ${leavesCount} leaves cheque book for account ${accountId}`,
                bid: branchId
            },
            { autoCommit: true }
        );
        res.json({ message: 'Cheque book request submitted as a service request.' });
    } catch (err) {
        console.error('Cheque Request Error:', err);
        res.status(500).json({ message: 'Failed to request cheque book.' });
    } finally {
        if (connection) await connection.close();
    }
});

// --- SERVICE REQUESTS ---
// GET /api/customer/service-requests
router.get('/service-requests', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT * FROM SERVICE_REQUESTS WHERE customer_id = :cust_id ORDER BY created_at DESC`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ requests: result.rows });
    } catch (err) {
        console.error('Fetch SR Error:', err);
        res.status(500).json({ message: 'Could not fetch service requests.' });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/customer/service-requests
router.post('/service-requests', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { type, description } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        
        // Retrieve the newly created SR_ID
        const result = await connection.execute(
            `DECLARE
                v_sr_id NUMBER;
             BEGIN
                sp_create_service_request(:cust_id, :type, :desc);
                SELECT MAX(sr_id) INTO v_sr_id FROM SERVICE_REQUESTS WHERE customer_id = :cust_id;
                :out_sr_id := v_sr_id;
             END;`,
            { 
                cust_id: getUserId(req), 
                type, 
                desc: description,
                out_sr_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
            },
            { autoCommit: true }
        );

        const newSrId = result.outBinds.out_sr_id;

        // Fetch user ID to process notifications. getUserId(req) gives the database CUSTOMERS.customer_id.
        await processPendingNotifications(getUserId(req), connection, false).catch(e => console.error('Notification Dispatch Error for SR:', e));

        res.json({ message: 'Service request submitted successfully.', requestId: newSrId });
    } catch (err) {
        console.error('Create SR Error:', err);
        res.status(500).json({ message: 'Failed to submit service request.' });
    } finally {
        if (connection) await connection.close();
    }
});

// --- CHEQUE MANAGEMENT ---

// GET /api/customer/cheque/books
// List all cheque books for the customer's accounts
router.get('/cheque/books', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT cb.*, at.type_name as account_type
             FROM CHEQUE_BOOKS cb
             JOIN ACCOUNTS a ON cb.account_id = a.account_id
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             WHERE a.customer_id = :cust_id
             ORDER BY cb.issued_at DESC`,
            { cust_id: req.user.id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch Cheque Books Error:', err);
        res.status(500).json({ message: 'Error fetching cheque books.' });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/customer/cheque/history/:bookId
// View status of individual cheques (cleared, stopped, etc.) for a specific book
router.get('/cheque/history/:bookId', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();

        // Security check: Ensure this book belongs to the customer
        const ownerCheck = await connection.execute(
            `SELECT cb.book_id FROM CHEQUE_BOOKS cb 
             JOIN ACCOUNTS a ON cb.account_id = a.account_id 
             WHERE cb.book_id = :bid AND a.customer_id = :cid`,
            { bid: req.params.bookId, cid: req.user.id }
        );

        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Access denied or book not found.' });
        }

        const result = await connection.execute(
            `SELECT c.*, sp.reason as stop_reason
             FROM CHEQUES c
             LEFT JOIN STOP_PAYMENT_INSTRUCTIONS sp 
               ON (c.cheque_number = sp.cheque_number AND sp.status = 'ACTIVE')
             WHERE c.book_id = :bid
             ORDER BY c.cheque_number ASC`,
            { bid: req.params.bookId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch Cheque History Error:', err);
        res.status(500).json({ message: 'Error fetching cheque history.' });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/customer/cheque/stop
// Request stop payment for a specific cheque number
router.post('/cheque/stop', verifyToken, requireRole(['CUSTOMER']), async (req, res) => {
    const { accountId, chequeNumber, reason, otpCode } = req.body;
    if (!accountId || !chequeNumber || !reason || !otpCode) {
        return res.status(400).json({ message: 'Missing required fields (accountId, chequeNumber, reason, otpCode).' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();

        // 1. Verify OTP
        const validation = await verifyOtp(connection, req.user.id, otpCode, 'TRANSACTION');
        if (!validation.valid) {
            return res.status(400).json({ message: validation.reason || 'Invalid or expired OTP.' });
        }

        // 2. Call sp_record_stop_payment (reusing teller procedure but setting teller_id as 'SELF')
        await connection.execute(
            `BEGIN sp_record_stop_payment(:chq_num, :acc_id, :reason, :initiator); END;`,
            {
                chq_num: chequeNumber,
                acc_id: accountId,
                reason: reason,
                initiator: 'CUSTOMER:' + (req.user.username || req.user.id)
            },
            { autoCommit: true }
        );

        res.json({ message: 'Stop payment instruction recorded successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
