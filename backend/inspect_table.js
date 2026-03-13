const oracledb = require('oracledb');
require('dotenv').config({ path: './backend/.env' });

async function inspectTable() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('--- USERS TABLE COLUMNS ---');
        const result = await conn.execute(
            `SELECT column_name, data_type 
             FROM user_tab_columns 
             WHERE table_name = 'USERS'
             ORDER BY column_id`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        result.rows.forEach(col => {
            console.log(`Column: ${col.COLUMN_NAME} | Type: ${col.DATA_TYPE}`);
        });

    } catch (err) {
        console.error('Inspection Error:', err.message);
    } finally {
        if (conn) await conn.close();
    }
}

inspectTable();
