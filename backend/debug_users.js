const oracledb = require('oracledb');
require('dotenv').config({ path: './backend/.env' });

async function debugUsers() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('--- USERS TABLE DUMP ---');
        const result = await conn.execute(
            `SELECT username, password_hash, user_type FROM USERS`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            console.log('No users found in the USERS table.');
        } else {
            result.rows.forEach(row => {
                console.log(`User: ${row.USERNAME} | Type: ${row.USER_TYPE} | Hash: ${row.PASSWORD_HASH}`);
            });
        }

    } catch (err) {
        console.error('Database Error:', err.message);
    } finally {
        if (conn) await conn.close();
    }
}

debugUsers();
