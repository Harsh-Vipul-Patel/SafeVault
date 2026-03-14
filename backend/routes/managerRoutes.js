const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { processPendingNotifications } = require('../lib/dispatchEmail');
const { mapOracleError } = require('../utils/error_codes');
const { sendEmail } = require('../utils/emailService');
const { generateTransactionReceiptPDF } = require('../utils/pdfGenerator');
const { query } = require('../db');
const templates = require('../utils/emailTemplates');


const MANAGER_ROLES = ['BRANCH_MANAGER', 'SYSTEM_ADMIN'];

// Helper: get manager's branch_id from EMPLOYEES table
async function getManagerBranchId(userId) {
    const result = await query(
        `SELECT e.branch_id, e.employee_id, e.full_name
         FROM EMPLOYEES e
         JOIN USERS u ON e.user_id = u.user_id
         WHERE u.user_id = $1 OR e.employee_id = $2`,
        [userId, userId]
    );
    return result.rows[0] || null;
}

// ============================================================
// GET /api/manager/dashboard
// Branch Overview Dashboard — real KPIs from PostgreSQL
// ============================================================
router.get('/dashboard', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(managerId);
        const branchId = managerInfo?.branch_id;

        let depositsQuery = `SELECT COALESCE(SUM(amount), 0) AS total FROM TRANSACTIONS 
                             WHERE transaction_date::date = CURRENT_DATE 
                             AND transaction_type IN ('CREDIT', 'TRANSFER_CREDIT', 'EXTERNAL_CREDIT', 'INTEREST_CREDIT')`;
        let wQuery = `SELECT COALESCE(SUM(amount), 0) AS total FROM TRANSACTIONS 
                       WHERE transaction_date::date = CURRENT_DATE 
                       AND transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT', 'FEE_DEBIT')`;
        let newAccQuery = `SELECT COUNT(*) AS total FROM ACCOUNTS WHERE created_at::date = CURRENT_DATE`;
        let recentTxnsQuery = `SELECT t.transaction_id, t.transaction_type, t.amount, t.account_id,
                                      t.transaction_date, t.description, t.initiated_by
                                FROM TRANSACTIONS t`;

        const params = [];
        if (branchId) {
            depositsQuery += ` AND branch_id = $1`;
            wQuery += ` AND branch_id = $1`;
            newAccQuery += ` AND home_branch_id = $1`;
            recentTxnsQuery += ` WHERE t.branch_id = $1`;
            params.push(branchId);
        }
        recentTxnsQuery += ` ORDER BY t.transaction_date DESC LIMIT 5`;

        // KPI: Total Deposits (today)
        const deposits = await query(depositsQuery, params);

        // KPI: Total Withdrawals (today)
        const withdrawals = await query(wQuery, params);

        // KPI: Pending Approvals
        const pendingApprovals = await query(
            `SELECT COUNT(*) AS total FROM DUAL_APPROVAL_QUEUE WHERE status = 'PENDING'`
        );

        // KPI: New Accounts (today)
        const newAccounts = await query(newAccQuery, params);

        // Live Feed: Recent transactions + compliance flags
        const recentTxns = await query(recentTxnsQuery, params);

        const recentFlags = await query(
            `SELECT cf.flag_id, cf.flag_type, cf.account_id, cf.flagged_at, cf.threshold_value
             FROM COMPLIANCE_FLAGS cf
             ORDER BY cf.flagged_at DESC
             LIMIT 3`
        );

        // Dual Approval Queue preview (top 3)
        const approvalPreview = await query(
            `SELECT q.queue_id, q.operation_type, q.status, q.created_at, q.payload_json,
                    u.username AS requested_by_name
             FROM DUAL_APPROVAL_QUEUE q
             LEFT JOIN USERS u ON q.requested_by = u.user_id
             WHERE q.status = 'PENDING'
             ORDER BY q.created_at ASC
             LIMIT 3`
        );

        res.json({
            kpis: {
                totalDeposits: deposits.rows[0]?.total || 0,
                totalWithdrawals: withdrawals.rows[0]?.total || 0,
                pendingApprovals: pendingApprovals.rows[0]?.total || 0,
                newAccounts: newAccounts.rows[0]?.total || 0
            },
            approvalPreview: approvalPreview.rows,
            liveFeed: {
                transactions: recentTxns.rows,
                flags: recentFlags.rows
            },
            managerInfo: managerInfo ? {
                name: managerInfo.full_name,
                employeeId: managerInfo.employee_id,
                branchId: managerInfo.branch_id
            } : null
        });
    } catch (err) {
        console.error('Manager Dashboard Error:', err);
        res.status(500).json({ message: 'Failed to load dashboard: ' + err.message });
    }
});


// ============================================================
// GET /api/manager/approvals
// Dual Approval Queue — all pending items
// ============================================================
router.get('/approvals', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const { status } = req.query;
        const filterStatus = status || 'PENDING';

        const result = await query(
            `SELECT q.queue_id, q.operation_type, q.payload_json, q.status,
                    q.created_at, q.reviewed_by, q.reviewed_at, q.review_note,
                    u.username AS requested_by_name
             FROM DUAL_APPROVAL_QUEUE q
             LEFT JOIN USERS u ON q.requested_by = u.user_id
             WHERE q.status = $1
             ORDER BY q.created_at ASC`,
            [filterStatus]
        );

        // Parse payload_json for each row
        const queue = result.rows.map(row => {
            let payload = {};
            try { payload = JSON.parse(row.payload_json || '{}'); } catch (e) { /* ignore */ }
            return {
                queueId: row.queue_id,
                operationType: row.operation_type,
                requestedBy: row.requested_by_name,
                status: row.status,
                createdAt: row.created_at,
                reviewedBy: row.reviewed_by,
                reviewedAt: row.reviewed_at,
                reviewNote: row.review_note,
                payload
            };
        });

        res.json({ queue });
    } catch (err) {
        console.error('Approvals Fetch Error:', err);
        res.status(500).json({ message: 'Failed to fetch approvals: ' + err.message });
    }
});// POST /api/manager/approvals/:id/:action  (APPROVE or REJECT)
router.post('/approvals/:id/:action', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    const { id, action } = req.params;
    const { note } = req.body;
    const validActions = ['approve', 'reject'];
    if (!validActions.includes(action.toLowerCase())) {
        return res.status(400).json({ message: 'Action must be approve or reject.' });
    }

    try {
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(managerId);
        const employeeId = managerInfo?.employee_id || managerId;

        const newStatus = action.toLowerCase() === 'approve' ? 'APPROVED' : 'REJECTED';

        await query(
            `UPDATE DUAL_APPROVAL_QUEUE
             SET status = $1,
                 reviewed_by = $2,
                 reviewed_at = CURRENT_TIMESTAMP,
                 review_note = $3
             WHERE queue_id = $4 AND status = 'PENDING'`,
            [newStatus, employeeId, note || null, id]
        );

        processPendingNotifications(req.user.id, null).catch(e => console.error(e));

        // Log audit entry
        await query(
            `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, new_value_json, change_reason)
             VALUES ('DUAL_APPROVAL_QUEUE', $1, $2, $3, CURRENT_TIMESTAMP, $4, $5)`,
            [id, 'QUEUE_' + newStatus, employeeId, JSON.stringify({ status: newStatus }), note || ('Queue item ' + action.toLowerCase() + 'd by manager')]
        );

        if (newStatus === 'APPROVED') {
            // Fetch queue item to check operation type and payload
            const queueItem = await query(
                `SELECT operation_type, payload_json, requested_by FROM DUAL_APPROVAL_QUEUE WHERE queue_id = $1`,
                [id]
            );

            const item = queueItem.rows[0];
            if (item && item.operation_type === 'HIGH_VALUE_TRANSFER') {
                let payload = {};
                try { payload = JSON.parse(item.payload_json || '{}'); } catch (e) { console.error('Payload Parse Error:', e); }

                if (payload.operation === 'INTERNAL_TRANSFER') {
                    // Execute the actual transfer now that it's approved
                    await query(
                        `CALL sp_internal_transfer($1, $2, $3, $4)`,
                        [payload.fromAccountId, payload.toAccountId, payload.amount, item.requested_by]
                    );

                    // --- Process Receipts after approval ---
                    try {
                        const transferRef = 'TXN-' + Date.now().toString().slice(-8);

                        // Fetch sender (the one who requested the transfer)
                        const senderResult = await query(
                            `SELECT email, full_name FROM CUSTOMERS WHERE user_id = $1`,
                            [item.requested_by]
                        );

                        // Fetch receiver
                        const receiverResult = await query(
                            `SELECT c.email, c.full_name, a.balance, a.account_number 
                             FROM ACCOUNTS a 
                             JOIN CUSTOMERS c ON a.customer_id = c.customer_id 
                             WHERE a.account_id = $1`,
                            [payload.toAccountId]
                        );

                        const senderBalRes = await query(
                            `SELECT balance FROM ACCOUNTS WHERE account_id = $1`,
                            [payload.fromAccountId]
                        );

                        const sender = senderResult.rows[0];
                        const receiver = receiverResult.rows[0];
                        const senderBalance = senderBalRes.rows[0]?.balance;

                        if (sender) {
                            // Sender PDF (Debit)
                            const senderPdfBuffer = await generateTransactionReceiptPDF({
                                ref: transferRef,
                                date: new Date(),
                                sender: sender.full_name,
                                receiver: receiver ? receiver.full_name : payload.toAccountId,
                                status: 'APPROVED HIGH-VALUE TRANSFER — DEBIT',
                                type: 'Internal Transfer Out',
                                source: 'internal',
                                procedure: 'sp_internal_transfer()',
                                isolation: 'SERIALIZABLE + FOR UPDATE',
                                auth: 'DUAL APPROVAL SECURED (Manager Approved)',
                                amount: payload.amount,
                                balance: senderBalance,
                                isReceiver: false,
                                scopeNote: '✓ IN SCOPE — Post-Approval Execution · type = TRANSFER_DEBIT'
                            });

                            if (sender.email) {
                                const attachments = [{ filename: `Receipt-${transferRef}.pdf`, content: senderPdfBuffer, contentType: 'application/pdf' }];
                                const senderHtml = templates.transaction(sender.full_name, {
                                    amount: payload.amount,
                                    ref: transferRef,
                                    type: 'Internal Transfer Out (Approved)'
                                });
                                await sendEmail(sender.email, 'Transaction Approved & Successful - Safe Vault', senderHtml, attachments, true).catch(e => console.error('Manager Approval Sender Email Error:', e));
                            }
                        }

                        if (receiver && receiver.email) {
                            // Receiver PDF (Credit)
                            const receiverPdfBuffer = await generateTransactionReceiptPDF({
                                ref: transferRef,
                                date: new Date(),
                                sender: sender ? sender.full_name : payload.fromAccountId,
                                receiver: receiver.full_name,
                                status: 'APPROVED HIGH-VALUE TRANSFER — CREDIT',
                                type: 'Internal Transfer In',
                                source: 'internal',
                                procedure: 'sp_internal_transfer()',
                                auth: 'SECURE LEDGER CREDIT (Automated)',
                                amount: payload.amount,
                                balance: receiver.balance,
                                isReceiver: true,
                                scopeNote: '✓ IN SCOPE — Mirror credit leg · type = TRANSFER_CREDIT'
                            });

                            const attachments = [{ filename: `Credit-Note-${transferRef}.pdf`, content: receiverPdfBuffer, contentType: 'application/pdf' }];
                            const receiverHtml = templates.transaction(receiver.full_name, {
                                amount: payload.amount,
                                ref: transferRef,
                                type: 'Internal Transfer In'
                            });
                            await sendEmail(receiver.email, 'Funds Received (High Value) - Suraksha Bank', receiverHtml, attachments, true).catch(e => console.error('Manager Approval Receiver Email Error:', e));
                        }
                    } catch (receiptErr) {
                        console.error('Approval Receipt Error:', receiptErr);
                    }
                }
            }
        }

        res.json({ message: `Request ${newStatus} successfully.`, queueId: id, status: newStatus });

    } catch (err) {
        console.error('Approval Action Error:', err);
        res.status(500).json({ message: 'Action failed: ' + err.message });
    }
});

// ============================================================
// GET /api/manager/accounts
// Account Management — list accounts for the branch
// ============================================================
router.get('/accounts', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(managerId);
        const branchId = managerInfo?.branch_id;

        const result = await query(
            `SELECT a.account_id, a.account_number, a.balance, a.status, a.opened_date,
                    a.minimum_balance, at.type_name,
                    c.full_name AS customer_name, c.customer_id
             FROM ACCOUNTS a
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             ${branchId ? 'WHERE a.home_branch_id = $1' : ''}
             ORDER BY a.opened_date DESC
             LIMIT 50`,
            branchId ? [branchId] : []
        );

        res.json({ accounts: result.rows });
    } catch (err) {
        console.error('Account List Error:', err);
        res.status(500).json({ message: 'Failed to fetch accounts: ' + err.message });
    }
});

// ============================================================
// POST /api/manager/accounts/:id/status
// Change account status (ACTIVE, FROZEN, CLOSED)
// ============================================================
router.post('/accounts/:id/status', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    const { id } = req.params;
    const { newStatus, reason } = req.body;
    const validStatuses = ['ACTIVE', 'FROZEN', 'CLOSED', 'DORMANT'];
    if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    }

    try {
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(managerId);
        const employeeId = managerInfo?.employee_id || managerId;

        // Get old status for audit
        const oldResult = await query(
            `SELECT status, balance FROM ACCOUNTS WHERE account_id = $1`,
            [id]
        );
        const oldStatus = oldResult.rows[0]?.status;
        if (!oldStatus) return res.status(404).json({ message: 'Account not found.' });

        await query(
            `UPDATE ACCOUNTS SET status = $1 ${newStatus === 'CLOSED' ? ', closed_date = CURRENT_TIMESTAMP' : ''} WHERE account_id = $2`,
            [newStatus, id]
        );

        // Audit log
        res.json({ message: `Account ${id} status changed to ${newStatus}.`, accountId: id, status: newStatus });
    } catch (err) {
        console.error('Account Status Error:', err);
        res.status(500).json({ message: 'Status change failed: ' + err.message });
    }
});

// ============================================================
// GET /api/manager/settlement
// Pending External Transfers for settlement
// ============================================================
router.get('/settlement', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const { status } = req.query;
        const filterStatus = status || 'PENDING';

        const result = await query(
            `SELECT p.transfer_id, p.source_account_id, p.amount,
                    p.destination_ifsc, p.destination_account, p.destination_name,
                    p.purpose, p.status, p.transfer_mode, p.initiated_at,
                    p.initiated_by, p.settled_at, p.settlement_reference,
                    p.rejected_at, p.rejection_reason
             FROM PENDING_EXTERNAL_TRANSFERS p
             WHERE p.status = $1
             ORDER BY p.initiated_at ASC`,
            [filterStatus]
        );

        res.json({ transfers: result.rows });
    } catch (err) {
        console.error('Settlement Fetch Error:', err);
        res.status(500).json({ message: 'Failed to fetch transfers: ' + err.message });
    }
});

// ============================================================
// POST /api/manager/settlement/:id/:action  (settle or reject)
// ============================================================
router.post('/settlement/:id/:action', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    const { id, action } = req.params;
    const { reason } = req.body;

    if (!['settle', 'reject'].includes(action.toLowerCase())) {
        return res.status(400).json({ message: 'Action must be settle or reject.' });
    }

    try {
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(managerId);
        const employeeId = managerInfo?.employee_id || managerId;

        if (action.toLowerCase() === 'settle') {
            const ref = 'SETT-' + Date.now().toString().slice(-8);
            await query(
                `UPDATE PENDING_EXTERNAL_TRANSFERS
                 SET status = 'SETTLED', settled_at = CURRENT_TIMESTAMP, settlement_reference = $1
                 WHERE transfer_id = $2 AND status = 'PENDING'`,
                [ref, id]
            );

            // Audit
            await query(
                `INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, changed_at, new_value_json, change_reason)
                 VALUES ('PENDING_EXTERNAL_TRANSFERS', $1, 'SETTLEMENT', $2, CURRENT_TIMESTAMP, $3, $4)`,
                [id, employeeId, JSON.stringify({ status: 'SETTLED', ref }), reason || 'Settled by manager']
            );

            res.json({ message: 'Transfer settled successfully.', transferId: id, reference: ref });
        } else {
            await query(
                `UPDATE PENDING_EXTERNAL_TRANSFERS
                 SET status = 'REJECTED', rejected_at = CURRENT_TIMESTAMP, rejection_reason = $1
                 WHERE transfer_id = $2 AND status = 'PENDING'`,
                [reason || 'Rejected by manager', id]
            );

            res.json({ message: 'Transfer rejected.', transferId: id });
        }
    } catch (err) {
        console.error('Settlement Action Error:', err);
        res.status(500).json({ message: 'Action failed: ' + err.message });
    }
});

// ============================================================
// GET /api/manager/audit
// Branch Audit Log
// ============================================================
router.get('/audit', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const { date, limit } = req.query;
        const maxRows = Math.min(parseInt(limit) || 50, 200);
        let whereClause = '1=1';
        const params = [];

        if (date) {
            whereClause += ` AND a.changed_at::date = $1`;
            params.push(date);
        }

        const result = await query(
            `SELECT a.audit_id, a.table_name, a.record_id, a.operation,
                    a.changed_by, a.changed_at, a.old_value_json, a.new_value_json,
                    a.change_reason, a.violation_flag
             FROM AUDIT_LOG a
             WHERE ${whereClause}
             ORDER BY a.changed_at DESC
             LIMIT $${params.length + 1}`,
            [...params, maxRows]
        );

        res.json({ audit: result.rows });
    } catch (err) {
        console.error('Audit Log Error:', err);
        res.status(500).json({ message: 'Failed to fetch audit log: ' + err.message });
    }
});

// ============================================================
// GET /api/manager/compliance
// Compliance Flags
// ============================================================
router.get('/compliance', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const result = await query(
            `SELECT cf.flag_id, cf.account_id, cf.transaction_id, cf.flag_type,
                    cf.threshold_value, cf.flagged_at, cf.reviewed_by,
                    a.account_number, c.full_name AS customer_name
             FROM COMPLIANCE_FLAGS cf
             LEFT JOIN ACCOUNTS a ON cf.account_id = a.account_id
             LEFT JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             ORDER BY cf.flagged_at DESC
             LIMIT 50`
        );

        res.json({ flags: result.rows });
    } catch (err) {
        console.error('Compliance Flags Error:', err);
        res.status(500).json({ message: 'Failed to fetch compliance flags: ' + err.message });
    }
});

// ============================================================
// POST /api/manager/compliance/:id/review
// Mark a compliance flag as reviewed
// ============================================================
router.post('/compliance/:id/review', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    const { id } = req.params;
    try {
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(managerId);
        const employeeId = managerInfo?.employee_id || managerId;

        await query(
            `UPDATE COMPLIANCE_FLAGS SET reviewed_by = $1 WHERE flag_id = $2`,
            [employeeId, parseInt(id)]
        );

        res.json({ message: 'Flag marked as reviewed.', flagId: id });
    } catch (err) {
        console.error('Compliance Review Error:', err);
        res.status(500).json({ message: 'Review failed: ' + err.message });
    }
});

// ============================================================
// GET /api/manager/reports
// Full Branch Reports — aggregate transaction data
// ============================================================
router.get('/reports', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(managerId);
        const branchId = managerInfo?.branch_id;

        const from = fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const to = toDate || new Date().toISOString().slice(0, 10);

        // Daily Cash Flow Summary
        const cashFlow = await query(
            `SELECT t.transaction_date::date AS txn_date,
                    SUM(CASE WHEN t.transaction_type IN ('CREDIT','TRANSFER_CREDIT','EXTERNAL_CREDIT','INTEREST_CREDIT') THEN t.amount ELSE 0 END) AS total_credits,
                    SUM(CASE WHEN t.transaction_type IN ('DEBIT','TRANSFER_DEBIT','EXTERNAL_DEBIT','FEE_DEBIT') THEN t.amount ELSE 0 END) AS total_debits,
                    COUNT(*) AS txn_count
             FROM TRANSACTIONS t
             WHERE t.transaction_date::date BETWEEN $1::date AND $2::date
             ${branchId ? 'AND t.branch_id = $3' : ''}
             GROUP BY t.transaction_date::date
             ORDER BY txn_date DESC`,
            branchId ? [from, to, branchId] : [from, to]
        );

        // Account Acquisition
        const accountAcq = await query(
            `SELECT at.type_name, COUNT(*) AS count
             FROM ACCOUNTS a
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             WHERE a.created_at::date BETWEEN $1::date AND $2::date
             ${branchId ? 'AND a.home_branch_id = $3' : ''}
             GROUP BY at.type_name
             ORDER BY count DESC`,
            branchId ? [from, to, branchId] : [from, to]
        );

        // Teller Performance (transaction counts per teller)
        const tellerPerf = await query(
            `SELECT t.initiated_by, COUNT(*) AS txn_count,
                    SUM(t.amount) AS total_amount
             FROM TRANSACTIONS t
             WHERE t.transaction_date::date BETWEEN $1::date AND $2::date
             ${branchId ? 'AND t.branch_id = $3' : ''}
             GROUP BY t.initiated_by
             ORDER BY txn_count DESC`,
            branchId ? [from, to, branchId] : [from, to]
        );

        res.json({
            period: { from, to },
            cashFlowSummary: cashFlow.rows,
            accountAcquisition: accountAcq.rows,
            tellerPerformance: tellerPerf.rows
        });
    } catch (err) {
        console.error('Reports Error:', err);
        res.status(500).json({ message: 'Failed to generate reports: ' + err.message });
    }
});

// ============================================================
// GET /api/manager/staff
// Staff Management — employees in the manager's branch
// ============================================================
router.get('/staff', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(managerId);
        const branchId = managerInfo?.branch_id;

        const result = await query(
            `SELECT e.employee_id, e.full_name, e.role, e.hire_date, e.is_active,
                    b.branch_name
             FROM EMPLOYEES e
             LEFT JOIN BRANCHES b ON e.branch_id = b.branch_id
             ${branchId ? 'WHERE e.branch_id = $1' : ''}
             ORDER BY e.role, e.full_name`,
            branchId ? [branchId] : []
        );

        res.json({ staff: result.rows });
    } catch (err) {
        console.error('Staff Fetch Error:', err);
        res.status(500).json({ message: 'Failed to fetch staff: ' + err.message });
    }
});

// ============================================================
// GET /api/manager/batch-jobs
// Batch Job Status — interest accrual batch control
// ============================================================
router.get('/batch-jobs', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const result = await query(
            `SELECT bc.run_id, bc.bucket_id, bc.accrual_date, bc.status,
                    bc.accounts_processed, bc.started_at, bc.completed_at, bc.error_message
             FROM ACCRUAL_BATCH_CONTROL bc
             ORDER BY bc.accrual_date DESC, bc.bucket_id ASC
             LIMIT 50`
        );

        // Summary stats
        const summary = await query(
            `SELECT
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed,
                COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS failed,
                COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) AS in_progress,
                COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending
             FROM ACCRUAL_BATCH_CONTROL`
        );

        res.json({
            batchJobs: result.rows,
            summary: summary.rows[0] || { completed: 0, failed: 0, in_progress: 0, pending: 0 }
        });
    } catch (err) {
        console.error('Batch Jobs Error:', err);
        res.status(500).json({ message: 'Failed to fetch batch jobs: ' + err.message });
    }
});


// --- MIS & DASHBOARD EXTENSIONS ---
// GET /api/manager/mis/summary
router.get('/mis/summary', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    try {
        const managerInfo = await getManagerBranchId(req.user.id);
        const branchId = managerInfo?.branch_id;

        const income = await query(
            `SELECT SUM(total_interest_income) AS total FROM v_loan_interest_income ${branchId ? 'WHERE branch_id = $1' : ''}`,
            branchId ? [branchId] : []
        );

        const expense = await query(
            `SELECT SUM(projected_interest_liability) AS total FROM v_fd_interest_expense ${branchId ? 'WHERE branch_id = $1' : ''}`,
            branchId ? [branchId] : []
        );

        const liquidity = await query(
            `SELECT * FROM v_branch_liquidity ${branchId ? 'WHERE branch_id = $1' : ''}`,
            branchId ? [branchId] : []
        );

        res.json({
            interestIncome: income.rows[0]?.total || 0,
            projectedInterestExpense: expense.rows[0]?.total || 0,
            liquidity: liquidity.rows
        });
    } catch (err) {
        console.error('MIS Fetch Error:', err);
        res.status(500).json({ message: 'Could not fetch MIS summary.' });
    }
});

// POST /api/manager/deposits/process-maturity
router.post('/deposits/process-maturity', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    const { fdId } = req.body;
    try {
        const managerInfo = await getManagerBranchId(req.user.id);
        const employeeId = managerInfo?.employee_id || req.user.id;

        await query(
            `CALL sp_process_fd_maturity($1, $2)`,
            [Number(fdId), employeeId]
        );
        res.json({ message: 'FD maturity processed successfully.' });
    } catch (err) {
        console.error('FD Maturity Error:', err);
        const error = mapOracleError(err);
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
