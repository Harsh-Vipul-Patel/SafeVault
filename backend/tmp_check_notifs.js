const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('Checking NOTIFICATION_LOG...');
        const result = await connection.execute(
            `SELECT notif_id, customer_id, trigger_event, status, created_at 
             FROM NOTIFICATION_LOG 
             ORDER BY created_at DESC FETCH FIRST 10 ROWS ONLY`
        );
        console.table(result.rows);
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch(e) { console.error(e); }
        }
    }
}

run();
