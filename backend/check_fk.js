require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function checkConstraint() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        
        console.log('Fetching constraint details for SYS_C009638...');
        const result = await connection.execute(
            `SELECT a.table_name, a.column_name, a.constraint_name, c.r_owner, c_pk.table_name r_table_name, b.column_name r_column_name
             FROM user_cons_columns a
             JOIN user_constraints c ON a.owner = c.owner AND a.constraint_name = c.constraint_name
             JOIN user_constraints c_pk ON c.r_owner = c_pk.owner AND c.r_constraint_name = c_pk.constraint_name
             JOIN user_cons_columns b ON c_pk.owner = b.owner AND c_pk.constraint_name = b.constraint_name
             WHERE c.constraint_name = 'SYS_C009638'`
        );
        
        console.log(result.rows);
        
        // Also let's check the customers and accounts provided
        const custId = 'CUST-MUM-001';
        const accId = 'ACC-MUM-003-1029';
        
        const cust = await connection.execute(`SELECT customer_id FROM customers WHERE customer_id = :id`, { id: custId });
        console.log(`Cust check: ${cust.rows.length}`);
        
        const acc = await connection.execute(`SELECT account_id FROM accounts WHERE account_id = :id`, { id: accId });
        console.log(`Acc check: ${acc.rows.length}`);

        const acc2 = await connection.execute(`SELECT account_id FROM accounts WHERE account_number = :id`, { id: accId });
        console.log(`Acc by number check: ${acc2.rows.length}`);
        
    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}
checkConstraint();
