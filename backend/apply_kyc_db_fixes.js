const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './.env' });

async function runSqlFile(connection, filePath) {
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = sql.split(/\r?\n\/\r?\n/);

    for (let statement of statements) {
        statement = statement.trim();
        if (!statement || statement.startsWith('--')) continue;

        try {
            console.log(`Executing statement starting with: ${statement.substring(0, 50)}...`);
            await connection.execute(statement);
        } catch (err) {
            console.error(`Error executing statement: ${err.message}`);
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

        // SQL files are in the root (parent of backend)
        const rootDir = path.join(__dirname, '..');

        console.log('Running db_resend_setup.sql...');
        await runSqlFile(connection, path.join(rootDir, 'db_resend_setup.sql'));

        console.log('Running db_kyc_setup.sql...');
        await runSqlFile(connection, path.join(rootDir, 'db_kyc_setup.sql'));

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
