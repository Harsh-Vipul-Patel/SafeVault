const oracledb = require('oracledb');
require('dotenv').config({ path: './backend/.env' });

async function check() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('Checking errors for SP_VERIFY_KYC...');
        const res = await conn.execute(
            "SELECT line, position, text FROM user_errors WHERE name = 'SP_VERIFY_KYC' AND type = 'PROCEDURE' ORDER BY sequence",
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (res.rows.length === 0) {
            console.log('No specific errors found in user_errors. Attempting re-compilation...');
            try {
                await conn.execute('ALTER PROCEDURE SP_VERIFY_KYC COMPILE');
                console.log('Re-compilation command sent.');
            } catch (compileErr) {
                console.log('Re-compilation failed: ' + compileErr.message);
            }
        } else {
            res.rows.forEach(r => {
                console.log(`ERROR: Line ${r.LINE}, Pos ${r.POSITION}: ${r.TEXT}`);
            });
        }
    } catch (err) {
        console.error('ORACLE ERROR:', err.message);
    } finally {
        if (conn) await conn.close();
    }
}

check();
