const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';

async function verify() {
    console.log('--- STARTING VERIFICATION ---');

    try {
        // 1. Single Session Verification
        console.log('\\n[TEST 1] Single Session Enforcement');
        // Login session 1
        const res1 = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', body: JSON.stringify({ username: 'RaviVerma', password: 'password' }),
            headers: { 'Content-Type': 'application/json' }
        });
        const login1 = await res1.json();
        const token1 = login1.token;
        console.log('Login 1 Success. Token grabbed.');

        // Login session 2
        const res2 = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', body: JSON.stringify({ username: 'RaviVerma', password: 'password' }),
            headers: { 'Content-Type': 'application/json' }
        });
        const login2 = await res2.json();
        const token2 = login2.token;
        console.log('Login 2 Success. Token grabbed.');

        // Try to use token1 for a protected route
        const chk1 = await fetch(`${API_URL}/customer/accounts`, { headers: { Authorization: `Bearer ${token1}` } });
        if (chk1.status === 401) {
            console.log('✅ PASS: Token 1 was successfully rejected with 401');
        } else {
            const body = await chk1.json();
            console.error(`❌ FAIL: Token 1 returned ${chk1.status}`, body);
        }

        // Try to use token2 for a protected route
        const chk2 = await fetch(`${API_URL}/customer/accounts`, { headers: { Authorization: `Bearer ${token2}` } });
        if (chk2.ok) {
            console.log('✅ PASS: Token 2 is valid and accessible.');
        } else {
            const body = await chk2.json();
            console.error(`❌ FAIL: Token 2 returned ${chk2.status}`, body);
        }

        // 2. OTP Security Checks: Attempt Limits
        console.log('\\n[TEST 2] OTP Hashing and Attempt Limits');

        console.log('Generating OTP for Transfer...');
        const otpRes = await fetch(`${API_URL}/otp/generate`, {
            method: 'POST', body: JSON.stringify({ purpose: 'TRANSACTION', amount: 100, toAccountId: 'ACC-002' }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` }
        });
        const otpAns = await otpRes.json();
        console.log('OTP Generate Response:', otpRes.status, otpAns);

        let connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        const otpRow = await connection.execute('SELECT otp_id, otp_hash FROM OTPS ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY');
        if (otpRow.rows.length > 0) {
            console.log(`DB OTP Hash: ${otpRow.rows[0][1]} (Is Hashed: ${otpRow.rows[0][1].includes('$2')})`);
        } else {
            console.log('No OTP found in DB.');
        }

        console.log('Testing 3 invalid OTP attempts...');
        for (let i = 1; i <= 4; i++) {
            const attempt = await fetch(`${API_URL}/customer/transfer/internal`, {
                method: 'POST', body: JSON.stringify({ fromAccountId: 'ACC-001', toAccountId: 'ACC-002', amount: 10, otpCode: '000000' }),
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` }
            });
            const ans = await attempt.json();
            console.log(`Attempt ${i} Result: ${attempt.status} - ${ans.message}`);
        }
        await connection.close();

    } catch (err) {
        console.error('Test script failure:', err.message);
    }
}

verify();
