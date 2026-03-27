const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { verifyToken, requireRole } = require('../middleware/auth');
const { processPendingNotifications } = require('../lib/dispatchEmail');

const LOAN_ROLES = ['LOAN_MANAGER', 'BRANCH_MANAGER', 'SYSTEM_ADMIN'];

async function getEmployeeId(connection, userId) {
    const result = await connection.execute(
        `SELECT e.employee_id, e.branch_id FROM EMPLOYEES e
         JOIN USERS u ON e.user_id = u.user_id
         WHERE RAWTOHEX(u.user_id) = :u_id1 OR e.employee_id = :u_id2`,
        { u_id1: userId, u_id2: userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0] || null;
}

// POST /api/loan-manager/application/intake
router.post('/application/intake', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { customerId, branchId, loanType, requestedAmount, tenureMonths, annualRate, linkedAccountId } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const emp = await getEmployeeId(connection, req.user?.id);

        const result = await connection.execute(
            `INSERT INTO LOAN_APPLICATIONS (customer_id, branch_id, loan_type, requested_amount, tenure_months, annual_rate, linked_account_id, status, reviewed_by)
             VALUES (:cid, :bid, :ltype, :amt, :tenure, :rate, :lnk, 'RECEIVED', :rev)
             RETURNING RAWTOHEX(loan_app_id) INTO :appid`,
            {
                cid: customerId,
                bid: branchId || emp?.BRANCH_ID,
                ltype: loanType,
                amt: Number(requestedAmount),
                tenure: Number(tenureMonths),
                rate: Number(annualRate),
                lnk: linkedAccountId || null,
                rev: emp?.EMPLOYEE_ID,
                appid: { type: oracledb.STRING, dir: oracledb.BIND_OUT }
            },
            { autoCommit: true }
        );

        res.json({ message: 'Application intake successful', loanAppId: result.outBinds.appid[0] });
    } catch (err) {
        console.error('Intake Error:', err);
        res.status(500).json({ message: 'Failed to create application: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/loan-manager/application/:id/status
router.post('/application/:id/status', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { id } = req.params;
    const { status, note } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const emp = await getEmployeeId(connection, req.user?.id);

        await connection.execute(
            `BEGIN sp_update_loan_status(HEXTORAW(:appid), :status, :note, :emp); END;`,
            { appid: id, status, note, emp: emp?.EMPLOYEE_ID },
            { autoCommit: true }
        );

        const appRes = await connection.execute(
            `SELECT customer_id FROM LOAN_APPLICATIONS WHERE loan_app_id = HEXTORAW(:id)`, { id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const customerId = appRes.rows[0]?.CUSTOMER_ID;
        if (customerId) await processPendingNotifications(customerId, connection, false).catch(e => console.error('Cust Notif Error:', e));
        
        await processPendingNotifications(req.user.id, connection, false).catch(e => console.error('Emp Notif Error:', e));

        res.json({ message: `Application status updated to ${status}` });
    } catch (err) {
        console.error('Status Update Error:', err);
        res.status(500).json({ message: 'Failed to update status: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// PUT /api/loan-manager/application/:id/terms — Edit amount and rate
router.put('/application/:id/terms', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { id } = req.params;
    const { requestedAmount, annualRate } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const emp = await getEmployeeId(connection, req.user?.id);

        const result = await connection.execute(
            `UPDATE LOAN_APPLICATIONS 
             SET requested_amount = :amt, annual_rate = :rate, reviewed_by = :emp
             WHERE loan_app_id = HEXTORAW(:id) AND status IN ('RECEIVED', 'UNDER_REVIEW')`,
            {
                amt: Number(requestedAmount),
                rate: Number(annualRate),
                emp: emp?.EMPLOYEE_ID,
                id
            },
            { autoCommit: true }
        );

        if (result.rowsAffected === 0) {
            return res.status(400).json({ message: 'Loan not found or cannot be edited in its current status.' });
        }

        res.json({ message: 'Loan terms updated successfully.' });
    } catch (err) {
        console.error('Terms Update Error:', err);
        res.status(500).json({ message: 'Failed to update loan terms: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});


// POST /api/loan-manager/emi/generate
router.post('/emi/generate', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    // Note: requires loanAccountId, principal, annualRate, tenureMonths
    const { loanAccountId, principal, annualRate, tenureMonths } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();

        // Due to schema constraints, the LOAN_ACCOUNTS record must exist before generating schedule.
        // We will silently insert a PENDING LOAN_ACCOUNTS record if it doesn't exist, linked to loanAppId = loanAccountId for simplicity in UI if it passes app_id
        try {
            await connection.execute(
                `INSERT INTO LOAN_ACCOUNTS (loan_account_id, disbursed_amount, outstanding_principal, status) 
                 VALUES (:id, :amt, :amt, 'PENDING')`,
                { id: loanAccountId, amt: principal },
                { autoCommit: true }
            );
        } catch (e) {
            // ignore if exists
        }

        await connection.execute(
            `BEGIN sp_generate_emi_schedule(:id, :prin, :rate, :tenure); END;`,
            {
                id: loanAccountId,
                prin: Number(principal),
                rate: Number(annualRate),
                tenure: Number(tenureMonths)
            },
            { autoCommit: true }
        );

        res.json({ message: 'EMI Schedule generated successfully' });
    } catch (err) {
        console.error('EMI Generate Error:', err);
        res.status(500).json({ message: 'Failed to generate schedule: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/loan-manager/disburse
router.post('/disburse', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { loanAppId } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const emp = await getEmployeeId(connection, req.user?.id);

        await connection.execute(
            `BEGIN sp_disburse_loan(HEXTORAW(:appid), :emp); END;`,
            { appid: loanAppId, emp: emp?.EMPLOYEE_ID },
            { autoCommit: true }
        );

        const appRes = await connection.execute(
            `SELECT customer_id FROM LOAN_APPLICATIONS WHERE loan_app_id = HEXTORAW(:id)`, { id: loanAppId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const customerId = appRes.rows[0]?.CUSTOMER_ID;
        if (customerId) await processPendingNotifications(customerId, connection, false).catch(e => console.error('Cust Notif Error:', e));

        await processPendingNotifications(req.user.id, connection, false).catch(e => console.error('Emp Notif Error:', e));

        res.json({ message: 'Disbursement operation completed (either auto-disbursed or sent for approval).' });
    } catch (err) {
        console.error('Disburse Error:', err);
        res.status(500).json({ message: 'Failed to disburse: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/loan-manager/emi/pay
router.post('/emi/pay', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { emiId } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const emp = await getEmployeeId(connection, req.user?.id);

        await connection.execute(
            `BEGIN sp_record_emi_payment(:emi, :emp); END;`,
            { emi: Number(emiId), emp: emp?.EMPLOYEE_ID },
            { autoCommit: true }
        );

        const emiRes = await connection.execute(
            `SELECT la.customer_id FROM EMI_SCHEDULE es JOIN LOAN_ACCOUNTS lac ON es.loan_account_id = lac.loan_account_id JOIN LOAN_APPLICATIONS la ON lac.loan_app_id = la.loan_app_id WHERE emi_id = :id`, { id: emiId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const customerId = emiRes.rows[0]?.CUSTOMER_ID;
        if (customerId) await processPendingNotifications(customerId, connection, false).catch(e => console.error('Cust Notif Error:', e));

        await processPendingNotifications(req.user.id, connection, false).catch(e => console.error('Emp Notif Error:', e));

        res.json({ message: 'EMI repayment recorded successfully.' });
    } catch (err) {
        console.error('EMI Pay Error:', err);
        res.status(500).json({ message: 'Repayment failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/loan-manager/account/:id/emis
router.get('/account/:id/emis', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const result = await connection.execute(
            `SELECT emi_id, emi_number, due_date, emi_amount, principal_component, interest_component, closing_balance, status, penalty_amount 
             FROM EMI_SCHEDULE WHERE loan_account_id = :id ORDER BY emi_number ASC`,
            { id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ emis: result.rows });
    } catch (err) {
        console.error('Fetch EMIs Error:', err);
        res.status(500).json({ message: 'Failed to fetch EMIs: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// POST /api/loan-manager/close
router.post('/close', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    const { loanAccountId } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection();
        const emp = await getEmployeeId(connection, req.user?.id);

        await connection.execute(
            `BEGIN sp_close_loan(:acc, :emp); END;`,
            { acc: loanAccountId, emp: emp?.EMPLOYEE_ID },
            { autoCommit: true }
        );

        res.json({ message: 'Loan closed successfully.' });
    } catch (err) {
        console.error('Loan Close Error:', err);
        res.status(500).json({ message: 'Closure failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// GET /api/loan-manager/reports/portfolio
router.get('/reports/portfolio', verifyToken, requireRole(LOAN_ROLES), async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection();
        const emp = await getEmployeeId(connection, req.user?.id);
        const branchId = emp?.BRANCH_ID;

        // Portfolio overview
        const kpis = await connection.execute(
            `SELECT 
                COUNT(CASE WHEN la.status = 'ACTIVE' THEN 1 END) as active_loans_count,
                SUM(CASE WHEN la.status = 'ACTIVE' THEN acc.outstanding_principal ELSE 0 END) as active_loans_value,
                COUNT(CASE WHEN la.status IN ('RECEIVED', 'UNDER_REVIEW') THEN 1 END) as pending_review_count
             FROM LOAN_APPLICATIONS la
             LEFT JOIN LOAN_ACCOUNTS acc ON la.loan_app_id = acc.loan_app_id
             ${branchId ? 'WHERE la.branch_id = :bid' : ''}`,
            branchId ? { bid: branchId } : {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const loans = await connection.execute(
            `SELECT RAWTOHEX(la.loan_app_id) as loan_app_id, 
                    acc.loan_account_id, 
                    c.full_name as customer_name,
                    la.loan_type,
                    NVL(acc.outstanding_principal, la.requested_amount) as outstanding_principal,
                    acc.status as account_status,
                    la.status as app_status
             FROM LOAN_APPLICATIONS la
             JOIN CUSTOMERS c ON la.customer_id = c.customer_id
             LEFT JOIN LOAN_ACCOUNTS acc ON la.loan_app_id = acc.loan_app_id
             ${branchId ? 'WHERE la.branch_id = :bid' : ''}
             ORDER BY la.applied_at DESC`,
            branchId ? { bid: branchId } : {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const emiDue = await connection.execute(
            `SELECT COUNT(*) as count, NVL(SUM(emi_amount), 0) as total
             FROM EMI_SCHEDULE
             WHERE status = 'PENDING' AND TRUNC(due_date) <= TRUNC(SYSDATE)`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const kpiRow = kpis.rows[0] || {};
        const emiRow = emiDue.rows[0] || {};

        res.json({
            kpis: {
                ACTIVE_LOANS_COUNT: kpiRow.ACTIVE_LOANS_COUNT || 0,
                ACTIVE_LOANS_VALUE: kpiRow.ACTIVE_LOANS_VALUE || 0,
                PENDING_REVIEW_COUNT: kpiRow.PENDING_REVIEW_COUNT || 0
            },
            loans: loans.rows,
            emisDueToday: {
                count: emiRow.COUNT || 0,
                total: emiRow.TOTAL || 0
            }
        });
    } catch (err) {
        console.error('Portfolio Fetch Error:', err);
        res.status(500).json({ message: 'Fetch failed: ' + err.message });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
