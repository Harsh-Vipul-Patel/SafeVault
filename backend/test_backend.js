require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function testQuery() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();

        // 1. Deposits
        await connection.execute(`SELECT NVL(SUM(amount), 0) AS total FROM TRANSACTIONS WHERE TRUNC(transaction_date) = TRUNC(SYSDATE)`);
        console.log("Deposits OK");

        // 2. Withdrawals
        await connection.execute(`SELECT NVL(SUM(amount), 0) AS total FROM TRANSACTIONS WHERE TRUNC(transaction_date) = TRUNC(SYSDATE)`);
        console.log("Withdrawals OK");

        // 3. Pending
        await connection.execute(`SELECT COUNT(*) AS total FROM DUAL_APPROVAL_QUEUE WHERE status = 'PENDING'`);
        console.log("Pending OK");

        // 4. Accounts
        await connection.execute(`SELECT COUNT(*) AS total FROM ACCOUNTS WHERE TRUNC(opened_date) = TRUNC(SYSDATE)`);
        console.log("Accounts OK");

        // 5. Txns
        await connection.execute(`SELECT t.transaction_id, t.transaction_type, t.amount, t.account_id, t.transaction_date, t.description, t.initiated_by FROM TRANSACTIONS t ORDER BY t.transaction_date DESC FETCH FIRST 5 ROWS ONLY`);
        console.log("Txns OK");

        // 6. Flags
        await connection.execute(`SELECT cf.flag_id, cf.flag_type, cf.account_id, cf.flagged_at, cf.threshold_value FROM COMPLIANCE_FLAGS cf ORDER BY cf.flagged_at DESC FETCH FIRST 3 ROWS ONLY`);
        console.log("Flags OK");

        // 7. Preview
        await connection.execute(`SELECT q.queue_id, q.operation_type, q.status, q.created_at, q.payload_json, u.username AS requested_by_name FROM DUAL_APPROVAL_QUEUE q LEFT JOIN USERS u ON q.requested_by = u.user_id WHERE q.status = 'PENDING' ORDER BY q.created_at ASC FETCH FIRST 3 ROWS ONLY`);
        console.log("Preview OK");

    } catch (e) {
        console.error("ORACLE ERROR:", e.message);
    } finally {
        if (connection) await connection.close();
        await closeDBPool();
    }
}
testQuery();
