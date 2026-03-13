const oracledb = require('oracledb');
require('dotenv').config({ path: './.env' });

async function check() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        const list = ['SP_VERIFY_KYC', 'TRG_AUDIT_KYC_CHANGE', 'SP_EXECUTE_STANDING_INSTRUCTION', 'SP_GENERATE_BRANCH_MIS'];

        for (const name of list) {
            console.log(`\n--- ERRORS FOR ${name} ---`);
            const res = await conn.execute(
                `SELECT name, line, position, text FROM user_errors WHERE name = :name ORDER BY sequence`,
                { name }
            );
            res.rows.forEach(r => console.log(`LINE ${r[1]}:${r[2]} - ${r[3]}`));
        }

    } catch (err) {
        console.error(err.message);
    } finally {
        if (conn) await conn.close();
    }
}

check();
