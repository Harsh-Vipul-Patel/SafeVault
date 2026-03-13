require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function testIntake() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        
        console.log('Fetching real IDs for test...');
        const ids = await connection.execute('SELECT (SELECT customer_id FROM customers FETCH FIRST 1 ROW ONLY) as cid, (SELECT branch_id FROM branches FETCH FIRST 1 ROW ONLY) as bid FROM dual');
        const { CID, BID } = ids.rows[0];

        console.log(`Inserting test application with annual rate 15.5 for ${CID} at ${BID}...`);
        const result = await connection.execute(
            `INSERT INTO LOAN_APPLICATIONS 
             (customer_id, branch_id, loan_type, requested_amount, tenure_months, annual_rate, status, reviewed_by)
             VALUES (:cid, :bid, 'PERSONAL', 50000, 24, 15.5, 'RECEIVED', NULL)
             RETURNING RAWTOHEX(loan_app_id) INTO :appid`,
            {
                cid: CID,
                bid: BID,
                appid: { type: oracledb.STRING, dir: oracledb.BIND_OUT }
            },
            { autoCommit: true }
        );
        
        console.log(`Success! Application ID: ${result.outBinds.appid[0]}`);
        
        // Clean up the test row
        await connection.execute(`DELETE FROM LOAN_APPLICATIONS WHERE RAWTOHEX(loan_app_id) = :id`, { id: result.outBinds.appid[0] }, { autoCommit: true });
        console.log('Cleaned up test row.');

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}
testIntake();
