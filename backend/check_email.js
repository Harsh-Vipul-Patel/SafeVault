const oracledb = require('oracledb');
require('dotenv').config({path: './.env'});

(async () => {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        const res = await conn.execute(
            `SELECT customer_id, email FROM CUSTOMERS`
        );
        console.log("Customer Emails:");
        res.rows.forEach(r => console.log(r));
    } catch (e) { console.error(e); } 
    finally { if (conn) await conn.close(); }
})();
