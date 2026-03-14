require('dotenv').config({ path: './.env' });
const oracledb = require('oracledb');

async function testConnection() {
    let connection;
    try {
        console.log('Connecting with:', {
            user: process.env.DB_USER,
            connectString: process.env.DB_CONNECTION_STRING
        });
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        console.log('SUCCESS: Connected to Oracle DB!');
        const res = await connection.execute('SELECT SYSDATE FROM DUAL');
        console.log('Date from DB:', res.rows[0]);
    } catch (err) {
        console.error('FAILURE: Could not connect to Oracle DB:', err.message);
        require('fs').writeFileSync('db_error.txt', err.message);
    } finally {
        if (connection) await connection.close();
    }
}

testConnection();
