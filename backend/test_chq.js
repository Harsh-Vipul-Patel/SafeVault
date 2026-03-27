const oracledb = require('oracledb');
require('dotenv').config({path: './.env'});

(async () => {
    let conn;
    try {
        conn = await oracledb.getConnection({user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECTION_STRING});
        const res = await conn.execute(`
            SELECT book_id FROM CHEQUE_BOOKS 
            WHERE account_id = 'ACC-MUM-003-1029' 
            AND '100255' BETWEEN start_cheque_number AND end_cheque_number
            AND status = 'ACTIVE'
        `);
        console.log("Found book via padded string:", res.rows);
        
        const res2 = await conn.execute(`
            SELECT book_id FROM CHEQUE_BOOKS 
            WHERE account_id = 'ACC-MUM-003-1029' 
            AND 100255 BETWEEN TO_NUMBER(start_cheque_number) AND TO_NUMBER(end_cheque_number)
            AND status = 'ACTIVE'
        `);
        console.log("Found book via number conversion:", res2.rows);

        const res3 = await conn.execute(`
            SELECT book_id FROM CHEQUE_BOOKS 
            WHERE account_id = 'ACC-MUM-003-1029' 
            AND LPAD('255', 6, '0') BETWEEN start_cheque_number AND end_cheque_number
            AND status = 'ACTIVE'
        `);
        console.log("Found book via LPAD string:", res3.rows);

    } catch(e) { console.error(e); } finally { if(conn) await conn.close(); }
})();
