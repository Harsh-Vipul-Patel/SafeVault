require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function fixPrecision() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        
        console.log('Altering ANNUAL_RATE in LOAN_APPLICATIONS...');
        await connection.execute(`ALTER TABLE LOAN_APPLICATIONS MODIFY (annual_rate NUMBER(5,2))`);
        console.log('Success.');

        // Also check if LOAN_ACCOUNTS needs it, though it doesn't currently have an annual_rate column. 
        // We'll also check EMI_SCHEDULE since the EMI_AMOUNT could potentially need it if rates change wildly.
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}
fixPrecision();
