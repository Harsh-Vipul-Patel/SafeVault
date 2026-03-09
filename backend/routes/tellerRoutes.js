const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');
const { generateTransactionReceiptPDF } = require('../utils/pdfGenerator');
const { verifyOtp } = require('../utils/otpHelper');
const { mapOracleError } = require('../utils/error_codes');
const { processPendingNotifications } = require('../lib/dispatchEmail');

const getTellerId = (req) => req.user?.id || 'TELLER_DEFAULT';

// POST /api/teller/deposit
// sp_deposit(p_account_id, p_amount, p_teller_id)
router.post('/deposit', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, amount } = req.body;
    if (!accountId || !amount) return res.status(400).json({ message: 'accountId and amount are required.' });
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_deposit(:account_id, :amount, :teller_id); END;`,
            { account_id: accountId, amount: Number(amount), teller_id: getTellerId(req) },
            { autoCommit: true }
        );

        // Process Notifications
        processPendingNotifications(req.user.id, connection).catch(e => console.error('Notif Error:', e));
        // Fetch updated balance
        const bal = await connection.execute(
            `SELECT a.balance, c.email, c.full_name FROM ACCOUNTS a
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = :acc_id`,
            { acc_id: accountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const newBalance = bal.rows[0]?.BALANCE;
        const customerEmail = bal.rows[0]?.EMAIL;
        const customerName = bal.rows[0]?.FULL_NAME || 'Customer';

        const ref = 'DEP-' + Date.now().toString().slice(-8);

        if (customerEmail) {
            const pdfBuffer = await generateTransactionReceiptPDF({
                txn_id: ref,
                ref: ref,
                date: new Date(),
                sender: 'Cash Deposit',
                receiver: customerName,
                type: 'Cash Deposit',
                amount: amount,
                balance: newBalance
            });

            const attachments = [{
                filename: `Receipt-${ref}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }];

            const emailBody = `Dear ${customerName},\n\nWe have successfully received your cash deposit of Rs.${amount}. Please find your official transaction receipt attached.\n\nTransaction Reference: ${ref}\n\nThank you for banking with Suraksha Bank.`;
            await sendEmail(customerEmail, 'Cash Deposit Receipt', emailBody, attachments).catch(e => console.error('Failed to send receipt:', e));
        }

        res.json({
            message: `Deposit of ₹${amount} successful.`,
            ref: ref,
            newBalance
        });
    } catch (err) {
        console.error('Deposit Error:', err);
        const msg = err.message?.includes('ORA-20003') ? 'Account is FROZEN/CLOSED. Cannot deposit.'
            : 'Deposit failed. ' + err.message;
        res.status(500).json({ message: msg });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/withdraw
// sp_withdraw(p_account_id, p_amount, p_teller_id)
router.post('/withdraw', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, amount, customerOtpCode } = req.body;
    if (!accountId || !amount) return res.status(400).json({ message: 'accountId and amount are required.' });
    if (!customerOtpCode) return res.status(400).json({ message: 'Customer OTP is required for withdrawals.' });

    let connection;
    try {
        connection = await oracledb.getConnection();

        // Verify Customer OTP
        const accInfoRes = await connection.execute(
            `SELECT customer_id FROM ACCOUNTS WHERE account_id = :acc_id`, { acc_id: accountId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const customerId = accInfoRes.rows[0]?.CUSTOMER_ID;
        if (!customerId) return res.status(404).json({ message: 'Account not found.' });

        const validation = await verifyOtp(connection, customerId, customerOtpCode, 'TRANSACTION');
        if (!validation.valid) {
            return res.status(400).json({ message: 'OTP Validation Failed: ' + validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        await connection.execute(
            `BEGIN sp_withdraw(:account_id, :amount, :teller_id); END;`,
            { account_id: accountId, amount: Number(amount), teller_id: getTellerId(req) },
            { autoCommit: true }
        );

        // Process Notifications
        processPendingNotifications(req.user.id, connection).catch(e => console.error('Notif Error:', e));
        if (customerId) processPendingNotifications(customerId, connection).catch(e => console.error('Cust Notif Error:', e));
        // Fetch updated balance
        const bal = await connection.execute(
            `SELECT a.balance, c.email, c.full_name FROM ACCOUNTS a
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = :acc_id`,
            { acc_id: accountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const newBalance = bal.rows[0]?.BALANCE;
        const customerEmail = bal.rows[0]?.EMAIL;
        const customerName = bal.rows[0]?.FULL_NAME || 'Customer';

        const ref = 'WDR-' + Date.now().toString().slice(-8);

        if (customerEmail) {
            const pdfBuffer = await generateTransactionReceiptPDF({
                txn_id: ref,
                ref: ref,
                date: new Date(),
                sender: customerName,
                receiver: 'Cash Withdrawal',
                type: 'Cash Withdrawal',
                amount: amount,
                balance: newBalance
            });

            const attachments = [{
                filename: `Receipt-${ref}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }];

            const emailBody = `Dear ${customerName},\n\nA cash withdrawal of Rs.${amount} was made from your account. Please find your official transaction receipt attached.\n\nTransaction Reference: ${ref}\n\nThank you for banking with Suraksha Bank.`;
            await sendEmail(customerEmail, 'Cash Withdrawal Receipt', emailBody, attachments).catch(e => console.error('Failed to send receipt:', e));
        }

        res.json({
            message: `Withdrawal of ₹${amount} successful.`,
            ref: ref,
            newBalance
        });
    } catch (err) {
        console.error('Withdrawal Error:', err);
        const msg = err.message?.includes('ORA-20001') ? 'Insufficient funds. Minimum balance must be maintained.'
            : err.message?.includes('ORA-20003') ? 'Account is FROZEN. Cannot withdraw.'
                : 'Withdrawal failed. ' + err.message;
        res.status(500).json({ message: msg });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/open-account
// sp_open_account(p_customer_id, p_type_id, p_initial_deposit, p_teller_id, p_home_branch_id)
router.post('/open-account', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerId, typeId, initialDeposit } = req.body;
    if (!customerId || !typeId || !initialDeposit) return res.status(400).json({ message: 'customerId, typeId, initialDeposit required.' });
    let connection;
    try {
        connection = await oracledb.getConnection();
        // Get teller's branch
        const branchRes = await connection.execute(
            `SELECT branch_id FROM STAFF WHERE user_id = :uid`,
            { uid: getTellerId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const branchId = branchRes.rows[0]?.BRANCH_ID || 'BRN-MUM-003';
        await connection.execute(
            `BEGIN sp_open_account(:cust_id, :type_id, :deposit, :teller_id, :branch_id); END;`,
            {
                cust_id: customerId,
                type_id: Number(typeId),
                deposit: Number(initialDeposit),
                teller_id: getTellerId(req),
                branch_id: branchId
            },
            { autoCommit: true }
        );
        // Fetch the newly created account
        const newAcc = await connection.execute(
            `SELECT account_id FROM ACCOUNTS
             WHERE customer_id = :cust_id
             ORDER BY created_at DESC
             FETCH FIRST 1 ROWS ONLY`,
            { cust_id: customerId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const accountId = newAcc.rows[0]?.ACCOUNT_ID;
        res.json({ message: 'Account opened successfully.', accountId });
    } catch (err) {
        console.error('Open Account Error:', err);
        res.status(500).json({ message: 'Failed to open account: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/transfer/internal
// sp_internal_transfer(p_sender_account_id, p_receiver_account_id, p_amount, p_initiated_by)
router.post('/transfer/internal', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { fromAccountId, toAccountId, amount, customerOtpCode } = req.body;
    if (!fromAccountId || !toAccountId || !amount) return res.status(400).json({ message: 'fromAccountId, toAccountId, amount required.' });
    if (!customerOtpCode) return res.status(400).json({ message: 'Customer OTP is required for transfers.' });

    let connection;
    try {
        connection = await oracledb.getConnection();

        // Verify Customer OTP
        const accInfoRes = await connection.execute(
            `SELECT customer_id FROM ACCOUNTS WHERE account_id = :acc_id`, { acc_id: fromAccountId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const customerId = accInfoRes.rows[0]?.CUSTOMER_ID;
        if (!customerId) return res.status(404).json({ message: 'Sender account not found.' });

        const validation = await verifyOtp(connection, customerId, customerOtpCode, 'TRANSACTION');
        if (!validation.valid) {
            return res.status(400).json({ message: 'OTP Validation Failed: ' + validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        await connection.execute(
            `BEGIN sp_internal_transfer(:sender, :receiver, :amount, :initiated_by); END;`,
            { sender: fromAccountId, receiver: toAccountId, amount: Number(amount), initiated_by: getTellerId(req) },
            { autoCommit: true }
        );

        // Success Details for Receipts
        const senderRes = await connection.execute(
            `SELECT c.full_name, c.email, a.balance FROM ACCOUNTS a JOIN CUSTOMERS c ON a.customer_id = c.customer_id WHERE a.account_id = :aid`,
            { aid: fromAccountId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const receiverRes = await connection.execute(
            `SELECT c.full_name, c.email, a.balance FROM ACCOUNTS a JOIN CUSTOMERS c ON a.customer_id = c.customer_id WHERE a.account_id = :aid`,
            { aid: toAccountId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const sender = senderRes.rows[0];
        const receiver = receiverRes.rows[0];
        const ref = 'TXN-' + Date.now().toString().slice(-8);

        // Sender Receipt (Debit)
        if (sender?.EMAIL) {
            const senderPdfBuffer = await generateTransactionReceiptPDF({
                txn_id: ref,
                ref: ref,
                date: new Date(),
                sender: sender.FULL_NAME,
                receiver: receiver?.FULL_NAME || toAccountId,
                type: 'Internal Transfer Out',
                amount: amount,
                balance: sender.BALANCE,
                isReceiver: false
            });

            await sendEmail(sender.EMAIL, 'Transaction Successful - Suraksha Bank', `Dear ${sender.FULL_NAME},\n\nYour internal transfer of Rs.${amount} was completed. Please find your official receipt attached.`, [
                { filename: `Suraksha-Receipt-${ref}.pdf`, content: senderPdfBuffer, contentType: 'application/pdf' }
            ]).catch(e => console.error(e));
        }

        // Receiver Receipt (Credit)
        if (receiver?.EMAIL) {
            const receiverPdfBuffer = await generateTransactionReceiptPDF({
                txn_id: ref,
                ref: ref,
                date: new Date(),
                sender: sender.FULL_NAME,
                receiver: receiver.FULL_NAME,
                type: 'Internal Transfer In',
                amount: amount,
                balance: receiver.BALANCE,
                isReceiver: true
            });

            await sendEmail(receiver.EMAIL, 'Funds Received - Suraksha Bank', `Dear ${receiver.FULL_NAME},\n\nYou have received Rs.${amount} from ${sender.FULL_NAME}. Please find your credit confirmation attached.`, [
                { filename: `Suraksha-Credit-Note-${ref}.pdf`, content: receiverPdfBuffer, contentType: 'application/pdf' }
            ]).catch(e => console.error(e));
        }

        res.json({ message: 'Internal transfer completed successfully.', ref });
    } catch (err) {
        console.error('Transfer Error:', err);
        const msg = err.message?.includes('ORA-20001') ? 'Insufficient funds.'
            : err.message?.includes('ORA-20002') ? 'Receiver account is not ACTIVE.'
                : 'Transfer failed: ' + err.message;
        res.status(500).json({ message: msg });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/transfer/external
router.post('/transfer/external', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { fromAccountId, toAccount, ifsc, mode, amount, customerOtpCode } = req.body;
    if (!fromAccountId || !toAccount || !ifsc || !mode || !amount) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    if (!customerOtpCode) return res.status(400).json({ message: 'Customer OTP is required for external transfers.' });

    let connection;
    try {
        connection = await oracledb.getConnection();

        // Verify Customer OTP
        const accRes = await connection.execute(
            `SELECT customer_id FROM ACCOUNTS WHERE account_id = :acc_id`, { acc_id: fromAccountId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const customerId = accRes.rows[0]?.CUSTOMER_ID;
        if (!customerId) return res.status(404).json({ message: 'Sender account not found.' });

        const validation = await verifyOtp(connection, customerId, customerOtpCode, 'TRANSACTION');
        if (!validation.valid) {
            return res.status(400).json({ message: 'OTP Validation Failed: ' + validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        await connection.execute(
            `BEGIN sp_initiate_external_transfer(:account_id, :amount, :ifsc, :acc_no, :mode); END;`,
            { account_id: fromAccountId, amount: Number(amount), ifsc, acc_no: toAccount, mode },
            { autoCommit: true }
        );

        // Success Details
        const senderRes = await connection.execute(
            `SELECT c.full_name, c.email, a.balance FROM ACCOUNTS a JOIN CUSTOMERS c ON a.customer_id = c.customer_id WHERE a.account_id = :aid`,
            { aid: fromAccountId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const sender = senderRes.rows[0];
        const ref = 'EXT-' + Date.now().toString().slice(-6);

        if (sender?.EMAIL) {
            const pdfBuffer = await generateTransactionReceiptPDF({
                txn_id: ref,
                ref: ref,
                date: new Date(),
                sender: sender.full_name || sender.FULL_NAME,
                receiver: `${toAccount} (${mode})`,
                type: 'External Transfer (Pending Approval)',
                amount: amount,
                balance: sender.balance || sender.BALANCE
            });

            await sendEmail(sender.EMAIL, 'External Transfer Queued - Suraksha Bank', `Dear ${sender.FULL_NAME},\n\nYour external transfer of Rs.${amount} has been queued. Receipt attached.`, [{
                filename: `Receipt-${ref}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }]).catch(e => console.error(e));
        }

        res.json({ message: 'External transfer queued. Manager approval required.', ref });
    } catch (err) {
        console.error('External Transfer Error:', err);
        res.status(500).json({ message: 'External transfer failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/teller/lookup?query=ACC-MUM-003-XXX
router.get('/lookup', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: 'query param required.' });
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT c.customer_id, c.full_name, c.email, c.phone,
                    c.pan_number, c.kyc_status,
                    a.account_id, a.account_number, a.status, a.balance,
                    at.type_name
             FROM CUSTOMERS c
             JOIN ACCOUNTS a ON c.customer_id = a.customer_id
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             WHERE UPPER(a.account_id) LIKE UPPER(:q)
                OR UPPER(c.full_name) LIKE UPPER(:q2)
             FETCH FIRST 10 ROWS ONLY`,
            { q: '%' + query + '%', q2: '%' + query + '%' },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ results: result.rows });
    } catch (err) {
        console.error('Lookup Error:', err);
        res.status(500).json({ message: 'Lookup failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/teller/account-types  - all account types from Oracle
router.get('/account-types', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT type_id, type_name, min_balance, interest_rate, description
             FROM ACCOUNT_TYPES
             ORDER BY type_id`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ types: result.rows });
    } catch (err) {
        console.error('Account types error:', err);
        res.status(500).json({ message: 'Could not fetch account types.' });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/teller/daily-report?date=YYYY-MM-DD
// Returns totals + transaction list for the given date (teller's own transactions)
router.get('/daily-report', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { date } = req.query;
    const reportDate = date || new Date().toISOString().slice(0, 10);
    let connection;
    try {
        connection = await oracledb.getConnection();
        // For BRANCH_MANAGER show all; for TELLER show only their transactions
        const role = req.user?.role;
        let whereClause = `TRUNC(t.transaction_date) = TO_DATE(:rdate, 'YYYY-MM-DD')`;
        const binds = { rdate: reportDate };
        if (role === 'TELLER') {
            whereClause += ` AND t.initiated_by = :teller_id`;
            binds.teller_id = getTellerId(req);
        }
        const txns = await connection.execute(
            `SELECT t.transaction_id, t.transaction_ref, t.account_id, t.transaction_type,
                    t.amount, t.balance_after, t.transaction_date, t.description, t.initiated_by
             FROM TRANSACTIONS t
             WHERE ${whereClause}
             ORDER BY t.transaction_date DESC`,
            binds,
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        // Compute summary
        let totalDeposits = 0;
        let totalWithdrawals = 0;
        for (const t of txns.rows) {
            const type = (t.TRANSACTION_TYPE || '').toUpperCase();
            if (type.includes('CREDIT') || type.includes('DEPOSIT')) totalDeposits += Number(t.AMOUNT || 0);
            else if (type.includes('DEBIT') || type.includes('WITHDRAW')) totalWithdrawals += Number(t.AMOUNT || 0);
        }
        res.json({
            date: reportDate,
            summary: {
                totalDeposits,
                totalWithdrawals,
                txnCount: txns.rows.length,
                netFlow: totalDeposits - totalWithdrawals
            },
            transactions: txns.rows
        });
    } catch (err) {
        console.error('Daily report error:', err);
        res.status(500).json({ message: 'Could not generate report: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/teller/queue  - pending service queue
router.get('/queue', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        // Try to get queue from SERVICE_QUEUE table; fall back to empty array if it doesn't exist
        const result = await connection.execute(
            `SELECT q.queue_id, q.token_number, q.customer_name, q.service_type,
                    q.priority, q.status, q.created_at
             FROM SERVICE_QUEUE q
             WHERE q.status = 'WAITING'
             ORDER BY q.priority ASC, q.created_at ASC
             FETCH FIRST 20 ROWS ONLY`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ queue: result.rows });
    } catch (err) {
        // If SERVICE_QUEUE table doesn't exist, return sensible default
        console.warn('Queue fetch - table may not exist:', err.message);
        res.json({ queue: [] });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/submit-queue
router.post('/submit-queue', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerName, serviceType, priority } = req.body;
    if (!customerName || !serviceType) {
        return res.status(400).json({ message: 'customerName and serviceType are required.' });
    }
    let connection;
    try {
        connection = await oracledb.getConnection();
        const token = 'T-' + Date.now().toString().slice(-4);
        await connection.execute(
            `INSERT INTO SERVICE_QUEUE (token_number, customer_name, service_type, priority, status)
             VALUES (:token, :name, :stype, :priority, 'WAITING')`,
            {
                token,
                name: customerName,
                stype: serviceType,
                priority: priority || 2
            },
            { autoCommit: true }
        );
        res.json({ message: 'Added to queue.', token });
    } catch (err) {
        console.error('Submit queue error:', err);
        res.status(500).json({ message: 'Could not add to queue: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/serve-queue/:queueId  — mark customer as served
router.post('/serve-queue/:queueId', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { queueId } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `UPDATE SERVICE_QUEUE SET status = 'SERVED', served_by = :teller, served_at = SYSTIMESTAMP
             WHERE queue_id = :qid AND status IN ('WAITING', 'SERVING')`,
            { teller: getTellerId(req), qid: Number(queueId) },
            { autoCommit: true }
        );
        if (result.rowsAffected === 0) {
            return res.status(404).json({ message: 'Queue entry not found or already served.' });
        }
        res.json({ message: 'Customer marked as served.' });
    } catch (err) {
        console.error('Serve queue error:', err);
        res.status(500).json({ message: 'Could not update queue: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/cancel-queue/:queueId  — cancel a queue entry
router.post('/cancel-queue/:queueId', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { queueId } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `UPDATE SERVICE_QUEUE SET status = 'CANCELLED'
             WHERE queue_id = :qid AND status = 'WAITING'`,
            { qid: Number(queueId) },
            { autoCommit: true }
        );
        if (result.rowsAffected === 0) {
            return res.status(404).json({ message: 'Queue entry not found or not waiting.' });
        }
        res.json({ message: 'Queue entry cancelled.' });
    } catch (err) {
        console.error('Cancel queue error:', err);
        res.status(500).json({ message: 'Could not cancel queue entry: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/teller/statement?accountId=ACC-XXX&fromDate=&toDate=
router.get('/statement', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, fromDate, toDate, range } = req.query;
    if (!accountId) return res.status(400).json({ message: 'accountId is required.' });
    let connection;
    try {
        connection = await oracledb.getConnection();
        let whereClauses = ['t.account_id = :acc_id'];
        const binds = { acc_id: accountId };
        if (fromDate) {
            whereClauses.push(`TRUNC(t.transaction_date) >= TO_DATE(:from_date, 'YYYY-MM-DD')`);
            binds.from_date = fromDate;
        } else if (range === '3m') {
            whereClauses.push(`t.transaction_date >= SYSDATE - 90`);
        } else if (range === 'fytd') {
            whereClauses.push(`t.transaction_date >= TO_DATE(TO_CHAR(SYSDATE,'YYYY')|| '-04-01','YYYY-MM-DD')`);
        } else {
            // Default: last 30 days
            whereClauses.push(`t.transaction_date >= SYSDATE - 30`);
        }
        if (toDate) {
            whereClauses.push(`TRUNC(t.transaction_date) <= TO_DATE(:to_date, 'YYYY-MM-DD')`);
            binds.to_date = toDate;
        }
        const result = await connection.execute(
            `SELECT t.transaction_id, t.transaction_ref, t.transaction_type,
                    t.amount, t.balance_after, t.transaction_date, t.description
             FROM TRANSACTIONS t
             WHERE ${whereClauses.join(' AND ')}
             ORDER BY t.transaction_date DESC
             FETCH FIRST 100 ROWS ONLY`,
            binds,
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        // Also fetch account info
        const accInfo = await connection.execute(
            `SELECT a.account_id, a.account_number, a.balance, a.status,
                    at.type_name,
                    c.full_name AS customer_name
             FROM ACCOUNTS a
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = :acc_id`,
            { acc_id: accountId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({
            account: accInfo.rows[0] || null,
            transactions: result.rows
        });
    } catch (err) {
        console.error('Teller statement error:', err);
        res.status(500).json({ message: 'Could not fetch statement: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});


// --- KYC MANAGEMENT ---
// POST /api/teller/kyc/verify
router.post('/kyc/verify', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerId, docType, docNumber, expiryDate } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_verify_kyc(:cust_id, :type, :num, TO_DATE(:exp, 'YYYY-MM-DD'), :teller); END;`,
            { cust_id: customerId, type: docType, num: docNumber, exp: expiryDate, teller: getTellerId(req) },
            { autoCommit: true }
        );
        res.json({ message: 'KYC verified successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// --- DEPOSITS (FD/RD) ---
// POST /api/teller/deposits/open-fd
router.post('/deposits/open-fd', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerId, linkedAccountId, amount, tenureMonths, rateType } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_open_fd(:cust_id, :acc_id, :amt, :tenure, :rate, :teller); END;`,
            { cust_id: customerId, acc_id: linkedAccountId, amt: Number(amount), tenure: Number(tenureMonths), rate: rateType, teller: getTellerId(req) },
            { autoCommit: true }
        );
        res.json({ message: 'Fixed Deposit opened successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/deposits/open-rd
router.post('/deposits/open-rd', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerId, linkedAccountId, instalmentAmount, tenureMonths } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_open_rd(:cust_id, :acc_id, :amt, :tenure, :teller); END;`,
            { cust_id: customerId, acc_id: linkedAccountId, amt: Number(instalmentAmount), tenure: Number(tenureMonths), teller: getTellerId(req) },
            { autoCommit: true }
        );
        res.json({ message: 'Recurring Deposit opened successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// --- CHEQUE BOOK & STOP PAYMENT ---
// POST /api/teller/cheque/issue
router.post('/cheque/issue', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, leavesCount } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_issue_cheque_book(:acc_id, :leaves, :teller); END;`,
            { acc_id: accountId, leaves: Number(leavesCount), teller: getTellerId(req) },
            { autoCommit: true }
        );
        res.json({ message: 'Cheque book issued successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/cheque/stop
router.post('/cheque/stop', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { chequeNumber, accountId, reason } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_record_stop_payment(:chq, :acc, :reason, :teller); END;`,
            { chq: chequeNumber, acc: accountId, reason, teller: getTellerId(req) },
            { autoCommit: true }
        );
        res.json({ message: 'Stop payment recorded successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/teller/cheque/clear
router.post('/cheque/clear', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { chequeNumber, draweeAccountId, payeeAccountId, amount } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_process_cheque_clearing(:chq, :drawee, :payee, :amt, :teller); END;`,
            { chq: chequeNumber, drawee: draweeAccountId, payee: payeeAccountId, amt: Number(amount), teller: getTellerId(req) },
            { autoCommit: true }
        );
        res.json({ message: 'Cheque cleared successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

// --- SERVICE REQUESTS ---
// GET /api/teller/service-requests/pending
router.get('/service-requests/pending', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        // Get teller's branch
        const branchRes = await connection.execute(
            `SELECT branch_id FROM STAFF WHERE user_id = :uid`,
            { uid: getTellerId(req) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const branchId = branchRes.rows[0]?.BRANCH_ID;

        const result = await connection.execute(
            `SELECT * FROM SERVICE_REQUESTS WHERE branch_id = :bid AND status IN ('PENDING', 'ASSIGNED')`,
            { bid: branchId },
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

// POST /api/teller/service-requests/resolve
router.post('/service-requests/resolve', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { srId, status, notes } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        await connection.execute(
            `BEGIN sp_resolve_service_request(:id, :status, :notes, :teller); END;`,
            { id: Number(srId), status, notes, teller: getTellerId(req) },
            { autoCommit: true }
        );
        res.json({ message: 'Service request resolved successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
