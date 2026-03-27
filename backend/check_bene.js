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
        const res = await conn.execute(`SELECT beneficiary_id, customer_id, beneficiary_name, activation_status, TO_CHAR(activation_date, 'YYYY-MM-DD HH24:MI:SS') AS act_date FROM SAVED_BENEFICIARIES`);
        console.log('Beneficiaries:', res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
})();
