const oracledb = require('oracledb');
require('dotenv').config({path: './.env'});

(async () => {
    let conn;
    try {
        conn = await oracledb.getConnection({user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECTION_STRING});
        const q = `
             SELECT RAWTOHEX(q.queue_id) AS queue_id, q.operation_type, q.status, CAST(q.created_at AS TIMESTAMP(6)) AS created_at,
                    u.username AS requested_by_name
             FROM DUAL_APPROVAL_QUEUE q
             LEFT JOIN USERS u ON q.requested_by = u.user_id
             WHERE q.status = 'PENDING'
             UNION ALL
             SELECT RAWTOHEX(p.transfer_id) AS queue_id, 'EXTERNAL_TRANSFER' AS operation_type, p.status, CAST(p.initiated_at AS TIMESTAMP(6)) AS created_at,
                    p.initiated_by AS requested_by_name
             FROM PENDING_EXTERNAL_TRANSFERS p
             WHERE p.status = 'PENDING'
             ORDER BY created_at ASC
             FETCH FIRST 5 ROWS ONLY`;
        const r = await conn.execute(q, [], {outFormat: oracledb.OUT_FORMAT_OBJECT});
        console.log("Union works!", r.rows);
    } catch(e){ console.error(e); } finally { if(conn) await conn.close();}
})();
