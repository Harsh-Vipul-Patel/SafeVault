require('dotenv').config();
const oracledb = require('oracledb');
const crypto = require('crypto');

async function resetPasswords() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        const newHash = crypto.createHash('sha256').update('password').digest('hex');
        console.log('Updating all users to password hash:', newHash);

        const result = await connection.execute(
            `UPDATE USERS SET password_hash = :newHash, failed_attempts = 0, is_locked = '0'`,
            { newHash },
            { autoCommit: true }
        );

        console.log(`SUCCESS: Updated ${result.rowsAffected} users.`);

    } catch (err) {
        console.error("Error updating passwords:", err.message);
    } finally {
        if (connection) await connection.close();
    }
}

resetPasswords();
