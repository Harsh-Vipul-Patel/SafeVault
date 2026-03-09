const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        await conn.execute("UPDATE USERS SET is_locked='0', failed_attempts=0");
        await conn.commit();
        console.log('Successfully unlocked users and reset failed attempts.');
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
}
run();
