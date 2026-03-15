const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        const result = await connection.execute(
            `SELECT column_name, data_type, data_length FROM user_tab_columns WHERE table_name = 'SERVICE_REQUESTS'`
        );
        console.table(result.rows);
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
    }
}

run();
