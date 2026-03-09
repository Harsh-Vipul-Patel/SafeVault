const oracledb = require('oracledb');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

async function runTests() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('--- ACID PROPERTY TESTS ---');

        // 1. ATOMICITY TEST
        console.log('\n[TEST 1] Atomicity - Verifying Rollback on Failure');
        const sender = 'ACC-MUM-003-8821';
        const receiver = 'ACC-MUM-003-0421';
        const amount = 1000;

        // Get initial balances
        const initialRes = await conn.execute(
            `SELECT account_id, balance FROM ACCOUNTS WHERE account_id IN (:s, :r)`,
            { s: sender, r: receiver },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const initialSenderBal = initialRes.rows.find(r => r.ACCOUNT_ID === sender).BALANCE;
        console.log(`Initial Sender Balance: ${initialSenderBal}`);

        console.log('Inducing failure by using a non-existent receiver account in a custom failing proc...');
        // We'll create a temporary proc that debits then fails
        await conn.execute(`
            CREATE OR REPLACE PROCEDURE sp_test_atomicity_fail (p_sender IN VARCHAR2, p_amt IN NUMBER) AS
            BEGIN
                UPDATE ACCOUNTS SET balance = balance - p_amt WHERE account_id = p_sender;
                -- Now force a failure
                RAISE_APPLICATION_ERROR(-20000, 'Simulated Failure post-debit');
            EXCEPTION
                WHEN OTHERS THEN
                    ROLLBACK;
                    RAISE;
            END;
        `);

        try {
            await conn.execute(`BEGIN sp_test_atomicity_fail(:s, :a); END;`, { s: sender, a: amount });
        } catch (err) {
            console.log(`Expected Error caught: ${err.message}`);
        }

        // Check if balance was rolled back
        const afterRes = await conn.execute(
            `SELECT balance FROM ACCOUNTS WHERE account_id = :s`,
            { s: sender },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const afterSenderBal = afterRes.rows[0].BALANCE;
        if (afterSenderBal === initialSenderBal) {
            console.log('✅ PASS: Atomicity verified. Balance rolled back correctly.');
        } else {
            console.error(`❌ FAIL: Atomicity failed! Balance was ${afterSenderBal}, expected ${initialSenderBal}`);
        }

        // Cleanup
        await conn.execute(`DROP PROCEDURE sp_test_atomicity_fail`);


        // 2. CONSISTENCY TEST
        console.log('\n[TEST 2] Consistency - Total Balance Invariant');
        const sumResult = await conn.execute(`SELECT SUM(balance) as total FROM ACCOUNTS`);
        const totalBefore = sumResult.rows[0][0];
        console.log(`Total balance before transfer: ${totalBefore}`);

        console.log(`Performing transfer of ${amount}...`);
        await conn.execute(`BEGIN sp_internal_transfer(:s, :r, :a, 'TEST_ACID'); END;`, {
            s: sender, r: receiver, a: amount
        });

        const totalAfter = (await conn.execute(`SELECT SUM(balance) as total FROM ACCOUNTS`)).rows[0][0];
        console.log(`Total balance after transfer: ${totalAfter}`);

        if (totalBefore === totalAfter) {
            console.log('✅ PASS: Consistency verified. Total balance is invariant.');
        } else {
            console.error('❌ FAIL: Consistency failed! Total balance changed.');
        }


        // 3. ISOLATION TEST (Simplified)
        console.log('\n[TEST 3] Isolation - Row Level Locking');
        console.log('Starting two parallel withdrawals on the same account...');
        const balanceBefore = (await conn.execute(`SELECT balance FROM ACCOUNTS WHERE account_id = :s`, { s: sender })).rows[0][0];

        // We'll use two different connections to truly test isolation
        const conn2 = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        const p1 = conn.execute(`BEGIN sp_withdraw(:s, 100, 'TEST_ISO_1'); END;`, { s: sender });
        const p2 = conn2.execute(`BEGIN sp_withdraw(:s, 100, 'TEST_ISO_2'); END;`, { s: sender });

        await Promise.all([p1, p2]);

        const balanceAfter = (await conn.execute(`SELECT balance FROM ACCOUNTS WHERE account_id = :s`, { s: sender })).rows[0][0];
        console.log(`Balance Before: ${balanceBefore}, After: ${balanceAfter}`);
        if (balanceBefore - balanceAfter === 200) {
            console.log('✅ PASS: Isolation verified. Parallel withdrawals handled correctly.');
        } else {
            console.error('❌ FAIL: Isolation failed! Race condition detected.');
        }

        await conn2.close();

    } catch (err) {
        console.error('ACID Test Error:', err);
    } finally {
        if (conn) await conn.close();
    }
}

runTests();
