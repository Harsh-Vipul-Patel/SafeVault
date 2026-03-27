const oracledb = require('oracledb');
require('dotenv').config({path: './.env'});

(async () => {
    let conn;
    try {
        conn = await oracledb.getConnection({user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECTION_STRING});
        const dual = await conn.execute(`SELECT q.* FROM DUAL_APPROVAL_QUEUE q WHERE status = 'PENDING'`);
        const ext = await conn.execute(`SELECT p.* FROM PENDING_EXTERNAL_TRANSFERS p WHERE status = 'PENDING'`);
        
        console.log("Dual Approvals:", dual.rows.length);
        console.log("Pending External Transfers:", ext.rows.length);
        console.log("Ext data:", ext.rows);
    } catch(e) { console.error(e); } finally { if(conn) await conn.close(); }
})();
