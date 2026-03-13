const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './backend/.env' });

async function runSqlFile(connection, filePath) {
    const sql = fs.readFileSync(filePath, 'utf8');
    // Split by '/' at the beginning of a line, which is common in these Oracle scripts
    const statements = sql.split(/\r?\n\/\r?\n/);

    for (let statement of statements) {
        statement = statement.trim();
        if (!statement || statement.startsWith('--')) continue;

        try {
            console.log(`Executing statement starting with: ${statement.substring(0, 50)}...`);
            await connection.execute(statement);
        } catch (err) {
            console.error(`Error executing statement: ${err.message}`);
            // Some errors like "table already exists" might be expected if the script is not idempotent
        }
    }
}

async function main() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('Running db_resend_setup.sql...');
        await runSqlFile(connection, path.join(__dirname, 'db_resend_setup.sql'));

        console.log('Running db_kyc_setup.sql...');
        await runSqlFile(connection, path.join(__dirname, 'db_kyc_setup.sql'));

        await connection.commit();
        console.log('All scripts executed and committed.');
    } catch (err) {
        console.error('Database Error:', err.message);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err.message);
            }
        }
    }
}

main();
