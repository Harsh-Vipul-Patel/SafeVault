const oracledb = require('oracledb');
require('dotenv').config({path: './.env'});

(async () => {
    let conn;
    try {
        conn = await oracledb.getConnection({user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECTION_STRING});
        const bookQuery = await conn.execute("SELECT * FROM CHEQUE_BOOKS WHERE status = 'ACTIVE' FETCH FIRST 1 ROWS ONLY", [], {outFormat: oracledb.OUT_FORMAT_OBJECT});
        console.log("Book details:", bookQuery.rows[0]);

        if (bookQuery.rows.length > 0) {
            const row = bookQuery.rows[0];
            const acc = row.ACCOUNT_ID;
            const start = row.START_CHEQUE_NUMBER;
            const midCheque = (parseInt(start) + 2).toString();
            console.log(`Clearing Cheque ${midCheque} from ${acc}`);

            await conn.execute(
                `BEGIN sp_process_cheque_clearing(:chq, :drawee, :payee, :amt, :teller); END;`,
                { chq: midCheque, drawee: acc, payee: 'ACC-MUM-003-8821', amt: 100, teller: 'EMP-MUM-001' },
                { autoCommit: true }
            );
            console.log("Success! Cheque cleared.");
        }
    } catch(e) { console.error(e); } finally { if(conn) await conn.close(); }
})();
