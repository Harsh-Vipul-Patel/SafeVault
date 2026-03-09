const oracledb = require('oracledb');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';

async function verifyFix() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('--- 1. Verification: Internal Transfer with Account Number ---');

        // Get a customer and another account number
        const customers = await connection.execute("SELECT c.customer_id, u.username FROM CUSTOMERS c JOIN USERS u ON c.user_id = u.user_id WHERE u.user_type = 'CUSTOMER' FETCH FIRST 1 ROWS ONLY", [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const customer = customers.rows[0];

        const accounts = await connection.execute("SELECT account_id, account_number FROM ACCOUNTS FETCH FIRST 2 ROWS ONLY", [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const fromId = accounts.rows[0].ACCOUNT_ID;
        const toAccNo = accounts.rows[1].ACCOUNT_NUMBER; // USE ACCOUNT NUMBER

        console.log(`Testing from ${fromId} to ${toAccNo} (Account Number)`);

        // Login (assuming standard password or RaviVerma)
        let loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', body: JSON.stringify({ username: customer.USERNAME, password: 'password123' }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!loginRes.ok) {
            // try other common password
            loginRes = await fetch(`${API_URL}/auth/login`, {
                method: 'POST', body: JSON.stringify({ username: customer.USERNAME, password: 'Password123!' }),
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!loginRes.ok) throw new Error('Login failed: ' + await loginRes.text());
        const { token } = await loginRes.json();

        // Generate/Fix OTP for test
        const otpHash = await require('bcryptjs').hash('123456', 10);
        // Delete any pending to be sure
        await connection.execute(`DELETE FROM OTPS WHERE user_id = (SELECT user_id FROM CUSTOMERS WHERE customer_id = :id)`, [customer.CUSTOMER_ID], { autoCommit: true });
        await connection.execute(`INSERT INTO OTPS (user_id, otp_hash, purpose, expires_at) VALUES ((SELECT user_id FROM CUSTOMERS WHERE customer_id = :id), :hash, 'TRANSACTION', SYSDATE + 1/24)`, { id: customer.CUSTOMER_ID, hash: otpHash }, { autoCommit: true });

        // Perform Transfer
        const transferRes = await fetch(`${API_URL}/customer/transfer/internal`, {
            method: 'POST', body: JSON.stringify({ fromAccountId: fromId, toAccountId: toAccNo, amount: 10, otpCode: '123456' }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        });

        const status = transferRes.status;
        const data = await transferRes.json();
        console.log(`Transfer Response [${status}]:`, data);

        if (status === 200) {
            console.log('✅ Success: API returned 200 despite potential post-processing hurdles.');
        } else {
            console.log('❌ Failure: API returned error:', data.message);
        }

        console.log('--- 2. Checking if files were generated ---');
        const fs = require('fs');
        const path = require('path');
        const files = fs.readdirSync(process.cwd());
        const receipts = files.filter(f => f.startsWith('Receipt-TXN-') || f.startsWith('Credit-Note-TXN-'));
        console.log('Generated receipts in root:', receipts);

    } catch (err) {
        console.error('Verification Script Failure:', err);
    } finally {
        if (connection) await connection.close();
    }
}

verifyFix();
