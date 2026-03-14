require('dotenv').config();
const oracledb = require('oracledb');

async function locateTable() {
    let connection;
    try {
        console.log('Connecting as:', process.env.DB_USER);
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('Querying user_tables...');
        const userTables = await connection.execute(
            `SELECT table_name FROM user_tables WHERE table_name = 'USERS'`
        );
        if (userTables.rows.length > 0) {
            console.log('SUCCESS: USERS table found in your schema.');
        } else {
            console.log('USERS table NOT found in your schema.');
        }

        console.log('Querying all_tables...');
        const allTables = await connection.execute(
            `SELECT owner, table_name FROM all_tables WHERE table_name = 'USERS'`
        );
        if (allTables.rows.length > 0) {
            console.log('USERS table found in the following schemas:');
            allTables.rows.forEach(row => console.log(` - ${row[0]}`));
        } else {
            console.log('USERS table NOT found in ANY schema you have access to.');
        }

    } catch (err) {
        console.error("Error searching for table:", err.message);
    } finally {
        if (connection) await connection.close();
    }
}

locateTable();
