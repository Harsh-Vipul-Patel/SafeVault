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

        console.log("Describing USERS table...");
        const result = await connection.execute(
            `SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'USERS'`
        );

        result.rows.forEach(row => {
            console.log(`Column: ${row[0]}, Type: ${row[1]}`);
        });

    } catch (err) {
        console.error("Error describing table:", err.message);
    } finally {
        if (connection) await connection.close();
    }
}

describeTable();
