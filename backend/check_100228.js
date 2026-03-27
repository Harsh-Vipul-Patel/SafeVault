const oracledb = require('oracledb');
require('dotenv').config({path: './.env'});

(async () => {
    let conn;
    try {
        conn = await oracledb.getConnection({user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECTION_STRING});
        const res = await conn.execute(
            `SELECT book_id, account_id, start_cheque_number, end_cheque_number 
             FROM CHEQUE_BOOKS c 
             WHERE 100228 BETWEEN TO_NUMBER(start_cheque_number) AND TO_NUMBER(end_cheque_number)
             AND status = 'ACTIVE'
            `, [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log("Books that contain 100228:");
        console.log(res.rows);
    } catch(e){ console.error(e); } finally { if(conn) await conn.close();}
})();
