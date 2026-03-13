const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './.env' });

async function runSqlFile(connection, filePath) {
    console.log(`\n>>> STARTING: ${path.basename(filePath)}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    // Improved splitting for standard Oracle scripts
    const statements = sql.split(/\r?\n\/\r?\n/);

    for (let statement of statements) {
        statement = statement.trim();
        if (!statement || statement.startsWith('--')) continue;

        try {
            // Remove trailing semicolon for execute() unless it's a block
            let execSql = statement;
            if (!execSql.toUpperCase().startsWith('BEGIN') &&
                !execSql.toUpperCase().startsWith('DECLARE') &&
                !execSql.toUpperCase().startsWith('CREATE OR REPLACE TRIGGER') &&
                execSql.endsWith(';')) {
                execSql = execSql.substring(0, execSql.length - 1);
            }

            console.log(`Executing: ${execSql.substring(0, 60).replace(/\n/g, ' ')}...`);
            await connection.execute(execSql);
        } catch (err) {
            console.error(`ERROR: ${err.message}`);
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

        const rootDir = path.join(__dirname, '..');
        const files = [
            'db_views.sql',
            'db_resend_setup.sql',
            'db_kyc_setup.sql',
            'db_instructions_setup.sql'
        ];

        for (const file of files) {
            await runSqlFile(connection, path.join(rootDir, file));
        }

        await connection.commit();
        console.log('\nSUCCESS: All scripts executed and committed.');
    } catch (err) {
        console.error('\nCRITICAL DATABASE ERROR:', err.message);
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
