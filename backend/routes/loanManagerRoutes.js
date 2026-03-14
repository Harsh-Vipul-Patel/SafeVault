const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { processPendingNotifications } = require('../lib/dispatchEmail');

const LOAN_ROLES = ['LOAN_MANAGER', 'BRANCH_MANAGER', 'SYSTEM_ADMIN'];

async function getEmployeeId(userId) {
    const result = await query(
        `SELECT e.employee_id, e.branch_id FROM EMPLOYEES e
         JOIN USERS u ON e.user_id = u.user_id
         WHERE u.user_id = $1 OR e.employee_id = $2`,
        [userId, userId]
    );
    return result.rows[0] || null;
}

// POST /api/loan-manager/application/intake
router.post('/application/intake', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { customerId, branchId, loanType, requestedAmount, tenureMonths, annualRate, linkedAccountId } = req.body;
    try {
        const emp = await getEmployeeId(req.user?.id);

        const result = await query(
            `INSERT INTO LOAN_APPLICATIONS (customer_id, branch_id, loan_type, requested_amount, tenure_months, annual_rate, linked_account_id, status, reviewed_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'RECEIVED', $8)
             RETURNING loan_app_id`,
            [
                customerId,
                branchId || emp?.branch_id,
                loanType,
                Number(requestedAmount),
                Number(tenureMonths),
                Number(annualRate),
                linkedAccountId || null,
                emp?.employee_id
            ]
        );

        res.json({ message: 'Application intake successful', loanAppId: result.rows[0].loan_app_id });
    } catch (err) {
        console.error('Intake Error:', err);
        res.status(500).json({ message: 'Failed to create application: ' + err.message });
    }
});

// POST /api/loan-manager/application/:id/status
router.post('/application/:id/status', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { id } = req.params;
    const { status, note } = req.body;
    try {
        const emp = await getEmployeeId(req.user?.id);

        await query(
            `CALL sp_update_loan_status($1, $2, $3, $4)`,
            [id, status, note, emp?.employee_id]
        );

        processPendingNotifications(req.user.id, null).catch(e => console.error(e));

        res.json({ message: `Application status updated to ${status}` });
    } catch (err) {
        console.error('Status Update Error:', err);
        res.status(500).json({ message: 'Failed to update status: ' + err.message });
    }
});

// POST /api/loan-manager/emi/generate
router.post('/emi/generate', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { loanAccountId, principal, annualRate, tenureMonths } = req.body;
    try {
        // Due to schema constraints, the LOAN_ACCOUNTS record must exist before generating schedule.
        try {
            await query(
                `INSERT INTO LOAN_ACCOUNTS (loan_account_id, disbursed_amount, outstanding_principal, status) 
                 VALUES ($1, $2, $3, 'PENDING') ON CONFLICT (loan_account_id) DO NOTHING`,
                [loanAccountId, principal, principal]
            );
        } catch (e) {
            // ignore if exists
        }

        await query(
            `CALL sp_generate_emi_schedule($1, $2, $3, $4)`,
            [
                loanAccountId,
                Number(principal),
                Number(annualRate),
                Number(tenureMonths)
            ]
        );

        res.json({ message: 'EMI Schedule generated successfully' });
    } catch (err) {
        console.error('EMI Generate Error:', err);
        res.status(500).json({ message: 'Failed to generate schedule: ' + err.message });
    }
});

// POST /api/loan-manager/disburse
router.post('/disburse', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { loanAppId } = req.body;
    try {
        const emp = await getEmployeeId(req.user?.id);

        await query(
            `CALL sp_disburse_loan($1, $2)`,
            [loanAppId, emp?.employee_id]
        );

        processPendingNotifications(req.user.id, null).catch(e => console.error(e));

        res.json({ message: 'Disbursement operation completed (either auto-disbursed or sent for approval).' });
    } catch (err) {
        console.error('Disburse Error:', err);
        res.status(500).json({ message: 'Failed to disburse: ' + err.message });
    }
});

// POST /api/loan-manager/emi/pay
router.post('/emi/pay', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { emiId } = req.body;
    try {
        const emp = await getEmployeeId(req.user?.id);

        await query(
            `CALL sp_record_emi_payment($1, $2)`,
            [Number(emiId), emp?.employee_id]
        );

        processPendingNotifications(req.user.id, null).catch(e => console.error(e));

        res.json({ message: 'EMI repayment recorded successfully.' });
    } catch (err) {
        console.error('EMI Pay Error:', err);
        res.status(500).json({ message: 'Repayment failed: ' + err.message });
    }
});

// GET /api/loan-manager/account/:id/emis
router.get('/account/:id/emis', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query(
            `SELECT emi_id, emi_number, due_date, emi_amount, principal_component, interest_component, closing_balance, status, penalty_amount 
             FROM EMI_SCHEDULE WHERE loan_account_id = $1 ORDER BY emi_number ASC`,
            [id]
        );
        res.json({ emis: result.rows });
    } catch (err) {
        console.error('Fetch EMIs Error:', err);
        res.status(500).json({ message: 'Failed to fetch EMIs: ' + err.message });
    }
});

// POST /api/loan-manager/close
router.post('/close', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { loanAccountId } = req.body;
    try {
        const emp = await getEmployeeId(req.user?.id);

        await query(
            `CALL sp_close_loan($1, $2)`,
            [loanAccountId, emp?.employee_id]
        );

        res.json({ message: 'Loan closed successfully.' });
    } catch (err) {
        console.error('Loan Close Error:', err);
        res.status(500).json({ message: 'Closure failed: ' + err.message });
    }
});

// GET /api/loan-manager/reports/portfolio
router.get('/reports/portfolio', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    try {
        const emp = await getEmployeeId(req.user?.id);
        const branchId = emp?.branch_id;

        // Portfolio overview
        const kpis = await query(
            `SELECT 
                COUNT(CASE WHEN la.status = 'ACTIVE' THEN 1 END) as active_loans_count,
                SUM(CASE WHEN la.status = 'ACTIVE' THEN acc.outstanding_principal ELSE 0 END) as active_loans_value,
                COUNT(CASE WHEN la.status IN ('RECEIVED', 'UNDER_REVIEW') THEN 1 END) as pending_review_count
             FROM LOAN_APPLICATIONS la
             LEFT JOIN LOAN_ACCOUNTS acc ON la.loan_app_id = acc.loan_app_id
             ${branchId ? 'WHERE la.branch_id = $1' : ''}`,
            branchId ? [branchId] : []
        );

        const loans = await query(
            `SELECT la.loan_app_id, 
                    acc.loan_account_id, 
                    c.full_name as customer_name,
                    la.loan_type,
                    COALESCE(acc.outstanding_principal, la.requested_amount) as outstanding_principal,
                    acc.status as account_status,
                    la.status as app_status
             FROM LOAN_APPLICATIONS la
             JOIN CUSTOMERS c ON la.customer_id = c.customer_id
             LEFT JOIN LOAN_ACCOUNTS acc ON la.loan_app_id = acc.loan_app_id
             ${branchId ? 'WHERE la.branch_id = $1' : ''}
             ORDER BY la.applied_at DESC`,
            branchId ? [branchId] : []
        );

        const emiDue = await query(
            `SELECT COUNT(*) as count, COALESCE(SUM(emi_amount), 0) as total
             FROM EMI_SCHEDULE
             WHERE status = 'PENDING' AND due_date::date <= CURRENT_DATE`
        );

        const kpiRow = kpis.rows[0] || {};
        const emiRow = emiDue.rows[0] || {};

        res.json({
            kpis: {
                ACTIVE_LOANS_COUNT: kpiRow.active_loans_count || 0,
                ACTIVE_LOANS_VALUE: kpiRow.active_loans_value || 0,
                PENDING_REVIEW_COUNT: kpiRow.pending_review_count || 0
            },
            loans: loans.rows,
            emisDueToday: {
                count: emiRow.count || 0,
                total: emiRow.total || 0
            }
        });
    } catch (err) {
        console.error('Portfolio Fetch Error:', err);
        res.status(500).json({ message: 'Fetch failed: ' + err.message });
    }
});

module.exports = router;
