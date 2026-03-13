require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function checkAcc() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        
        console.log('Fetching accounts...');
        const result = await connection.execute(
            `SELECT account_id, account_number, customer_id, home_branch_id FROM accounts FETCH FIRST 5 ROWS ONLY`
        );
        
        console.log("Top 5 accounts:");
        console.log(result.rows);
        
        const myAcc = await connection.execute(
            `SELECT account_id, account_number, customer_id FROM accounts WHERE account_id LIKE '%ACC%' OR account_number = 'ACC-MUM-003-1029'`
        );
        console.log("My Acc:");
        console.log(myAcc.rows);
        
    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}
checkAcc();
