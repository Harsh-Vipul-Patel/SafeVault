const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './.env' });

async function runSqlFile(connection, filePath) {
    console.log(`\n>>> STARTING: ${path.basename(filePath)}`);
    const content = fs.readFileSync(filePath, 'utf8');

    // Split ONLY by / on its own line (standard Oracle script behavior)
    // We look for a slash that is either at the very beginning of the string 
    // or preceded by a newline, and followed by a newline or end of string.
    const statements = content.split(/^[\t ]*\/[\t ]*$/m);

    for (let statement of statements) {
        let cmd = statement.trim();
        if (!cmd) continue;
        if (cmd.startsWith('--') && cmd.split('\n').length === 1) continue;

        try {
            // For non-PL/SQL statements (like CREATE TABLE), Oracle execute() 
            // usually wants the semicolon removed. 
            // BUT if it's a script with multiple statements, they usually have semicolons.
            // Let's handle semicolons inside the block if it's NOT a block.

            // If it's NOT a PL/SQL block and NOT a CREATE/ALTER/DROP, it might be a sequence of standard SQL.
            // Actually, the safest way in node-oracledb for a script is to execute one statement at a time.

            // If a block of text contains multiple standard SQL statements (ending in ;), split them.
            if (!cmd.toUpperCase().match(/^(BEGIN|DECLARE|CREATE OR REPLACE (PROCEDURE|FUNCTION|TRIGGER|PACKAGE|TYPE))/)) {
                const subStmts = cmd.split(';');
                for (let sub of subStmts) {
                    let s = sub.trim();
                    if (!s || s.startsWith('--')) continue;
                    console.log(`Executing SQL (${s.substring(0, 40).replace(/\n/g, ' ')}...)`);
                    await connection.execute(s);
                }
            } else {
                // It's a PL/SQL block or Object creation. Execute as is.
                console.log(`Executing Block (${cmd.substring(0, 40).replace(/\n/g, ' ')}...)`);
                await connection.execute(cmd);
            }
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
