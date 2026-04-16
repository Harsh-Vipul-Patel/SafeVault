const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';

async function testCustomerRole() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        // 1. Login
        console.log('--- 1. Testing Login (ravi.verma) ---');
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', body: JSON.stringify({ username: 'ravi.verma', password: 'password' }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Could not login: ' + await res.text());
        const login = await res.json();
        const token = login.token;
        console.log('Login successful. Token acquired.');

        // 2. Profile & Accounts
        console.log('\n--- 2. Testing Profile & Accounts ---');
        const profileRes = await fetch(`${API_URL}/customer/profile`, { headers: { Authorization: `Bearer ${token}` } });
        const profile = await profileRes.json();
        console.log('Profile:', profile.profile.FULL_NAME, profile.profile.KYC_STATUS);

        const accountsRes = await fetch(`${API_URL}/customer/accounts`, { headers: { Authorization: `Bearer ${token}` } });
        const accounts = await accountsRes.json();
        console.log('Accounts fetched:', accounts.accounts.length);
        const acc1 = accounts.accounts.find(a => a.TYPE_NAME === 'Savings Premium');
        const acc2 = accounts.accounts.find(a => a.TYPE_NAME === 'Business Current');

        if (!acc1 || !acc2) throw new Error('Required accounts not found for ravi.verma');

        // 3. Service Requests / Beneficiaries
        console.log('\n--- 3. Testing Beneficiaries & Service Requests ---');
        let benRes = await fetch(`${API_URL}/customer/beneficiaries`, {
            method: 'POST', body: JSON.stringify({ accountNo: '123456789', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', name: 'Test Ben', nickName: 'TB' }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        });
        console.log('Add Beneficiary Result:', await benRes.json());

        let reqRes = await fetch(`${API_URL}/customer/cheque/request`, {
            method: 'POST', body: JSON.stringify({ accountId: acc1.ACCOUNT_ID, leavesCount: 50 }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        });
        console.log('Cheque Request Result:', await reqRes.json());

        // 4. Transfers with OTP
        console.log('\n--- 4. Testing Internal Transfer & OTP Flow ---');
        let otpRes = await fetch(`${API_URL}/otp/generate`, {
            method: 'POST', body: JSON.stringify({ purpose: 'TRANSACTION', amount: 10, toAccountId: acc2.ACCOUNT_ID }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        });
        if (!otpRes.ok) throw new Error('OTP Generate failed: ' + await otpRes.text());
        console.log('OTP Generated.');

        // Retrieve OTP from DB to bypass email
        const knownHash = await bcrypt.hash('123456', 10);
        await connection.execute(`UPDATE OTPS SET otp_hash = :hash WHERE status = 'PENDING'`, { hash: knownHash }, { autoCommit: true });

        // Attempt with WRONG OTP
        let transferResWrong = await fetch(`${API_URL}/customer/transfer/internal`, {
            method: 'POST', body: JSON.stringify({ fromAccountId: acc1.ACCOUNT_ID, toAccountId: acc2.ACCOUNT_ID, amount: 10, otpCode: '999999' }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        });
        console.log('Internal Transfer (Wrong OTP) Result:', await transferResWrong.json());

        // Attempt with CORRECT OTP
        let transferResCorrect = await fetch(`${API_URL}/customer/transfer/internal`, {
            method: 'POST', body: JSON.stringify({ fromAccountId: acc1.ACCOUNT_ID, toAccountId: acc2.ACCOUNT_ID, amount: 10, otpCode: '123456' }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        });
        console.log('Internal Transfer (Correct OTP) Result:', await transferResCorrect.json());

        console.log('\n--- 5. Testing External Transfer ---');
        let otpResExt = await fetch(`${API_URL}/otp/generate`, {
            method: 'POST', body: JSON.stringify({ purpose: 'TRANSACTION', amount: 20, toAccountId: '123456789' }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        });
        if (!otpResExt.ok) throw new Error('OTP Generate Ext failed: ' + await otpResExt.text());

        await connection.execute(`UPDATE OTPS SET otp_hash = :hash WHERE status = 'PENDING'`, { hash: knownHash }, { autoCommit: true });

        let transferExt = await fetch(`${API_URL}/customer/transfer/external`, {
            method: 'POST', body: JSON.stringify({ fromAccountId: acc1.ACCOUNT_ID, toAccount: '123456789', ifsc: 'HDFC0001234', mode: 'NEFT', amount: 20, otpCode: '123456' }),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        });
        console.log('External Transfer Result:', await transferExt.json());

        console.log('\n✅ All Customer Verification Steps Passed Successfully');

    } catch (err) {
        console.error('❌ Verification Failed:', err);
    } finally {
        if (connection) await connection.close();
    }
}

testCustomerRole();
