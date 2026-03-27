const oracledb = require('oracledb');
require('dotenv').config({path: './.env'});
const { processPendingNotifications } = require('./lib/dispatchEmail');

(async () => {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        console.log("Flushing pending notifications...");
        await processPendingNotifications('CUST-001', conn, false);
        console.log("Done.");
    } catch (e) { console.error(e); } 
    finally { if (conn) await conn.close(); }
})();
