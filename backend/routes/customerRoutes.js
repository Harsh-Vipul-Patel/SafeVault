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

const getUserId = (req) => req.user?.id || 'WEB_USER';

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
                    const failBody = `Hello,\n\nYour recent transaction attempt failed.\nReason: ${validation.reason}\nTimestamp: ${new Date().toLocaleString()}`;
                    await sendEmail(validation.email, 'Transaction Failed - Suraksha Bank', failBody).catch(e => console.error(e));
                }
                return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
            }
        }
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
            processPendingNotifications(req.user.id, connection).catch(err => console.error('Notification Dispatch Error:', err));
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
                const timeStr = new Date().toLocaleString();

                // Sender PDF (Debit)
                const senderPdfBuffer = await generateTransactionReceiptPDF({
                    ref: transferRef,
                    date: new Date(),
                    sender: sender ? sender.FULL_NAME : fromAccountId,
                    receiver: receiver ? receiver.FULL_NAME : toAccountId,
                    type: 'Internal Transfer Out',
                    source: 'internal',
                    procedure: 'sp_internal_transfer()',
                    amount: amount,
                    balance: senderBalance,
                    isReceiver: false,
                    isolation: 'SERIALIZABLE + FOR UPDATE',
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
                        type: 'Internal Transfer In',
                        source: 'internal',
                        procedure: 'sp_internal_transfer()',
                        amount: amount,
                        balance: receiver.BALANCE,
                        isReceiver: true,
                        scopeNote: '✓ IN SCOPE — Mirror credit leg of same SP · type = TRANSFER_CREDIT'
                    });
                }

                if (sender?.EMAIL) {
                    const attachments = [{ filename: `Receipt-${transferRef}.pdf`, content: senderPdfBuffer, contentType: 'application/pdf' }];
                    const body = `Hello ${sender.FULL_NAME},\n\nYour internal transfer of Rs.${amount} was successful. Receipt attached.\n\nRef: ${transferRef}`;
                    await sendEmail(sender.EMAIL, 'Transaction Successful - Suraksha Bank', body, attachments).catch(e => console.error('Sender Email Error:', e));
                }
                if (receiver?.EMAIL && receiverPdfBuffer) {
                    const attachments = [{ filename: `Credit-Note-${transferRef}.pdf`, content: receiverPdfBuffer, contentType: 'application/pdf' }];
                    const body = `Hello ${receiver.FULL_NAME},\n\nYou received Rs.${amount} from ${sender ? sender.FULL_NAME : 'a customer'}. Receipt attached.\n\nRef: ${transferRef}`;
                    await sendEmail(receiver.EMAIL, 'Funds Received - Suraksha Bank', body, attachments).catch(e => console.error('Receiver Email Error:', e));
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
                    await sendEmail(validation.email, 'Transfer Failed - Suraksha Bank', failBody).catch(e => console.error(e));
                }
                return res.status(400).json({ message: validation.reason, attemptsLeft: validation.attemptsLeft });
            }
        }
        await connection.execute(
            `BEGIN sp_initiate_external_transfer(:account_id, :amount, :ifsc, :acc_no, :mode); END;`,
            {
                account_id: fromAccountId,
                amount: Number(amount),
                ifsc: ifsc,
                acc_no: toAccount,
                mode: mode
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
                    type: 'External Transfer (Pending)',
                    source: 'external',
                    procedure: 'sp_initiate_external_transfer()',
                    amount: amount,
                    balance: senderBalance,
                    scopeNote: '✓ IN SCOPE — Phase 1 of two-phase external transfer · PENDING_EXTERNAL_TRANSFERS table. Requires Manager Approval.'
                });

                if (sender?.EMAIL) {
                    const attachments = [{ filename: `Receipt-${transferRef}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];
                    const body = `Hello ${sender.FULL_NAME},\n\nYour external transfer of Rs.${amount} to account ${toAccount} has been queued. Receipt attached.\n\nRef: ${transferRef}`;
                    await sendEmail(sender.EMAIL, 'External Transfer Queued - Suraksha Bank', body, attachments).catch(e => console.error('Email Error:', e));
                }
            }
        } catch (postErr) {
            console.error('Post-Transaction logic error (External):', postErr);
        }

        return res.json({ message: 'External transfer queued. Requires manager approval.', ref: transferRef });

    } catch (err) {
        console.error('External Transfer Error:', err);
        res.status(500).json({ message: 'External transfer failed: ' + err.message });
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
        const result = await connection.execute(
            `SELECT t.transaction_id, t.account_id, t.transaction_type, t.amount, t.balance_after,
                    t.transaction_date, t.description, t.transaction_ref
             FROM TRANSACTIONS t
             JOIN ACCOUNTS a ON t.account_id = a.account_id
             WHERE a.customer_id = :cust_id
             ORDER BY t.transaction_date DESC
             FETCH FIRST 10 ROWS ONLY`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ transactions: result.rows });
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

        await sendEmail(
            customerEmail,
            'Suraksha Bank - Account Statement',
            `Dear ${accResult.rows[0].FULL_NAME || 'Customer'},\\n\\nPlease find your requested account statement attached.\\n\\nRegards,\\nSuraksha Bank`,
            attachments
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
                const failBody = `Hello,\n\nYour recent profile update attempt (Password Change) failed.\nReason: ${validation.reason}\nTimestamp: ${new Date().toLocaleString()}`;
                await sendEmail(validation.email, 'Profile Update Failed - Suraksha Bank', failBody).catch(e => console.error(e));
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
        try {
            isMatch = await bcrypt.compare(currentPassword, storedHash);
        } catch {
            // If hash comparison fails (plain text stored), do direct comparison
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
            `SELECT * FROM FD_ACCOUNTS WHERE customer_id = :cust_id`,
            { cust_id: getUserId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const rds = await connection.execute(
            `SELECT * FROM RD_ACCOUNTS WHERE customer_id = :cust_id`,
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
    const { debitAccountId, creditReference, type, amount, frequency, startDate, endDate, maxExecutions } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_create_standing_instruction(:cust_id, :debit, :credit, :type, :amt, :freq, 
                TO_DATE(:start, 'YYYY-MM-DD'), TO_DATE(:end, 'YYYY-MM-DD'), :max, :uid); END;`,
            {
                cust_id: getUserId(req), debit: debitAccountId, credit: creditReference,
                type, amt: Number(amount), freq: frequency,
                start: startDate, end: endDate || null, max: maxExecutions || null,
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
        await connection.execute(
            `BEGIN sp_create_service_request(:cust_id, 'OTHER', :desc); END;`,
            {
                cust_id: getUserId(req),
                desc: `Requesting ${leavesCount} leaves cheque book for account ${accountId}`
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
        await connection.execute(
            `BEGIN sp_create_service_request(:cust_id, :type, :desc); END;`,
            { cust_id: getUserId(req), type, desc: description },
            { autoCommit: true }
        );
        res.json({ message: 'Service request submitted successfully.' });
    } catch (err) {
        console.error('Create SR Error:', err);
        res.status(500).json({ message: 'Failed to submit service request.' });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
