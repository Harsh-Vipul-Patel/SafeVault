const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('Fetching an account...');
        const accRes = await connection.execute(
            `SELECT account_id FROM ACCOUNTS WHERE status = 'ACTIVE' FETCH FIRST 1 ROWS ONLY`
        );
        const accountId = accRes.rows[0][0];

        console.log(`Executing Deposit for account ${accountId}...`);
        await connection.execute(
            `BEGIN sp_deposit(:acc, :amt, :teller); END;`,
            { acc: accountId, amt: 100, teller: 'SYS_TEST' },
            { autoCommit: true }
        );

        console.log('Checking NOTIFICATION_LOG for the new payload...');
        const result = await connection.execute(
            `SELECT message_clob FROM NOTIFICATION_LOG WHERE trigger_event = 'TXN_ALERT' ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`
        );
        
        const clobData = await result.rows[0][0].getData();
        console.log('Payload:', clobData);
        
        const payload = JSON.parse(clobData);
        if (payload.method === 'Cash Deposit at Branch') {
            console.log('✅ Success: method string found in DB payload');
        } else {
            console.log('❌ Error: method not found in DB payload');
        }

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch(e) { console.error(e); }
        }
    }
}

run();
