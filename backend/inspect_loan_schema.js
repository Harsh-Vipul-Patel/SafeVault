require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function inspectSchema() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        const query = `
            SELECT column_name, data_type, data_length, data_precision, data_scale
            FROM user_tab_columns
            WHERE table_name IN ('LOAN_APPLICATIONS', 'LOAN_ACCOUNTS')
            ORDER BY table_name, column_id
        `;
        const result = await connection.execute(query);
        console.log(`Schema details:`);
        result.rows.forEach(r => {
            console.log(`${r.COLUMN_NAME}: ${r.DATA_TYPE} length: ${r.DATA_LENGTH}, precision: ${r.DATA_PRECISION}, scale: ${r.DATA_SCALE}`);
        });
    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}
inspectSchema();
