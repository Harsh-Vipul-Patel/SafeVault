const oracledb = require('oracledb');
require('dotenv').config();

async function testLogin(username) {
    let connection;
    try {
        await oracledb.createPool({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        connection = await oracledb.getConnection();

        const userResult = await connection.execute(
            `SELECT user_id, username, password_hash, user_type, is_locked, failed_attempts
             FROM USERS
             WHERE LOWER(username) = LOWER(:uname)`,
            { uname: username.trim() },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (userResult.rows.length === 0) {
            console.log('No user found');
            return;
        }

        const user = userResult.rows[0];
        console.log('User found:', user.USERNAME, 'Type:', user.USER_TYPE);

        const userId = user.USER_ID;
        console.log('User ID type:', typeof userId, Buffer.isBuffer(userId) ? 'Buffer' : '');

        const uidHex = userId.toString('hex');

        if (user.USER_TYPE === 'CUSTOMER') {
            const custResult = await connection.execute(
                `SELECT customer_id, full_name FROM CUSTOMERS WHERE user_id = HEXTORAW(:uidHex)`,
                { uidHex },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            console.log('Customer fetch:', custResult.rows);
        } else {
            const empResult = await connection.execute(
                `SELECT employee_id, full_name, role FROM EMPLOYEES WHERE user_id = HEXTORAW(:uidHex) AND is_active = '1'`,
                { uidHex },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            console.log('Employee fetch:', empResult.rows);
        }
    } catch (err) {
        console.error('ERROR CAUGHT:', err);
    } finally {
        if (connection) await connection.close();
        await oracledb.getPool().close(0);
    }
}

testLogin('ravi.verma');
