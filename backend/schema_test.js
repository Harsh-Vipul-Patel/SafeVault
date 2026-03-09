const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    let c;
    try {
        c = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        const r = await c.execute("SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'TRANSACTIONS'");
        console.table(r.rows);
    } catch (e) {
        console.error(e);
    } finally {
        if (c) c.close();
    }
}
run();
