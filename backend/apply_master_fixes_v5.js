const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './.env' });

async function runSqlFile(connection, filePath) {
    console.log(`\n>>> STARTING: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'utf8');

    // Split ONLY by / on its own line
    // Standard Oracle scripts use / to execute the preceding block
    const statements = content.split(/^[\t ]*\/[\t ]*$/m).map(s => s.trim()).filter(s => s !== '');

    for (let cmd of statements) {
        try {
            let execSql = cmd;

            // Determine if it's a PL/SQL or Object creation that needs its semicolon preserved.
            // Oracle execute() for CREATE TABLE/VIEW/SEQUENCE wants the semicolon REMOVED.
            // Oracle execute() for PL/SQL (BEGIN/DECLARE/CREATE OR REPLACE TRIGGER/PROCEDURE) wants them PRESERVED.

            const isPlSql = execSql.toUpperCase().match(/\b(BEGIN|DECLARE|TRIGGER|PROCEDURE|FUNCTION|PACKAGE|TYPE)\b/);

            if (!isPlSql) {
                // Strip trailing semicolon from standard SQL
                if (execSql.endsWith(';')) {
                    execSql = execSql.substring(0, execSql.length - 1);
                }
            }
            // If it IS PL/SQL, we MUST keep the semicolon.

            console.log(`Executing (${execSql.substring(0, 40).replace(/\n/g, ' ')}...)`);
            await connection.execute(execSql);
        } catch (err) {
            console.error(`ERROR: ${err.message}`);
            // console.error(`FULL SQL: ${cmd}`);
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
        console.log('\nSUCCESS: Master fixes applied.');
    } catch (err) {
        console.error('CRITICAL:', err.message);
    } finally {
        if (connection) await connection.close();
    }
}

main();
