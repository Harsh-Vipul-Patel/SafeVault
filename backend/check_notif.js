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
            `SELECT notif_id, trigger_event, status, message_clob, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as c_at 
             FROM NOTIFICATION_LOG 
             ORDER BY created_at DESC FETCH FIRST 10 ROWS ONLY`
        );
        console.log("Recent Notifications:");
        res.rows.forEach(r => console.log(r));
    } catch (e) { console.error(e); } 
    finally { if (conn) await conn.close(); }
})();
