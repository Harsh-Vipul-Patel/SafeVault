const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './.env' });

async function runSqlFile(connection, filePath) {
    console.log(`\n>>> STARTING: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'utf8');

    // Split by / on its own line (with optional trailing whitespace/newlines)
    let statements = [];
    let currentLine = '';
    const lines = content.split(/\r?\n/);

    let isPlSql = false;
    let currentStmt = [];

    for (let line of lines) {
        let trimmed = line.trim();
        if (trimmed === '/') {
            if (currentStmt.length > 0) {
                statements.push(currentStmt.join('\n'));
                currentStmt = [];
            }
        } else if (trimmed.endsWith(';') && !trimmed.toUpperCase().startsWith('BEGIN') && !trimmed.toUpperCase().startsWith('DECLARE')) {
            currentStmt.push(line);
            statements.push(currentStmt.join('\n'));
            currentStmt = [];
        } else {
            if (trimmed !== '') currentStmt.push(line);
        }
    }
    if (currentStmt.length > 0) statements.push(currentStmt.join('\n'));

    for (let statement of statements) {
        let cmd = statement.trim();
        if (!cmd || cmd.startsWith('--')) continue;

        // Strip trailing semicolon from standard SQL but NOT from PL/SQL blocks
        if (!cmd.toUpperCase().match(/^(BEGIN|DECLARE|CREATE OR REPLACE (PROCEDURE|FUNCTION|TRIGGER|PACKAGE))/)) {
            if (cmd.endsWith(';')) {
                cmd = cmd.substring(0, cmd.length - 1);
            }
        }

        try {
            console.log(`Executing (${cmd.substring(0, 40).replace(/\n/g, ' ')}...)`);
            await connection.execute(cmd);
        } catch (err) {
            console.error(`ERROR in statement: ${err.message}`);
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
