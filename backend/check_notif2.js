const oracledb = require('oracledb');
require('dotenv').config({path: './.env'});

(async () => {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        const res = await conn.execute(
            `SELECT notif_id, trigger_event, status, resend_message_id, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as c_at 
             FROM NOTIFICATION_LOG 
             WHERE customer_id = 'CUST-001' AND trigger_event = 'RD_OPENED'
             ORDER BY created_at DESC FETCH FIRST 5 ROWS ONLY`
        );
        console.log("RD_OPENED Notifications:");
        res.rows.forEach(r => console.log(r));
    } catch (e) { console.error(e); } 
    finally { if (conn) await conn.close(); }
})();
