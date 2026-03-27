const oracledb = require('oracledb');
require('dotenv').config({ path: '../.env' }); // or wherever .env is

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
            SELECT column_name 
            FROM user_tab_columns 
            WHERE table_name = 'EMPLOYEES'
        `);
        console.log("Columns in EMPLOYEES table:");
        res.rows.forEach(r => console.log(r[0]));
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) await conn.close();
    }
}
checkSchema();
