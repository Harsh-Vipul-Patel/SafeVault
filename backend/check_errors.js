require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function checkErrors() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        const query = `SELECT line, position, text FROM user_errors WHERE name = 'SP_OPEN_ACCOUNT' ORDER BY line, position`;
        const result = await connection.execute(query);
        console.log(`Errors for SP_OPEN_ACCOUNT:`);
        result.rows.forEach(r => console.log(`Line ${r.LINE}, Pos ${r.POSITION}: ${r.TEXT}`));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}
checkErrors();
