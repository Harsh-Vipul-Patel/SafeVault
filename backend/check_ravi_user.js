require('dotenv').config();
const oracledb = require('oracledb');

async function checkUser() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        const result = await connection.execute(
            `SELECT username, password_hash, user_type, is_locked, failed_attempts FROM USERS WHERE LOWER(username) = LOWER(:uname)`,
            { uname: 'ravi.verma' },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            console.log("User 'ravi.verma' NOT found.");
        } else {
            console.log("User details:", result.rows[0]);
        }

    } catch (err) {
        console.error("Error accessing USERS table:", err.message);
    } finally {
        if (connection) await connection.close();
    }
}

checkUser();
