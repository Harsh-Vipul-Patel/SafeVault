require('dotenv').config();
const oracledb = require('oracledb');

async function describeTable() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        const result = await connection.execute(
            `SELECT column_name FROM user_tab_columns WHERE table_name = 'USERS' ORDER BY column_id`
        );

        console.log("USERS Table Columns:");
        result.rows.forEach(row => {
            console.log(`- ${row[0]}`);
        });

    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        if (connection) await connection.close();
    }
}

describeTable();
