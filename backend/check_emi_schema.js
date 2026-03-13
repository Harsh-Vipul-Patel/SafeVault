require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function checkEmiSchema() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        
        console.log('EMI_SCHEDULE Schema details:');
        const q1 = await connection.execute(`
            SELECT column_name, data_type, data_length 
            FROM user_tab_columns 
            WHERE table_name IN ('EMI_SCHEDULE', 'LOAN_ACCOUNTS') 
            ORDER BY table_name, column_id
        `);
        console.log(q1.rows);
        
    } catch (err) {
        console.error('Failed:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}
checkEmiSchema();
