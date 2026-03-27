require('dotenv').config();
const oracledb = require('oracledb');

async function test() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER||'C##HARSHUERSR', 
            password: process.env.DB_PASSWORD||'password123', 
            connectionString: process.env.DB_CONNECTION_STRING||'localhost:1521/XEPDB1'
        });
        const query = `
            SELECT o.otp_id, o.otp_hash, o.expires_at, o.attempts, o.status, e.email 
            FROM OTPS o
            JOIN EMPLOYEES e ON o.user_id = e.user_id
            WHERE e.employee_id = :param_uid 
            AND o.purpose = :param_purpose 
            ORDER BY o.created_at DESC FETCH FIRST 1 ROWS ONLY
        `;
        const res = await conn.execute(query, { param_uid: 'EMP-MUM-MGR-01', param_purpose: 'ACCOUNT_STATUS_CHANGE' }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log("Success", res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
}
test();
