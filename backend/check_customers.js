const oracledb = require('oracledb');

async function checkSchema() {
    let conn;
    try {
        require('dotenv').config({ path: './.env' });
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        const res = await conn.execute(`
            SELECT table_name, column_name 
            FROM user_tab_columns 
            WHERE table_name IN ('CUSTOMERS', 'EMPLOYEES')
            ORDER BY table_name, column_id
        `);
        console.log("Columns in CUSTOMERS and EMPLOYEES tables:");
        let currentTable = '';
        res.rows.forEach(r => {
            if (r[0] !== currentTable) {
                console.log(`\nTable ${r[0]}:`);
                currentTable = r[0];
            }
            console.log(`  - ${r[1]}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) await conn.close();
    }
}
checkSchema();
