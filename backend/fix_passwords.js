const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

async function fixPasswords() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        const hash = await bcrypt.hash('password', 10);
        console.log(`Setting password hash to: ${hash}`);

        await conn.execute(
            `UPDATE USERS SET password_hash = :h`,
            { h: hash },
            { autoCommit: true }
        );

        console.log('All passwords updated to bcrypt hash of "password".');
    } catch (err) {
        console.error('Error updating passwords:', err);
    } finally {
        if (conn) await conn.close();
    }
}

fixPasswords();
