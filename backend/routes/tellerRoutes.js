const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');
const { generateTransactionReceiptPDF } = require('../utils/pdfGenerator');
const { verifyOtp } = require('../utils/otpHelper');
const { mapOracleError } = require('../utils/error_codes');
const { processPendingNotifications } = require('../lib/dispatchEmail');
const { query } = require('../db');
const templates = require('../utils/emailTemplates');

const getTellerId = (req) => req.user?.id || 'TELLER_DEFAULT';

// POST /api/teller/deposit
router.post('/deposit', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, amount } = req.body;
    if (!accountId || !amount) return res.status(400).json({ message: 'accountId and amount are required.' });
    try {
        await query(
            `CALL sp_deposit($1, $2, $3)`,
            [accountId, Number(amount), getTellerId(req)]
        );

        // Process Notifications
        processPendingNotifications(req.user.id, null).catch(e => console.error('Notif Error:', e));
        
        // Fetch updated balance
        const bal = await query(
            `SELECT a.balance, c.email, c.full_name FROM ACCOUNTS a
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = $1`,
            [accountId]
        );
        const newBalance = bal.rows[0]?.balance;
        const customerEmail = bal.rows[0]?.email;
        const customerName = bal.rows[0]?.full_name || 'Customer';

        const ref = 'DEP-' + Date.now().toString().slice(-8);

        if (customerEmail) {
            const pdfBuffer = await generateTransactionReceiptPDF({
                ref: ref,
                date: new Date(),
                sender: 'Cash Deposit',
                receiver: customerName,
                status: 'Cash Deposit — Credit',
                type: 'Cash Deposit',
                source: 'teller',
                procedure: 'sp_deposit()',
                amount: amount,
                balance: newBalance,
                isReceiver: true,
                scopeNote: '✓ IN SCOPE — Handled by sp_deposit() · TRANSACTIONS table · source = TELLER'
            });

            const attachments = [{
                filename: `Receipt-${ref}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }];

            const emailHtml = templates.transaction(customerName, {
                amount,
                ref,
                type: 'Cash Deposit'
            });

            await sendEmail(customerEmail, 'Cash Deposit Receipt - Safe Vault', emailHtml, attachments, true).catch(e => console.error('Failed to send receipt:', e));
        }

        res.json({
            message: `Deposit of ₹${amount} successful.`,
            ref: ref,
            newBalance
        });
    } catch (err) {
        console.error('Deposit Error:', err);
        const mapped = mapOracleError(err);
        res.status(mapped.status || 500).json({ message: mapped.message });
    }
});

// POST /api/teller/withdraw
router.post('/withdraw', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, amount, customerOtpCode } = req.body;
    if (!accountId || !amount) return res.status(400).json({ message: 'accountId and amount are required.' });
    if (!customerOtpCode) return res.status(400).json({ message: 'Customer OTP is required for withdrawals.' });

    try {
        // Verify Customer OTP
        const accInfoRes = await query(
            `SELECT customer_id FROM ACCOUNTS WHERE account_id = $1`, [accountId]
        );
        const customerId = accInfoRes.rows[0]?.customer_id;
        if (!customerId) return res.status(404).json({ message: 'Account not found.' });

        const validation = await verifyOtp(null, customerId, customerOtpCode, 'TRANSACTION');
        if (!validation.valid) {
            return res.status(400).json({ message: 'OTP Validation Failed: ' + validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        await query(
            `CALL sp_withdraw($1, $2, $3)`,
            [accountId, Number(amount), getTellerId(req)]
        );

        // Process Notifications
        processPendingNotifications(req.user.id, null).catch(e => console.error('Notif Error:', e));
        if (customerId) processPendingNotifications(customerId, null).catch(e => console.error('Cust Notif Error:', e));

        // Fetch updated balance
        const bal = await query(
            `SELECT a.balance, c.email, c.full_name FROM ACCOUNTS a
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = $1`,
            [accountId]
        );
        const newBalance = bal.rows[0]?.balance;
        const customerEmail = bal.rows[0]?.email;
        const customerName = bal.rows[0]?.full_name || 'Customer';

        const ref = 'WDR-' + Date.now().toString().slice(-8);

        if (customerEmail) {
            const pdfBuffer = await generateTransactionReceiptPDF({
                ref: ref,
                date: new Date(),
                sender: customerName,
                receiver: 'Cash Withdrawal',
                status: 'Cash Withdrawal — Debit',
                type: 'Cash Withdrawal',
                source: 'teller',
                procedure: 'sp_withdraw()',
                amount: amount,
                balance: newBalance,
                isReceiver: false,
                scopeNote: '✓ IN SCOPE — Handled by sp_withdraw() · TRANSACTIONS table · source = TELLER'
            });

            const attachments = [{
                filename: `Receipt-${ref}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }];

            const emailHtml = templates.transaction(customerName, {
                amount,
                ref,
                type: 'Cash Withdrawal'
            });

            await sendEmail(customerEmail, 'Cash Withdrawal Receipt - Safe Vault', emailHtml, attachments, true).catch(e => console.error('Failed to send receipt:', e));
        }

        res.json({
            message: `Withdrawal of ₹${amount} successful.`,
            ref: ref,
            newBalance
        });
    } catch (err) {
        console.error('Withdrawal Error:', err);
        const mapped = mapOracleError(err);
        res.status(mapped.status || 500).json({ message: mapped.message });
    }
});

// POST /api/teller/open-account
router.post('/open-account', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerId, typeId, initialDeposit } = req.body;
    if (!customerId || !typeId || !initialDeposit) return res.status(400).json({ message: 'customerId, typeId, initialDeposit required.' });
    try {
        // Get teller's branch
        const branchRes = await query(
            `SELECT branch_id FROM EMPLOYEES WHERE employee_id = $1`,
            [getTellerId(req)]
        );
        const branchId = branchRes.rows[0]?.branch_id || 'BRN-MUM-003';
        
        await query(
            `CALL sp_open_account($1, $2, $3, $4, $5)`,
            [customerId, Number(typeId), Number(initialDeposit), getTellerId(req), branchId]
        );

        // Fetch the newly created account
        const newAcc = await query(
            `SELECT account_id FROM ACCOUNTS
             WHERE customer_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [customerId]
        );
        const accountId = newAcc.rows[0]?.account_id;
        res.json({ message: 'Account opened successfully.', accountId });
    } catch (err) {
        console.error('Open Account Error:', err);
        res.status(500).json({ message: 'Failed to open account: ' + err.message });
    }
});

// POST /api/teller/transfer/internal
router.post('/transfer/internal', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { fromAccountId, toAccountId, amount, customerOtpCode } = req.body;
    if (!fromAccountId || !toAccountId || !amount) return res.status(400).json({ message: 'fromAccountId, toAccountId, amount required.' });
    if (!customerOtpCode) return res.status(400).json({ message: 'Customer OTP is required for transfers.' });

    try {
        // Verify Customer OTP
        const accInfoRes = await query(
            `SELECT customer_id FROM ACCOUNTS WHERE account_id = $1`, [fromAccountId]
        );
        const customerId = accInfoRes.rows[0]?.customer_id;
        if (!customerId) return res.status(404).json({ message: 'Sender account not found.' });

        const validation = await verifyOtp(null, customerId, customerOtpCode, 'TRANSACTION');
        if (!validation.valid) {
            return res.status(400).json({ message: 'OTP Validation Failed: ' + validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        // 1. Fetch High Value Threshold
        const configRes = await query(`SELECT config_value FROM SYSTEM_CONFIG WHERE config_key = 'HIGH_VALUE_THRESHOLD'`);
        const threshold = Number(configRes.rows[0]?.config_value || 200000);

        // Fetch Accounts for dual approval logic
        const accountsRes = await query(
            `SELECT account_id, customer_id FROM ACCOUNTS WHERE account_id IN ($1, $2)`,
            [fromAccountId, toAccountId]
        );

        const senderAcc = accountsRes.rows.find(r => r.account_id === fromAccountId);
        const receiverAcc = accountsRes.rows.find(r => r.account_id === toAccountId);

        if (!senderAcc) return res.status(404).json({ message: 'Sender account not found.' });
        if (!receiverAcc) return res.status(404).json({ message: 'Receiver account not found.' });

        const isHighValue = Number(amount) > threshold;

        // 2. Dual Approval Logic
        if (isHighValue) {
            const payload = JSON.stringify({
                fromAccountId,
                toAccountId,
                amount: Number(amount),
                senderName: senderAcc.customer_id,
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
            [fromAccountId, toAccountId, Number(amount), getTellerId(req)]
        );

        // Success Details for Receipts
        const senderRes = await query(
            `SELECT c.full_name, c.email, a.balance FROM ACCOUNTS a JOIN CUSTOMERS c ON a.customer_id = c.customer_id WHERE a.account_id = $1`,
            [fromAccountId]
        );
        const receiverRes = await query(
            `SELECT c.full_name, c.email, a.balance FROM ACCOUNTS a JOIN CUSTOMERS c ON a.customer_id = c.customer_id WHERE a.account_id = $1`,
            [toAccountId]
        );

        const sender = senderRes.rows[0];
        const receiver = receiverRes.rows[0];
        const ref = 'TXN-' + Date.now().toString().slice(-8);

        // (PDF generation simplified for teller context for now)
        res.json({ message: 'Internal transfer completed successfully.', ref });
    } catch (err) {
        console.error('Transfer Error:', err);
        const mapped = mapOracleError(err);
        res.status(mapped.status || 500).json({ message: mapped.message });
    }
});

// POST /api/teller/transfer/external
router.post('/transfer/external', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { fromAccountId, toAccount, ifsc, mode, amount, customerOtpCode } = req.body;
    if (!fromAccountId || !toAccount || !ifsc || !mode || !amount) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    if (!customerOtpCode) return res.status(400).json({ message: 'Customer OTP is required for external transfers.' });

    try {
        // Verify Customer OTP
        const accRes = await query(
            `SELECT customer_id FROM ACCOUNTS WHERE account_id = $1`, [fromAccountId]
        );
        const customerId = accRes.rows[0]?.customer_id;
        if (!customerId) return res.status(404).json({ message: 'Sender account not found.' });

        const validation = await verifyOtp(null, customerId, customerOtpCode, 'TRANSACTION');
        if (!validation.valid) {
            return res.status(400).json({ message: 'OTP Validation Failed: ' + validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        await query(
            `CALL sp_initiate_external_transfer($1, $2, $3, $4, $5)`,
            [fromAccountId, Number(amount), ifsc, toAccount, mode]
        );

        // Success Details (Simplified for teller)
        const ref = 'EXT-' + Date.now().toString().slice(-6);
        res.json({ message: 'External transfer queued. Manager approval required.', ref });
    } catch (err) {
        console.error('External Transfer Error:', err);
        res.status(500).json({ message: 'External transfer failed: ' + err.message });
    }
});

// GET /api/teller/lookup?query=ACC-MUM-003-XXX
router.get('/lookup', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { query: qParam } = req.query;
    if (!qParam) return res.status(400).json({ message: 'query param required.' });
    try {
        const result = await query(
            `SELECT c.customer_id, c.full_name, c.email, c.phone,
                    c.pan_number, c.kyc_status,
                    a.account_id, a.account_number, a.status, a.balance,
                    at.type_name
             FROM CUSTOMERS c
             JOIN ACCOUNTS a ON c.customer_id = a.customer_id
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             WHERE UPPER(a.account_id) LIKE UPPER($1)
                OR UPPER(c.full_name) LIKE UPPER($2)
             LIMIT 10`,
            ['%' + qParam + '%', '%' + qParam + '%']
        );
        res.json({ results: result.rows });
    } catch (err) {
        console.error('Lookup Error:', err)
        res.status(500).json({ message: 'Lookup failed: ' + err.message });
    }
});

// GET /api/teller/account-types
router.get('/account-types', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    try {
        const result = await query(
            `SELECT type_id, type_name, min_balance, interest_rate, description
             FROM ACCOUNT_TYPES
             ORDER BY type_id`
        );
        res.json({ types: result.rows });
    } catch (err) {
        console.error('Account types error:', err);
        res.status(500).json({ message: 'Could not fetch account types.' });
    }
});

// GET /api/teller/daily-report?date=YYYY-MM-DD
router.get('/daily-report', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { date } = req.query;
    const reportDate = date || new Date().toISOString().slice(0, 10);
    try {
        const role = req.user?.role;
        let whereClause = `t.transaction_date::date = $1`;
        const params = [reportDate];
        if (role === 'TELLER') {
            whereClause += ` AND t.initiated_by = $2`;
            params.push(getTellerId(req));
        }
        const txns = await query(
            `SELECT t.transaction_id, t.transaction_ref, t.account_id, t.transaction_type,
                    t.amount, t.balance_after, t.transaction_date, t.description, t.initiated_by
             FROM TRANSACTIONS t
             WHERE ${whereClause}
             ORDER BY t.transaction_date DESC`,
            params
        );
        let totalDeposits = 0;
        let totalWithdrawals = 0;
        for (const t of txns.rows) {
            const type = (t.transaction_type || '').toUpperCase();
            if (type.includes('CREDIT') || type.includes('DEPOSIT')) totalDeposits += Number(t.amount || 0);
            else if (type.includes('DEBIT') || type.includes('WITHDRAW')) totalWithdrawals += Number(t.amount || 0);
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
    }
});

// GET /api/teller/queue
router.get('/queue', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    try {
        const result = await query(
            `SELECT q.queue_id, q.token_number, q.customer_name, q.service_type,
                    q.priority, q.status, q.created_at
             FROM SERVICE_QUEUE q
             WHERE q.status = 'WAITING'
             ORDER BY q.priority ASC, q.created_at ASC
             LIMIT 20`
        );
        res.json({ queue: result.rows });
    } catch (err) {
        console.warn('Queue fetch - table may not exist:', err.message);
        res.json({ queue: [] });
    }
});

// POST /api/teller/submit-queue
router.post('/submit-queue', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerName, serviceType, priority } = req.body;
    if (!customerName || !serviceType) {
        return res.status(400).json({ message: 'customerName and serviceType are required.' });
    }
    try {
        const token = 'T-' + Date.now().toString().slice(-4);
        await query(
            `INSERT INTO SERVICE_QUEUE (token_number, customer_name, service_type, priority, status)
             VALUES ($1, $2, $3, $4, 'WAITING')`,
            [token, customerName, serviceType, priority || 2]
        );
        res.json({ message: 'Added to queue.', token });
    } catch (err) {
        console.error('Submit queue error:', err);
        res.status(500).json({ message: 'Could not add to queue: ' + err.message });
    }
});

// POST /api/teller/serve-queue/:queueId  — mark customer as served
router.post('/serve-queue/:queueId', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { queueId } = req.params;
    try {
        const result = await query(
            `UPDATE SERVICE_QUEUE SET status = 'SERVED', served_by = $1, served_at = CURRENT_TIMESTAMP
             WHERE queue_id = $2 AND status IN ('WAITING', 'SERVING')`,
            [getTellerId(req), Number(queueId)]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Queue entry not found or already served.' });
        }
        res.json({ message: 'Customer marked as served.' });
    } catch (err) {
        console.error('Serve queue error:', err);
        res.status(500).json({ message: 'Could not update queue: ' + err.message });
    }
});

// POST /api/teller/cancel-queue/:queueId  — cancel a queue entry
router.post('/cancel-queue/:queueId', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { queueId } = req.params;
    try {
        const result = await query(
            `UPDATE SERVICE_QUEUE SET status = 'CANCELLED'
             WHERE queue_id = $1 AND status = 'WAITING'`,
            [Number(queueId)]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Queue entry not found or not waiting.' });
        }
        res.json({ message: 'Queue entry cancelled.' });
    } catch (err) {
        console.error('Cancel queue error:', err);
        res.status(500).json({ message: 'Could not cancel queue entry: ' + err.message });
    }
});

// GET /api/teller/statement?accountId=ACC-XXX&fromDate=&toDate=
router.get('/statement', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, fromDate, toDate, range } = req.query;
    if (!accountId) return res.status(400).json({ message: 'accountId is required.' });
    try {
        let whereClauses = ['t.account_id = $1'];
        const params = [accountId];
        let pIdx = 2;

        if (fromDate) {
            whereClauses.push(`t.transaction_date::date >= $${pIdx}`);
            params.push(fromDate);
            pIdx++;
        } else if (range === '3m') {
            whereClauses.push(`t.transaction_date >= CURRENT_DATE - INTERVAL '90 days'`);
        } else if (range === 'fytd') {
            whereClauses.push(`t.transaction_date >= (EXTRACT(YEAR FROM CURRENT_DATE) || '-04-01')::date`);
        } else {
            whereClauses.push(`t.transaction_date >= CURRENT_DATE - INTERVAL '30 days'`);
        }
        
        if (toDate) {
            whereClauses.push(`t.transaction_date::date <= $${pIdx}`);
            params.push(toDate);
            pIdx++;
        }

        const historyRes = await query(
            `SELECT t.transaction_id, t.transaction_ref, t.transaction_type,
                    t.amount, t.balance_after, t.transaction_date, t.description
             FROM TRANSACTIONS t
             WHERE ${whereClauses.join(' AND ')}
             ORDER BY t.transaction_date DESC
             LIMIT 100`,
            params
        );

        const pendingRes = await query(
            `SELECT queue_id, operation_type, payload_json, created_at, status, 'QUEUED-' || queue_id AS transaction_ref
             FROM DUAL_APPROVAL_QUEUE
             WHERE status = 'PENDING' AND operation_type = 'HIGH_VALUE_TRANSFER'`
        );

        const transactions = historyRes.rows.map(r => ({ ...r, status: 'COMPLETED' }));

        const pendingTransactions = pendingRes.rows.filter(r => {
            try {
                const payload = JSON.parse(r.payload_json || '{}');
                return payload.fromAccountId === accountId || payload.toAccountId === accountId;
            } catch (e) { return false; }
        }).map(r => {
            const payload = JSON.parse(r.payload_json);
            return {
                transaction_id: r.queue_id,
                transaction_ref: r.transaction_ref,
                transaction_type: 'QUEUED_TRANSFER',
                amount: payload.amount,
                balance_after: null,
                transaction_date: r.created_at,
                description: `PENDING APPROVAL: Internal Transfer to ${payload.toAccountId}`,
                status: 'PENDING'
            };
        });

        const combined = [...pendingTransactions, ...transactions].sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

        const accInfo = await query(
            `SELECT a.account_id, a.account_number, a.balance, a.status,
                    at.type_name,
                    c.full_name AS customer_name
             FROM ACCOUNTS a
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             WHERE a.account_id = $1`,
            [accountId]
        );
        res.json({
            account: accInfo.rows[0] || null,
            transactions: combined.slice(0, 100)
        });
    } catch (err) {
        console.error('Teller statement error:', err);
        res.status(500).json({ message: 'Could not fetch statement: ' + err.message });
    }
});


// --- KYC MANAGEMENT ---
// POST /api/teller/kyc/verify
router.post('/kyc/verify', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerId, docType, docNumber, expiryDate } = req.body;
    try {
        await query(
            `CALL sp_verify_kyc($1, $2, $3, $4::date, $5)`,
            [customerId, docType, docNumber, expiryDate, getTellerId(req)]
        );
        res.json({ message: 'KYC verified successfully.' });
    } catch (err) {
        console.error('KYC Verify Error:', err);
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

// --- DEPOSITS (FD/RD) ---
// POST /api/teller/deposits/open-fd
router.post('/deposits/open-fd', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerId, linkedAccountId, amount, tenureMonths, rateType } = req.body;
    try {
        await query(
            `CALL sp_open_fd($1, $2, $3, $4, $5, $6)`,
            [customerId, linkedAccountId, Number(amount), Number(tenureMonths), rateType, getTellerId(req)]
        );
        res.json({ message: 'Fixed Deposit opened successfully.' });
    } catch (err) {
        console.error('Open FD Error:', err);
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

// POST /api/teller/deposits/open-rd
router.post('/deposits/open-rd', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { customerId, linkedAccountId, instalmentAmount, tenureMonths } = req.body;
    try {
        await query(
            `CALL sp_open_rd($1, $2, $3, $4, $5)`,
            [customerId, linkedAccountId, Number(instalmentAmount), Number(tenureMonths), getTellerId(req)]
        );
        res.json({ message: 'Recurring Deposit opened successfully.' });
    } catch (err) {
        console.error('Open RD Error:', err);
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

// --- CHEQUE BOOK & STOP PAYMENT ---
// POST /api/teller/cheque/issue
router.post('/cheque/issue', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { accountId, leavesCount, serviceRequestId } = req.body;
    try {
        // 1. Issue Cheque Book
        await query(
            `CALL sp_issue_cheque_book($1, $2, $3)`,
            [accountId, Number(leavesCount), getTellerId(req)]
        );

        // 2. Resolve Service Request if linked
        let resolvedSrId = serviceRequestId;

        if (!resolvedSrId) {
            // Try to find a pending request for this account in the last 7 days
            const srCheck = await query(
                `SELECT sr_id FROM SERVICE_REQUESTS 
                 WHERE (LOWER(description) LIKE '%cheque%book%' OR request_type = 'CHEQUE_BOOK')
                 AND status IN ('PENDING', 'ASSIGNED')
                 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                 LIMIT 1`
            );
            if (srCheck.rows.length > 0) {
                resolvedSrId = srCheck.rows[0].sr_id;
            }
        }

        if (resolvedSrId) {
            await query(
                `CALL sp_resolve_service_request($1, 'RESOLVED', $2, $3)`,
                [Number(resolvedSrId), `Cheque book of ${leavesCount} leaves issued for account ${accountId}.`, getTellerId(req)]
            );
        }

        res.json({
            message: 'Cheque book issued successfully.' + (resolvedSrId ? ` Service Request #${resolvedSrId} resolved.` : ''),
            resolvedRequestId: resolvedSrId
        });
    } catch (err) {
        console.error('Cheque Issue Error:', err);
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

// POST /api/teller/cheque/stop
router.post('/cheque/stop', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { chequeNumber, accountId, reason, customerOtpCode } = req.body;
    if (!chequeNumber || !accountId || !customerOtpCode) {
        return res.status(400).json({ message: 'chequeNumber, accountId and customerOtpCode are required.' });
    }

    try {
        // Fetch customer ID associated with the account
        const accRes = await query(
            `SELECT customer_id FROM ACCOUNTS WHERE account_id = $1`, [accountId]
        );
        const customerId = accRes.rows[0]?.customer_id;
        if (!customerId) return res.status(404).json({ message: 'Account not found.' });

        // Verify Customer OTP
        const validation = await verifyOtp(null, customerId, customerOtpCode, 'TRANSACTION');
        if (!validation.valid) {
            return res.status(400).json({ message: 'OTP Validation Failed: ' + validation.reason, attemptsLeft: validation.attemptsLeft });
        }

        await query(
            `CALL sp_record_stop_payment($1, $2, $3, $4)`,
            [chequeNumber, accountId, reason || 'Stop Payment Requested by Customer', getTellerId(req)]
        );

        // --- Fetch details and send email on success ---
        try {
            const draweeResult = await query(
                `SELECT c.email, c.full_name FROM ACCOUNTS a 
                 JOIN CUSTOMERS c ON a.customer_id = c.customer_id 
                 WHERE a.account_id = $1`,
                [accountId]
            );

            const drawee = draweeResult.rows[0];

            if (drawee?.email) {
                const mailHtml = templates.update(
                    drawee.full_name || 'Customer', 
                    `The stop payment instruction for Cheque Number <b>${chequeNumber}</b> has been successfully recorded and the cheque has been marked as stopped.`
                );
                await sendEmail(drawee.email, 'Cheque Stop Payment Authorized - Safe Vault', mailHtml, [], true).catch(e => console.error('Email Error:', e));
            }
        } catch (emailErr) {
            console.error('Failed to send stop payment email:', emailErr);
        }

        res.json({ message: 'Stop payment recorded successfully.' });
    } catch (err) {
        console.error('Cheque Stop Error:', err);
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

// POST /api/teller/cheque/clear
router.post('/cheque/clear', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { chequeNumber, draweeAccountId, payeeAccountId, amount } = req.body;
    try {
        await query(
            `CALL sp_process_cheque_clearing($1, $2, $3, $4, $5)`,
            [chequeNumber, draweeAccountId, payeeAccountId, Number(amount), getTellerId(req)]
        );

        // --- Fetch details and send emails on success ---
        try {
            const draweeResult = await query(
                `SELECT c.email, c.full_name FROM ACCOUNTS a 
                 JOIN CUSTOMERS c ON a.customer_id = c.customer_id 
                 WHERE a.account_id = $1`,
                [draweeAccountId]
            );
            const payeeResult = await query(
                `SELECT c.email, c.full_name FROM ACCOUNTS a 
                 JOIN CUSTOMERS c ON a.customer_id = c.customer_id 
                 WHERE a.account_id = $1`,
                [payeeAccountId]
            );

            const drawee = draweeResult.rows[0];
            const payee = payeeResult.rows[0];
            const transferRef = 'CHQ-CLR-' + chequeNumber;

            if (drawee?.email) {
                const draweeHtml = templates.transaction(drawee.full_name || 'Customer', {
                    amount: amount,
                    ref: transferRef,
                    type: 'Cheque Cleared (Debit)',
                    sender: drawee.full_name,
                    receiver: payee?.full_name || payeeAccountId
                });
                await sendEmail(drawee.email, 'Cheque Cleared (Debit) - Safe Vault', draweeHtml, [], true).catch(e => console.error('Drawee Email Error:', e));
            }

            if (payee?.email) {
                const payeeHtml = templates.transaction(payee.full_name || 'Customer', {
                    amount: amount,
                    ref: transferRef,
                    type: 'Cheque Deposit (Credit)',
                    sender: drawee?.full_name || draweeAccountId,
                    receiver: payee.full_name
                });
                await sendEmail(payee.email, 'Cheque Cleared (Credit) - Safe Vault', payeeHtml, [], true).catch(e => console.error('Payee Email Error:', e));
            }
        } catch (emailErr) {
            console.error('Failed to send cheque clear emails:', emailErr);
        }

        res.json({ message: 'Cheque cleared successfully.' });
    } catch (err) {
        console.error('Cheque Clearing Error:', err);
        // Map common errors, but handle specifically for insufficient balance/bounce
        if (err.message && (err.message.includes('ORA-20036') || err.message.includes('Insufficient balance'))) {
            try {
                const bal = await query(
                    `SELECT c.email, c.full_name FROM ACCOUNTS a
                     JOIN CUSTOMERS c ON a.customer_id = c.customer_id
                     WHERE a.account_id = $1`,
                    [draweeAccountId]
                );
                const customerEmail = bal.rows[0]?.email;
                const customerName = bal.rows[0]?.full_name || 'Customer';

                if (customerEmail) {
                    const emailHtml = templates.bounce(customerName, chequeNumber, amount);
                    await sendEmail(customerEmail, 'URGENT: Cheque Bounced - Safe Vault', emailHtml, [], true).catch(e => console.error('Bounce Email Error:', e));
                }
            } catch (innerErr) {
                console.error('Failed to process bounce notification:', innerErr);
            }
            return res.status(400).json({ message: 'Insufficient balance — cheque bounced. Notification sent to customer.' });
        }
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

// --- SERVICE REQUESTS ---
// GET /api/teller/service-requests/pending
router.get('/service-requests/pending', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    try {
        // Get teller's branch
        const branchRes = await query(
            `SELECT branch_id FROM EMPLOYEES WHERE employee_id = $1`,
            [getTellerId(req)]
        );
        const branchId = branchRes.rows[0]?.branch_id;

        const result = await query(
            `SELECT * FROM SERVICE_REQUESTS WHERE branch_id = $1 AND status IN ('PENDING', 'ASSIGNED')`,
            [branchId]
        );
        res.json({ requests: result.rows });
    } catch (err) {
        console.error('Fetch SR Error:', err);
        res.status(500).json({ message: 'Could not fetch service requests.' });
    }
});

// POST /api/teller/service-requests/resolve
router.post('/service-requests/resolve', verifyToken, requireRole(['TELLER', 'BRANCH_MANAGER']), async (req, res) => {
    const { srId, status, notes } = req.body;
    try {
        await query(
            `CALL sp_resolve_service_request($1, $2, $3, $4)`,
            [Number(srId), status, notes, getTellerId(req)]
        );
        res.json({ message: 'Service request resolved successfully.' });
    } catch (err) {
        console.error('Resolve SR Error:', err);
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
