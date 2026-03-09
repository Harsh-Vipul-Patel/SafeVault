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

        console.log('--- TRIGGER TRG_TRANSACTION_VELOCITY ---');
        const trigger = await connection.execute("SELECT text FROM user_source WHERE name = 'TRG_TRANSACTION_VELOCITY' ORDER BY line");
        trigger.rows.forEach(r => console.log(r[0]));

        console.log('--- PROCEDURE SP_WITHDRAW ---');
        const proc = await connection.execute("SELECT text FROM user_source WHERE name = 'SP_WITHDRAW' ORDER BY line");
        proc.rows.forEach(r => console.log(r[0]));
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
    }
}

run();
