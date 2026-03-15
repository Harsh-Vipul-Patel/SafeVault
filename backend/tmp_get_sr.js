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

        console.log('--- PROCEDURE SP_CREATE_SERVICE_REQUEST ---');
        const proc1 = await connection.execute("SELECT text FROM user_source WHERE name = 'SP_CREATE_SERVICE_REQUEST' ORDER BY line");
        proc1.rows.forEach(r => console.log(r[0]));

        console.log('--- PROCEDURE SP_RESOLVE_SERVICE_REQUEST ---');
        const proc2 = await connection.execute("SELECT text FROM user_source WHERE name = 'SP_RESOLVE_SERVICE_REQUEST' ORDER BY line");
        proc2.rows.forEach(r => console.log(r[0]));
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
    }
}

run();
