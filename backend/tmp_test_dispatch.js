const oracledb = require('oracledb');
const { processPendingNotifications } = require('./lib/dispatchEmail');
require('dotenv').config();

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('Triggering pending notifications for CUST-001...');
        await processPendingNotifications('CUST-001', connection, false);
        
        console.log('Checking NOTIFICATION_LOG for CUST-001...');
        const result = await connection.execute(
            `SELECT notif_id, customer_id, trigger_event, status, resend_message_id, created_at 
             FROM NOTIFICATION_LOG WHERE customer_id = 'CUST-001'
             ORDER BY created_at DESC FETCH FIRST 5 ROWS ONLY`
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
