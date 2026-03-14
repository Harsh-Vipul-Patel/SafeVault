const oracledb = require('oracledb');
require('dotenv').config({ path: './.env' });

async function testTransfer() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('Connected to Oracle DB.');

        // Get two accounts to test with
        const result = await connection.execute(
            `SELECT account_id FROM ACCOUNTS WHERE status = 'ACTIVE' FETCH FIRST 2 ROWS ONLY`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length < 2) {
            console.error('Not enough accounts to test transfer.');
            return;
        }

        const fromAcc = result.rows[0].ACCOUNT_ID;
        const toAcc = result.rows[1].ACCOUNT_ID;

        console.log(`Testing transfer from ${fromAcc} to ${toAcc}...`);

        await connection.execute(
            `BEGIN sp_internal_transfer(:sender, :receiver, :amount, :initiated_by); END;`,
            {
                sender: fromAcc,
                receiver: toAcc,
                amount: 10,
                initiated_by: 'INTERNAL_TEST'
            },
            { autoCommit: true }
        );

        console.log('Transfer call successful!');

    } catch (err) {
        console.error('Transfer test failed:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
}

testTransfer();
