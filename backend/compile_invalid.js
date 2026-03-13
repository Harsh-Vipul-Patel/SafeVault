require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function compileProcedures() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        
        console.log('Compiling SP_OPEN_ACCOUNT...');
        try {
            await connection.execute(`ALTER PROCEDURE SP_OPEN_ACCOUNT COMPILE`);
            console.log('Successfully compiled SP_OPEN_ACCOUNT');
        } catch (err) {
            console.error('Error compiling SP_OPEN_ACCOUNT:', err.message);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}
compileProcedures();
