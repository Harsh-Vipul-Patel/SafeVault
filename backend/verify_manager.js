const oracledb = require('oracledb');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';

async function testManagerRole() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        // 1. Login
        console.log('--- 1. Testing Login (rk.sharma) ---');
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', body: JSON.stringify({ username: 'rk.sharma', password: 'password' }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Could not login: ' + await res.text());
        const login = await res.json();
        const token = login.token;
        console.log('Login successful. Token acquired.');

        // 2. Dashboard
        console.log('\n--- 2. Testing Manager Dashboard ---');
        const dashRes = await fetch(`${API_URL}/manager/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
        if (!dashRes.ok) throw new Error('Dashboard failed: ' + await dashRes.text());
        const dash = await dashRes.json();
        console.log('Manager KPIs:', dash.kpis);
        console.log('Recent Txns:', dash.liveFeed.transactions.length);

        // 3. Approvals
        console.log('\n--- 3. Testing Approvals ---');
        const appRes = await fetch(`${API_URL}/manager/approvals`, { headers: { Authorization: `Bearer ${token}` } });
        const approvals = await appRes.json();
        console.log('Pending Approvals returned:', approvals.queue.length);
        if (approvals.queue.length > 0) {
            const queueId = approvals.queue[0].queueId;
            const appAction = await fetch(`${API_URL}/manager/approvals/${queueId}/approve`, {
                method: 'POST', body: JSON.stringify({ note: 'Approved by test script' }),
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            });
            console.log('Approval action result:', await appAction.json());
        } else {
            console.log('No pending dual approvals to act on.');
        }

        // 4. Accounts & Management (Freeze/Unfreeze)
        console.log('\n--- 4. Testing Account Management ---');
        const accRes = await fetch(`${API_URL}/manager/accounts`, { headers: { Authorization: `Bearer ${token}` } });
        const accJson = await accRes.json();
        // find Amit Kumar's account
        const testAcc = accJson.accounts.find(a => a.CUSTOMER_NAME === 'Amit Kumar') || accJson.accounts[0];
        if (testAcc) {
            console.log('Testing freeze on account:', testAcc.ACCOUNT_NUMBER);
            const freezeRes = await fetch(`${API_URL}/manager/accounts/${testAcc.ACCOUNT_ID}/status`, {
                method: 'POST', body: JSON.stringify({ newStatus: 'FROZEN', reason: 'Test script freeze' }),
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            });
            console.log('Freeze result:', await freezeRes.json());

            console.log('Testing unfreeze on account:', testAcc.ACCOUNT_NUMBER);
            const unfreezeRes = await fetch(`${API_URL}/manager/accounts/${testAcc.ACCOUNT_ID}/status`, {
                method: 'POST', body: JSON.stringify({ newStatus: 'ACTIVE', reason: 'Test script unfreeze' }),
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            });
            console.log('Unfreeze result:', await unfreezeRes.json());
        }

        // 5. Settlement (External transfer)
        console.log('\n--- 5. Testing Settlement ---');
        const setRes = await fetch(`${API_URL}/manager/settlement`, { headers: { Authorization: `Bearer ${token}` } });
        const settlements = await setRes.json();
        console.log('Pending settlements returned:', settlements.transfers?.length || 0);
        if (settlements.transfers && settlements.transfers.length > 0) {
            const transId = settlements.transfers[0].TRANSFER_ID;
            const settleAction = await fetch(`${API_URL}/manager/settlement/${transId}/settle`, {
                method: 'POST', body: JSON.stringify({ reason: 'Settled by test script' }),
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            });
            console.log('Settlement action result:', await settleAction.json());
        } else {
            console.log('No pending external transfers to settle.');
        }

        // 6. Reports (Branch MIS)
        console.log('\n--- 6. Testing Branch MIS Reports ---');
        const reportRes = await fetch(`${API_URL}/manager/reports`, { headers: { Authorization: `Bearer ${token}` } });
        const reports = await reportRes.json();
        console.log('Reports summary available:', Object.keys(reports));

        const misRes = await fetch(`${API_URL}/manager/mis/summary`, { headers: { Authorization: `Bearer ${token}` } });
        const mis = await misRes.json();
        console.log('MIS Summary:', mis);

        console.log('\n✅ All Branch Manager Verification Steps Passed Successfully');

    } catch (err) {
        console.error('❌ Verification Failed:', err);
    } finally {
        if (connection) await connection.close();
    }
}

testManagerRole();
