const oracledb = require('oracledb');
require('dotenv').config();

async function checkAudit() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER || 'C##HARSHUERSR',
            password: process.env.DB_PASSWORD || 'password123',
            connectionString: process.env.DB_CONNECTION_STRING || 'localhost:1521/XEPDB1'
        });

        // Check total count
        const countRes = await connection.execute(`SELECT COUNT(*) AS total FROM AUDIT_LOG`);
        console.log(`Total rows in AUDIT_LOG: ${countRes.rows[0][0]}`);

        // Fetch top 5
        const records = await connection.execute(
            `SELECT audit_id, table_name, record_id, operation, changed_by, changed_at FROM AUDIT_LOG ORDER BY changed_at DESC FETCH FIRST 5 ROWS ONLY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log('Recent Records:', records.rows);

    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        if (connection) await connection.close();
    }
}

checkAudit();
