const oracledb = require('oracledb');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

async function runConcurrencyTests() {
    let conn;
    try {
        console.log('--- CONCURRENCY & STRESS TESTS ---');

        const sender = 'ACC-MUM-003-8821';
        const receiver = 'ACC-MUM-003-0421';
        const amountPerTxn = 10;
        const numRequests = 20;

        // 1. Parallel Deposits/Withdrawals
        console.log(`\n[TEST 1] Parallel Operations - Overlapping Requests`);
        console.log(`Firing ${numRequests} parallel withdrawals of Rs.${amountPerTxn} each...`);

        const getBal = async (acc) => {
            const c = await oracledb.getConnection({
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                connectString: process.env.DB_CONNECTION_STRING
            });
            const res = await c.execute(`SELECT balance FROM ACCOUNTS WHERE account_id = :a`, { a: acc });
            const b = res.rows[0][0];
            await c.close();
            return b;
        };

        const initialBal = await getBal(sender);
        console.log(`Initial Balance: ${initialBal}`);

        const results = [];
        for (let i = 0; i < numRequests; i++) {
            results.push((async (idx) => {
                let c;
                try {
                    c = await oracledb.getConnection({
                        user: process.env.DB_USER,
                        password: process.env.DB_PASSWORD,
                        connectString: process.env.DB_CONNECTION_STRING
                    });
                    await c.execute(`BEGIN sp_withdraw(:s, :a, :t); END;`, {
                        s: sender, a: amountPerTxn, t: `STRESS_${idx}`
                    });
                    return { ok: true };
                } catch (e) {
                    return { ok: false, error: e.message };
                } finally {
                    if (c) await c.close();
                }
            })(i));
        }

        const reports = await Promise.all(results);
        const successCount = reports.filter(r => r.ok).length;
        const failCount = reports.filter(r => !r.ok).length;

        const finalBal = await getBal(sender);
        console.log(`Summary: Success: ${successCount}, Failed: ${failCount}`);
        console.log(`Initial Balance: ${initialBal}, Final Balance: ${finalBal}, Diff: ${initialBal - finalBal}`);

        if (initialBal - finalBal === successCount * amountPerTxn) {
            console.log('✅ PASS: Concurrency verified. All successful transactions correctly accounted for.');
        } else {
            console.error('❌ FAIL: Concurrency failure! Balance discrepancy detected.');
        }


        // 2. Negative Balance Prevention under Load
        console.log(`\n[TEST 2] Negative Balance Prevention Stress Test`);
        console.log('Attempting to withdraw more than the entire balance multiple times simultaneously...');

        // We'll try to withdraw almost everything first to leave a small amount
        const currentBal = await getBal(sender);
        const leftover = 50;
        const heavyWithdraw = currentBal - leftover - 25000; // Leave min balance of 25k + 50

        if (heavyWithdraw > 0) {
            let c = await oracledb.getConnection({
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                connectString: process.env.DB_CONNECTION_STRING
            });
            await c.execute(`BEGIN sp_withdraw(:s, :a, 'SETUP'); END;`, { s: sender, a: heavyWithdraw });
            await c.close();
        }

        const balBeforeNegTest = await getBal(sender);
        console.log(`Balance before negative test: ${balBeforeNegTest}`);

        const negResults = [];
        for (let i = 0; i < 10; i++) {
            negResults.push((async () => {
                let c;
                try {
                    c = await oracledb.getConnection({
                        user: process.env.DB_USER,
                        password: process.env.DB_PASSWORD,
                        connectString: process.env.DB_CONNECTION_STRING
                    });
                    // Try to withdraw 100 which is more than the 'leftover' 50 above min balance
                    await c.execute(`BEGIN sp_withdraw(:s, 100, 'NEG_TEST'); END;`, { s: sender });
                    return { ok: true };
                } catch (e) {
                    return { ok: false, error: e.message };
                } finally {
                    if (c) await c.close();
                }
            })());
        }

        const negReports = await Promise.all(negResults);
        const negSuccess = negReports.filter(r => r.ok).length;
        console.log(`Success count for over-draft (should be 0): ${negSuccess}`);

        const finalBalNeg = await getBal(sender);
        console.log(`Final Balance: ${finalBalNeg}`);

        if (negSuccess === 0) {
            console.log('✅ PASS: Negative balance prevented under load.');
        } else {
            console.error(`❌ FAIL: System allowed ${negSuccess} overdraft transactions!`);
        }

    } catch (err) {
        console.error('Stress Test Error:', err);
    }
}

runConcurrencyTests();
