const oracledb = require('oracledb');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const BASE_URL = 'http://localhost:5000/api';

async function logResult(testName, success, message) {
    console.log(`${success ? '✅' : '❌'} [${testName}] ${message}`);
}

async function runReliabilityTests() {
    console.log('--- RELIABILITY & ERROR HANDLING TESTS ---');

    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        // 1. Oracle Error Mapping (ORA-20001 Insufficient Funds)
        console.log('\n[TEST 1] Error Mapping - Business Logic Exceptions');
        const login = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'ravi.verma', password: 'password' })
        });
        const { token } = await login.json();

        // Attempt a transfer with amount larger than balance
        const overDraw = await fetch(`${BASE_URL}/customer/transfer/internal`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ fromAccountId: 'ACC-MUM-003-8821', toAccountId: 'ACC-MUM-003-0421', amount: 99999999, otpCode: '123456' })
        });
        const overDrawRes = await overDraw.json();
        logResult('ERROR_MAPPING_BAL', overDraw.status === 500 && overDrawRes.message.toLowerCase().includes('insufficient'), 'Mapping ORA-20001 to user friendly message');


        // 2. Notification Persistence (Even if email fails)
        console.log('\n[TEST 2] Reliability - Notification Log Persistence');
        console.log('Current Resend API key is likely invalid or missing. Testing if DB log is still created on deposit.');

        // We need a teller token for deposit
        const tLogin = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'priya.desai', password: 'password' })
        });
        const tToken = (await tLogin.json()).token;

        const deposit = await fetch(`${BASE_URL}/teller/deposit`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tToken}` },
            body: JSON.stringify({ accountId: 'ACC-MUM-003-8821', amount: 100 })
        });

        if (deposit.ok) {
            console.log('Deposit successful. Checking NOTIFICATION_LOG...');
            const notifRow = await conn.execute(
                `SELECT * FROM NOTIFICATION_LOG WHERE customer_id = 'CUST-001' ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
                [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            if (notifRow.rows.length > 0) {
                logResult('RELIABILITY_NOTIF_LOG', true, 'Notification record persisted in DB despite potential email service failure.');
            } else {
                logResult('RELIABILITY_NOTIF_LOG', false, 'Notification record NOT found in DB.');
            }
        } else {
            console.error('Deposit request failed entirely:', await deposit.text());
        }


        // 3. Database Resilience (Invalid SQL behavior)
        console.log('\n[TEST 3] Error Handling - Invalid Request Payload');
        const badPayload = await fetch(`${BASE_URL}/teller/deposit`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tToken}` },
            body: JSON.stringify({ accountId: 'ACC-INVALID', amount: 'not_a_number' })
        });
        logResult('ERROR_HANDLING_INVALID', badPayload.status >= 400, `Handled invalid payload with status ${badPayload.status}`);

    } catch (err) {
        console.error('Reliability Test Error:', err.message);
    } finally {
        if (conn) await conn.close();
    }
}

runReliabilityTests();
