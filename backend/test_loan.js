require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function testQuery() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        const branchId = 'BRN-MUM-003';

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
        console.log("KPIs OK", kpis.rows[0]);

        const emiDue = await connection.execute(
            `SELECT COUNT(*) as count, NVL(SUM(emi_amount), 0) as total
             FROM EMI_SCHEDULE
             WHERE status = 'PENDING' AND TRUNC(due_date) <= TRUNC(SYSDATE)`,
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log("EMI OK:", emiDue.rows[0]);

    } catch (e) {
        console.error("ORACLE ERROR:", e.message);
    } finally {
        if (connection) await connection.close();
        await closeDBPool();
    }
}
testQuery();
