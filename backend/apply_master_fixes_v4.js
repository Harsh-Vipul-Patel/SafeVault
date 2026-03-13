const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './.env' });

async function runSqlFile(connection, filePath) {
    console.log(`\n>>> STARTING: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'utf8');

    // Split ONLY by / on its own line
    const statements = content.split(/^[\t ]*\/[\t ]*$/m).map(s => s.trim()).filter(s => s !== '');

    for (let cmd of statements) {
        try {
            // Remove trailing semicolon if it's NOT a PL/SQL block
            // (Standard SQL statements in Oracle scripts often have them, but execute() doesn't want them)
            let execSql = cmd;
            if (!execSql.toUpperCase().match(/^(BEGIN|DECLARE|CREATE OR REPLACE (PROCEDURE|FUNCTION|TRIGGER|PACKAGE|TYPE))/)) {
                if (execSql.endsWith(';')) {
                    execSql = execSql.substring(0, execSql.length - 1);
                }
            }

            console.log(`Executing Statement (${execSql.substring(0, 40).replace(/\n/g, ' ')}...)`);
            await connection.execute(execSql);
        } catch (err) {
            console.error(`ERROR: ${err.message}`);
            console.error(`FULL SQL: ${cmd}`);
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
