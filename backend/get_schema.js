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

        console.log('--- USERS ---');
        const uDesc = await connection.execute("SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'USERS'");
        console.table(uDesc.rows);

        console.log('--- OTPS ---');
        const oDesc = await connection.execute("SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'OTPS'");
        console.table(oDesc.rows);
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
    }
}

run();
