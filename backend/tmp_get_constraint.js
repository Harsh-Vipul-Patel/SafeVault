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
            `SELECT search_condition FROM user_constraints WHERE constraint_name = 'CHK_SR_TYPE'`
        );
        console.log(result.rows[0][0]);
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
    }
}

run();
