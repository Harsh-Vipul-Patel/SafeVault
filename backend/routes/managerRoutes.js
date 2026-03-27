const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { verifyToken, requireRole } = require('../middleware/auth');
const { processPendingNotifications } = require('../lib/dispatchEmail');
const { mapOracleError } = require('../utils/error_codes');
const { sendEmail } = require('../utils/emailService');
const { generateTransactionReceiptPDF } = require('../utils/pdfGenerator');
const templates = require('../utils/emailTemplates');

// Set global fetch options to handle LOBs as strings/buffers
oracledb.fetchAsString = [oracledb.CLOB];
oracledb.fetchAsBuffer = [oracledb.BLOB];

const MANAGER_ROLES = ['BRANCH_MANAGER', 'SYSTEM_ADMIN'];

// Helper: get manager's branch_id from EMPLOYEES table
async function getManagerBranchId(connection, userId) {
    const result = await connection.execute(
        `SELECT e.branch_id, e.employee_id, e.full_name
         FROM EMPLOYEES e
         JOIN USERS u ON e.user_id = u.user_id
         WHERE RAWTOHEX(u.user_id) = :userId1 OR e.employee_id = :userId2`,
        { userId1: userId, userId2: userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0] || null;
}

// ============================================================
// GET /api/manager/dashboard
// Branch Overview Dashboard — real KPIs from Oracle
// ============================================================
router.get('/dashboard', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(connection, managerId);
        const branchId = managerInfo?.BRANCH_ID;

        let depositsQuery = `SELECT NVL(SUM(amount), 0) AS total FROM TRANSACTIONS 
                             WHERE TRUNC(transaction_date) = TRUNC(SYSDATE) 
                             AND transaction_type IN ('CREDIT', 'TRANSFER_CREDIT', 'EXTERNAL_CREDIT', 'INTEREST_CREDIT')`;
        let wQuery = `SELECT NVL(SUM(amount), 0) AS total FROM TRANSACTIONS 
                      WHERE TRUNC(transaction_date) = TRUNC(SYSDATE) 
                      AND transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT', 'FEE_DEBIT')`;
        let newAccQuery = `SELECT COUNT(*) AS total FROM ACCOUNTS WHERE TRUNC(opened_date) = TRUNC(SYSDATE)`;
        let recentTxnsQuery = `SELECT t.transaction_id, t.transaction_type, t.amount, t.account_id,
                                      t.transaction_date, t.description, t.initiated_by
                               FROM TRANSACTIONS t`;

        const binds = {};
        if (branchId) {
            depositsQuery += ` AND branch_id = :bid`;
            wQuery += ` AND branch_id = :bid`;
            newAccQuery += ` AND home_branch_id = :bid`;
            recentTxnsQuery += ` WHERE t.branch_id = :bid`;
            binds.bid = branchId;
        }
        recentTxnsQuery += ` ORDER BY t.transaction_date DESC FETCH FIRST 5 ROWS ONLY`;

        console.log('Running depositsQuery...');
        // KPI: Total Deposits (today)
        const deposits = await connection.execute(
            depositsQuery, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log('Running wQuery...');
        // KPI: Total Withdrawals (today)
        const withdrawals = await connection.execute(
            wQuery, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log('Running pendingApprovals query...');
        // KPI: Pending Approvals
        const pendingApprovals = await connection.execute(
            `SELECT COUNT(*) AS total FROM DUAL_APPROVAL_QUEUE WHERE status = 'PENDING'`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const pendingSettlementsResult = await connection.execute(
            `SELECT COUNT(*) AS total FROM PENDING_EXTERNAL_TRANSFERS WHERE status = 'PENDING'`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log('Running newAccQuery...');
        // KPI: New Accounts (today)
        const newAccounts = await connection.execute(
            newAccQuery, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log('Running recentTxnsQuery...');
        // Live Feed: Recent transactions + compliance flags
        const recentTxns = await connection.execute(
            recentTxnsQuery, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const recentFlags = await connection.execute(
            `SELECT cf.flag_id, cf.flag_type, cf.account_id, cf.flagged_at, cf.threshold_value
             FROM COMPLIANCE_FLAGS cf
             ORDER BY cf.flagged_at DESC
             FETCH FIRST 3 ROWS ONLY`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Dual Approval Queue & Settlements preview (top 5)
        const approvalPreview = await connection.execute(
            `SELECT RAWTOHEX(q.queue_id) AS queue_id, q.operation_type, q.status, CAST(q.created_at AS TIMESTAMP(6)) AS created_at,
                    u.username AS requested_by_name
             FROM DUAL_APPROVAL_QUEUE q
             LEFT JOIN USERS u ON q.requested_by = u.user_id
             WHERE q.status = 'PENDING'
             UNION ALL
             SELECT RAWTOHEX(p.transfer_id) AS queue_id, 'EXTERNAL_TRANSFER' AS operation_type, p.status, CAST(p.initiated_at AS TIMESTAMP(6)) AS created_at,
                    p.initiated_by AS requested_by_name
             FROM PENDING_EXTERNAL_TRANSFERS p
             WHERE p.status = 'PENDING'
             ORDER BY created_at ASC
             FETCH FIRST 5 ROWS ONLY`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            kpis: {
                totalDeposits: deposits.rows[0]?.TOTAL || 0,
                totalWithdrawals: withdrawals.rows[0]?.TOTAL || 0,
                pendingApprovals: pendingApprovals.rows[0]?.TOTAL || 0,
                pendingSettlements: pendingSettlementsResult.rows[0]?.TOTAL || 0,
                newAccounts: newAccounts.rows[0]?.TOTAL || 0
            },
            approvalPreview: approvalPreview.rows,
            liveFeed: {
                transactions: recentTxns.rows,
                flags: recentFlags.rows
            },
            managerInfo: managerInfo ? {
                name: managerInfo.FULL_NAME,
                employeeId: managerInfo.EMPLOYEE_ID,
                branchId: managerInfo.BRANCH_ID
            } : null
        });
    } catch (err) {
        console.error('Manager Dashboard Error:', err);
        res.status(500).json({ message: 'Failed to load dashboard: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// GET /api/manager/approvals
// Dual Approval Queue — all pending items
// ============================================================
router.get('/approvals', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const { status } = req.query;
        const filterStatus = status || 'PENDING';

        const result = await connection.execute(
            `SELECT RAWTOHEX(q.queue_id) AS queue_id, q.operation_type, q.payload_json, q.status,
                    q.created_at, q.reviewed_by, q.reviewed_at, q.review_note,
                    u.username AS requested_by_name
             FROM DUAL_APPROVAL_QUEUE q
             LEFT JOIN USERS u ON q.requested_by = u.user_id
             WHERE q.status = :status
             ORDER BY q.created_at ASC`,
            { status: filterStatus },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Parse payload_json for each row
        const queue = result.rows.map(row => {
            let payload = {};
            try { payload = JSON.parse(row.PAYLOAD_JSON || '{}'); } catch (e) { /* ignore */ }
            return {
                queueId: row.QUEUE_ID,
                operationType: row.OPERATION_TYPE,
                requestedBy: row.REQUESTED_BY_NAME,
                status: row.STATUS,
                createdAt: row.CREATED_AT,
                reviewedBy: row.REVIEWED_BY,
                reviewedAt: row.REVIEWED_AT,
                reviewNote: row.REVIEW_NOTE,
                payload
            };
        });

        res.json({ queue });
    } catch (err) {
        console.error('Approvals Fetch Error:', err);
        res.status(500).json({ message: 'Failed to fetch approvals: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// POST /api/manager/approvals/:id/:action  (APPROVE or REJECT)
// ============================================================
router.post('/approvals/:id/:action', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    const { id, action } = req.params;
    const { note } = req.body;
    const validActions = ['approve', 'reject'];
    if (!validActions.includes(action.toLowerCase())) {
        return res.status(400).json({ message: 'Action must be approve or reject.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(connection, managerId);
        const employeeId = managerInfo?.EMPLOYEE_ID || managerId;

        const newStatus = action.toLowerCase() === 'approve' ? 'APPROVED' : 'REJECTED';

        if (action.toLowerCase() === 'approve') {
            await connection.execute(
                `BEGIN sp_approve_dual_queue(:queueId, :reviewer, :note); END;`,
                { queueId: id, reviewer: employeeId, note: note || null },
                { autoCommit: true }
            );
        } else {
            await connection.execute(
                `BEGIN sp_reject_dual_queue(:queueId, :reviewer, :note); END;`,
                { queueId: id, reviewer: employeeId, note: note || null },
                { autoCommit: true }
            );
        }

        // Process pending notifications
        await processPendingNotifications(req.user.id, connection, false).catch(e => console.error('Manager Notif Error:', e));

        if (newStatus === 'APPROVED') {
            // Fetch queue item to check operation type and payload
            const queueItem = await connection.execute(
                `SELECT operation_type, payload_json, RAWTOHEX(requested_by) AS requested_by_hex FROM DUAL_APPROVAL_QUEUE WHERE queue_id = :qid`,
                { qid: id },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            const item = queueItem.rows[0];
            if (item && item.OPERATION_TYPE === 'HIGH_VALUE_TRANSFER') {
                let payload = {};
                try { payload = JSON.parse(item.PAYLOAD_JSON || '{}'); } catch (e) { console.error('Payload Parse Error:', e); }

                if (payload.operation === 'INTERNAL_TRANSFER') {
                    // Execute the actual transfer now that it's approved
                    await connection.execute(
                        `BEGIN sp_internal_transfer(:sender, :receiver, :amount, :initiated_by); END;`,
                        {
                            sender: payload.fromAccountId,
                            receiver: payload.toAccountId,
                            amount: payload.amount,
                            initiated_by: item.REQUESTED_BY_HEX // Pass the original requester ID as hex string
                        },
                        { autoCommit: true }
                    );

                    // --- Process Receipts after approval ---
                    try {
                        const transferRef = 'TXN-' + Date.now().toString().slice(-8);

                        // Fetch sender (the one who requested the transfer)
                        const senderResult = await connection.execute(
                            `SELECT email, full_name FROM CUSTOMERS WHERE user_id = HEXTORAW(:req_uid)`,
                            { req_uid: item.REQUESTED_BY_HEX },
                            { outFormat: oracledb.OUT_FORMAT_OBJECT }
                        );

                        // Fetch receiver
                        const receiverResult = await connection.execute(
                            `SELECT c.email, c.full_name, a.balance, a.account_number 
                             FROM ACCOUNTS a 
                             JOIN CUSTOMERS c ON a.customer_id = c.customer_id 
                             WHERE a.account_id = :acc OR a.account_number = :acc`,
                            { acc: payload.toAccountId },
                            { outFormat: oracledb.OUT_FORMAT_OBJECT }
                        );

                        const senderBalRes = await connection.execute(
                            `SELECT balance FROM ACCOUNTS WHERE account_id = :acc`,
                            { acc: payload.fromAccountId },
                            { outFormat: oracledb.OUT_FORMAT_OBJECT }
                        );

                        const sender = senderResult.rows[0];
                        const receiver = receiverResult.rows[0];
                        const senderBalance = senderBalRes.rows[0]?.BALANCE;

                        if (sender) {
                            // Sender PDF (Debit)
                            const senderPdfBuffer = await generateTransactionReceiptPDF({
                                ref: transferRef,
                                date: new Date(),
                                sender: sender.FULL_NAME,
                                receiver: receiver ? receiver.FULL_NAME : payload.toAccountId,
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

                            if (sender.EMAIL) {
                                const attachments = [{ filename: `Receipt-${transferRef}.pdf`, content: senderPdfBuffer, contentType: 'application/pdf' }];
                                const senderHtml = templates.transaction(sender.FULL_NAME, {
                                    amount: payload.amount,
                                    ref: transferRef,
                                    type: 'Internal Transfer Out (Approved)'
                                });
                                await sendEmail(sender.EMAIL, 'Transaction Approved & Successful - Safe Vault', senderHtml, attachments, true).catch(e => console.error('Manager Approval Sender Email Error:', e));
                            }
                        }

                        if (receiver && receiver.EMAIL) {
                            // Receiver PDF (Credit)
                            const receiverPdfBuffer = await generateTransactionReceiptPDF({
                                ref: transferRef,
                                date: new Date(),
                                sender: sender ? sender.FULL_NAME : payload.fromAccountId,
                                receiver: receiver.FULL_NAME,
                                status: 'APPROVED HIGH-VALUE TRANSFER — CREDIT',
                                type: 'Internal Transfer In',
                                source: 'internal',
                                procedure: 'sp_internal_transfer()',
                                auth: 'SECURE LEDGER CREDIT (Automated)',
                                amount: payload.amount,
                                balance: receiver.BALANCE,
                                isReceiver: true,
                                scopeNote: '✓ IN SCOPE — Mirror credit leg · type = TRANSFER_CREDIT'
                            });

                            const attachments = [{ filename: `Credit-Note-${transferRef}.pdf`, content: receiverPdfBuffer, contentType: 'application/pdf' }];
                            const receiverHtml = templates.transaction(receiver.FULL_NAME, {
                                amount: payload.amount,
                                ref: transferRef,
                                type: 'Internal Transfer In'
                            });
                            await sendEmail(receiver.EMAIL, 'Funds Received (High Value) - Suraksha Bank', receiverHtml, attachments, true).catch(e => console.error('Manager Approval Receiver Email Error:', e));
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
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// GET /api/manager/accounts
// Account Management — list accounts for the branch
// ============================================================
router.get('/accounts', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(connection, managerId);
        const branchId = managerInfo?.BRANCH_ID;

        const result = await connection.execute(
            `SELECT a.account_id, a.account_number, a.balance, a.status, a.opened_date,
                    a.minimum_balance, at.type_name,
                    c.full_name AS customer_name, c.customer_id
             FROM ACCOUNTS a
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             ${branchId ? 'WHERE a.home_branch_id = :bid' : ''}
             ORDER BY a.opened_date DESC
             FETCH FIRST 50 ROWS ONLY`,
            branchId ? { bid: branchId } : {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ accounts: result.rows });
    } catch (err) {
        console.error('Account List Error:', err);
        res.status(500).json({ message: 'Failed to fetch accounts: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// POST /api/manager/accounts/:id/status
// Change account status (ACTIVE, FROZEN, CLOSED)
// ============================================================
router.post('/accounts/:id/status', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    const { id } = req.params;
    const { newStatus, reason, otpCode } = req.body;
    const validStatuses = ['ACTIVE', 'FROZEN', 'CLOSED', 'DORMANT'];
    if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({ message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
    }

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ message: 'A reason must be provided for status change.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(connection, managerId);
        const employeeId = managerInfo?.EMPLOYEE_ID || managerId;

        // Get old status and customer details
        const oldResult = await connection.execute(
            `SELECT a.status, a.balance, a.customer_id, c.email, c.full_name 
             FROM ACCOUNTS a 
             JOIN CUSTOMERS c ON a.customer_id = c.customer_id 
             WHERE a.account_id = :aid`,
            { aid: id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const accountData = oldResult.rows[0];
        if (!accountData) return res.status(404).json({ message: 'Account not found.' });

        const oldStatus = accountData.STATUS;
        const customerId = accountData.CUSTOMER_ID;
        const customerEmail = accountData.EMAIL;
        const customerName = accountData.FULL_NAME;

        // Only require OTP if freezing or unfreezing
        if ((newStatus === 'FROZEN' && oldStatus !== 'FROZEN') || (newStatus === 'ACTIVE' && oldStatus === 'FROZEN')) {
            if (!otpCode) {
                return res.status(400).json({ message: 'Manager OTP is required to freeze or unfreeze this account.' });
            }

            const { verifyManagerOtp } = require('../utils/otpHelper');
            const otpResult = await verifyManagerOtp(connection, req.user.id, otpCode, 'ACCOUNT_STATUS_CHANGE');
            
            if (!otpResult.valid) {
                return res.status(401).json({ message: otpResult.reason || 'Invalid OTP.' });
            }
        }

        await connection.execute(
            `BEGIN sp_set_account_status(:aid, :newStatus, :manager, :reason); END;`,
            { aid: id, newStatus, manager: employeeId, reason: reason },
            { autoCommit: true }
        );

        // Send email notification if freezing or unfreezing
        if (newStatus === 'FROZEN' && oldStatus !== 'FROZEN' && customerEmail) {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2>Account Frozen Notice</h2>
                    <p>Dear ${customerName},</p>
                    <p>Your account (ID: ${id}) has been frozen by the branch manager.</p>
                    <p><strong>Reason:</strong> ${reason}</p>
                    <p>While your account is frozen, you will not be able to perform any transactions.</p>
                    <p>Please contact your home branch immediately for further assistance.</p>
                    <p>Regards,<br>Suraksha Bank Management</p>
                </div>
            `;
            await sendEmail(customerEmail, 'URGENT: Your Account has been Frozen - Suraksha Bank', emailHtml, [], true).catch(e => console.error('Freeze Email Error:', e));
        } else if (newStatus === 'ACTIVE' && oldStatus === 'FROZEN' && customerEmail) {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2>Account Unfrozen Notice</h2>
                    <p>Dear ${customerName},</p>
                    <p>Good news! Your account (ID: ${id}) is active again.</p>
                    <p><strong>Manager Note:</strong> ${reason}</p>
                    <p>You may now resume normal banking operations.</p>
                    <p>Regards,<br>Suraksha Bank Management</p>
                </div>
            `;
            await sendEmail(customerEmail, 'Account Status Restored - Suraksha Bank', emailHtml, [], true).catch(e => console.error('Unfreeze Email Error:', e));
        }

        res.json({ message: `Account ${id} status changed to ${newStatus}.`, accountId: id, status: newStatus });
    } catch (err) {
        console.error('Account Status Error:', err);
        res.status(500).json({ message: 'Status change failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// GET /api/manager/settlement
// Pending External Transfers for settlement
// ============================================================
router.get('/settlement', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const { status } = req.query;
        const filterStatus = status || 'PENDING';

        const result = await connection.execute(
            `SELECT RAWTOHEX(p.transfer_id) AS transfer_id, p.source_account_id, p.amount,
                    p.destination_ifsc, p.destination_account, p.destination_name,
                    p.purpose, p.status, p.transfer_mode, p.initiated_at,
                    p.initiated_by, p.settled_at, p.settlement_reference,
                    p.rejected_at, p.rejection_reason
             FROM PENDING_EXTERNAL_TRANSFERS p
             WHERE p.status = :status
             ORDER BY p.initiated_at ASC`,
            { status: filterStatus },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ transfers: result.rows });
    } catch (err) {
        console.error('Settlement Fetch Error:', err);
        res.status(500).json({ message: 'Failed to fetch transfers: ' + err.message });
    } finally {
        if (connection) await connection.close();
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

    let connection;
    try {
        connection = await oracledb.getConnection();
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(connection, managerId);
        const employeeId = managerInfo?.EMPLOYEE_ID || managerId;

        if (action.toLowerCase() === 'settle') {
            await connection.execute(
                `BEGIN sp_approve_external_transfer(:tid, :manager); END;`,
                { tid: id, manager: employeeId },
                { autoCommit: true }
            );

            // Fetch reference to return it
            const refResult = await connection.execute(
                `SELECT settlement_reference FROM PENDING_EXTERNAL_TRANSFERS WHERE transfer_id = :tid`,
                { tid: id },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const ref = refResult.rows[0]?.SETTLEMENT_REFERENCE;

            res.json({ message: 'Transfer settled successfully.', transferId: id, reference: ref });
        } else {
            await connection.execute(
                `BEGIN sp_reject_external_transfer(:tid, :manager, :reason); END;`,
                { tid: id, manager: employeeId, reason: reason || 'Rejected by manager' },
                { autoCommit: true }
            );

            res.json({ message: 'Transfer rejected.', transferId: id });
        }
    } catch (err) {
        console.error('Settlement Action Error:', err);
        res.status(500).json({ message: 'Action failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// GET /api/manager/audit
// Branch Audit Log
// ============================================================
router.get('/audit', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const { date, limit } = req.query;
        const maxRows = Math.min(parseInt(limit) || 50, 200);
        let whereClause = '1=1';
        const binds = {};
        const managerId = req.user?.id || 'MANAGER_DEFAULT';

        // Filter by branch for BRANCH_MANAGER, SYSTEM_ADMIN sees everything
        if (req.user.role !== 'SYSTEM_ADMIN') {
            const managerInfo = await getManagerBranchId(connection, managerId);
            if (managerInfo?.BRANCH_ID) {
                whereClause += ` AND (a.changed_by IN (SELECT employee_id FROM EMPLOYEES WHERE branch_id = :manager_branch) OR a.changed_by = 'SYSTEM')`;
                binds.manager_branch = managerInfo.BRANCH_ID;
            }
        }

        if (date) {
            whereClause += ` AND TRUNC(a.changed_at) = TO_DATE(:audit_date, 'YYYY-MM-DD')`;
            binds.audit_date = date;
        }

        const result = await connection.execute(
            `SELECT a.audit_id, a.table_name, a.record_id, a.operation,
                    a.changed_by, a.changed_at, a.old_value_json, a.new_value_json,
                    a.change_reason, a.violation_flag,
                    NVL(e.full_name, a.changed_by) AS changed_by_name
             FROM AUDIT_LOG a
             LEFT JOIN EMPLOYEES e ON a.changed_by = e.employee_id
             WHERE ${whereClause}
             ORDER BY a.changed_at DESC
             FETCH FIRST :maxRows ROWS ONLY`,
            { ...binds, maxRows },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ audit: result.rows });
    } catch (err) {
        console.error('Audit Log Error:', err);
        res.status(500).json({ message: 'Failed to fetch audit log: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// GET /api/manager/compliance
// Compliance Flags
// ============================================================
router.get('/compliance', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();

        const result = await connection.execute(
            `SELECT cf.flag_id, cf.account_id, cf.transaction_id, cf.flag_type,
                    cf.threshold_value, cf.flagged_at, cf.reviewed_by,
                    a.account_number, c.full_name AS customer_name
             FROM COMPLIANCE_FLAGS cf
             LEFT JOIN ACCOUNTS a ON cf.account_id = a.account_id
             LEFT JOIN CUSTOMERS c ON a.customer_id = c.customer_id
             ORDER BY cf.flagged_at DESC
             FETCH FIRST 50 ROWS ONLY`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ flags: result.rows });
    } catch (err) {
        console.error('Compliance Flags Error:', err);
        res.status(500).json({ message: 'Failed to fetch compliance flags: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// POST /api/manager/compliance/:id/review
// Mark a compliance flag as reviewed
// ============================================================
router.post('/compliance/:id/review', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(connection, managerId);
        const employeeId = managerInfo?.EMPLOYEE_ID || managerId;

        await connection.execute(
            `UPDATE COMPLIANCE_FLAGS SET reviewed_by = :reviewer WHERE flag_id = :fid`,
            { reviewer: employeeId, fid: parseInt(id) },
            { autoCommit: true }
        );

        res.json({ message: 'Flag marked as reviewed.', flagId: id });
    } catch (err) {
        console.error('Compliance Review Error:', err);
        res.status(500).json({ message: 'Review failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// GET /api/manager/reports
// Full Branch Reports — aggregate transaction data
// ============================================================
router.get('/reports', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const { fromDate, toDate, type } = req.query;
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(connection, managerId);
        const branchId = managerInfo?.BRANCH_ID;

        const from = fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const to = toDate || new Date().toISOString().slice(0, 10);

        // Daily Cash Flow Summary
        const cashFlow = await connection.execute(
            `SELECT TRUNC(t.transaction_date) AS txn_date,
                    SUM(CASE WHEN t.transaction_type IN ('CREDIT','TRANSFER_CREDIT','EXTERNAL_CREDIT','INTEREST_CREDIT') THEN t.amount ELSE 0 END) AS total_credits,
                    SUM(CASE WHEN t.transaction_type IN ('DEBIT','TRANSFER_DEBIT','EXTERNAL_DEBIT','FEE_DEBIT') THEN t.amount ELSE 0 END) AS total_debits,
                    COUNT(*) AS txn_count
             FROM TRANSACTIONS t
             WHERE TRUNC(t.transaction_date) BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')
             ${branchId ? 'AND t.branch_id = :bid' : ''}
             GROUP BY TRUNC(t.transaction_date)
             ORDER BY txn_date DESC`,
            branchId ? { fromDate: from, toDate: to, bid: branchId } : { fromDate: from, toDate: to },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Account Acquisition
        const accountAcq = await connection.execute(
            `SELECT at.type_name, COUNT(*) AS count
             FROM ACCOUNTS a
             JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
             WHERE a.opened_date BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')
             ${branchId ? 'AND a.home_branch_id = :bid' : ''}
             GROUP BY at.type_name
             ORDER BY count DESC`,
            branchId ? { fromDate: from, toDate: to, bid: branchId } : { fromDate: from, toDate: to },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Teller Performance (transaction counts per teller)
        const tellerPerf = await connection.execute(
            `SELECT t.initiated_by, COUNT(*) AS txn_count,
                    SUM(t.amount) AS total_amount
             FROM TRANSACTIONS t
             WHERE TRUNC(t.transaction_date) BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')
             ${branchId ? 'AND t.branch_id = :bid' : ''}
             GROUP BY t.initiated_by
             ORDER BY txn_count DESC`,
            branchId ? { fromDate: from, toDate: to, bid: branchId } : { fromDate: from, toDate: to },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
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
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// GET /api/manager/staff
// Staff Management — employees in the manager's branch
// ============================================================
router.get('/staff', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const managerId = req.user?.id || 'MANAGER_DEFAULT';
        const managerInfo = await getManagerBranchId(connection, managerId);
        const branchId = managerInfo?.BRANCH_ID;

        const result = await connection.execute(
            `SELECT e.employee_id, e.full_name, e.role, e.hire_date, e.is_active,
                    b.branch_name
             FROM EMPLOYEES e
             LEFT JOIN BRANCHES b ON e.branch_id = b.branch_id
             ${branchId ? 'WHERE e.branch_id = :bid' : ''}
             ORDER BY e.role, e.full_name`,
            branchId ? { bid: branchId } : {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ staff: result.rows });
    } catch (err) {
        console.error('Staff Fetch Error:', err);
        res.status(500).json({ message: 'Failed to fetch staff: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// ============================================================
// GET /api/manager/batch-jobs
// Batch Job Status — interest accrual batch control
// ============================================================
router.get('/batch-jobs', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();

        const result = await connection.execute(
            `SELECT bc.run_id, bc.bucket_id, bc.accrual_date, bc.status,
                    bc.accounts_processed, bc.started_at, bc.completed_at, bc.error_message
             FROM ACCRUAL_BATCH_CONTROL bc
             ORDER BY bc.accrual_date DESC, bc.bucket_id ASC
             FETCH FIRST 50 ROWS ONLY`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Summary stats
        const summary = await connection.execute(
            `SELECT
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed,
                COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS failed,
                COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) AS in_progress,
                COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending
             FROM ACCRUAL_BATCH_CONTROL`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            batchJobs: result.rows,
            summary: summary.rows[0] || { COMPLETED: 0, FAILED: 0, IN_PROGRESS: 0, PENDING: 0 }
        });
    } catch (err) {
        console.error('Batch Jobs Error:', err);
        res.status(500).json({ message: 'Failed to fetch batch jobs: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});


// --- MIS & DASHBOARD EXTENSIONS ---
// GET /api/manager/mis/summary
router.get('/mis/summary', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const managerInfo = await getManagerBranchId(connection, req.user.id);
        const branchId = managerInfo?.BRANCH_ID;

        // Generate Branch MIS using stored procedure
        const fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 1); // Default to last 1 month
        const toDate = new Date();

        const result = await connection.execute(
            `BEGIN sp_generate_branch_mis(:branchId, :fromDate, :toDate, :cursor); END;`,
            {
                branchId: branchId || 'GLOBAL', // If no branch, use GLOBAL or what fits the logic
                fromDate: fromDate,
                toDate: toDate,
                cursor: { type: oracledb.CURSOR, dir: oracledb.BIND_OUT }
            }
        );

        const resultSet = result.outBinds.cursor;
        let misData = { INTEREST_INCOME: 0, INTEREST_EXPENSE: 0, FEE_INCOME: 0 };

        if (resultSet) {
            const row = await resultSet.getRow();
            if (row) {
                misData = {
                    INTEREST_INCOME: row[0],
                    INTEREST_EXPENSE: row[1],
                    FEE_INCOME: row[2]
                };
            }
            await resultSet.close();
        }

        const liquidity = await connection.execute(
            `SELECT * FROM v_branch_liquidity ${branchId ? 'WHERE branch_id = :bid' : ''}`,
            branchId ? { bid: branchId } : {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            interestIncome: misData.INTEREST_INCOME || 0,
            projectedInterestExpense: misData.INTEREST_EXPENSE || 0,
            feeIncome: misData.FEE_INCOME || 0,
            liquidity: liquidity.rows
        });
    } catch (err) {
        console.error('MIS Fetch Error:', err);
        res.status(500).json({ message: 'Could not fetch MIS summary.' });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/manager/deposits/process-maturity
router.post('/deposits/process-maturity', verifyToken, requireRole(MANAGER_ROLES), async (req, res) => {
    const { fdId } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const managerInfo = await getManagerBranchId(connection, req.user.id);
        const employeeId = managerInfo?.EMPLOYEE_ID || req.user.id;

        await connection.execute(
            `BEGIN sp_process_fd_maturity(:id, :manager); END;`,
            { id: Number(fdId), manager: employeeId },
            { autoCommit: true }
        );
        res.json({ message: 'FD maturity processed successfully.' });
    } catch (err) {
        const error = mapOracleError(err);
        res.status(error.status).json({ message: error.message });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
