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

        const proc = process.argv[2] || 'SP_WITHDRAW';
        const result = await connection.execute(
            `SELECT text FROM all_source WHERE name = :proc ORDER BY line`,
            { proc: proc.toUpperCase() }
        );
        console.log(`\n--- PROCEDURE ${proc.toUpperCase()} ---`);
        console.log(result.rows.map(r => r[0]).join(''));
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
    }
}

run();
