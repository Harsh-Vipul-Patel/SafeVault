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
            `SELECT book_id, account_id, start_cheque_number, end_cheque_number, status 
             FROM CHEQUE_BOOKS ORDER BY book_id DESC FETCH FIRST 10 ROWS ONLY`
        );
        console.log("Cheque Books:");
        res.rows.forEach(r => console.log(r));

        const res2 = await conn.execute(
            `SELECT cheque_number, status, amount FROM CHEQUES ORDER BY cheque_id DESC FETCH FIRST 10 ROWS ONLY`
        );
        console.log("Cheques:");
        res2.rows.forEach(r => console.log(r));
    } catch (e) { console.error(e); } 
    finally { if (conn) await conn.close(); }
})();
