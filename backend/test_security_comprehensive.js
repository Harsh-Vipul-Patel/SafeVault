require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const BASE_URL = 'http://localhost:5000/api';

async function logResult(testName, success, message) {
    console.log(`${success ? '✅' : '❌'} [${testName}] ${message}`);
}

async function runSecurityTests() {
    console.log('--- COMPREHENSIVE SECURITY & RBAC TESTS ---');

    let customerToken, tellerToken;

    try {
        // 1. Initial Login to get tokens
        console.log('\n[PHASE 1] Authentication & Token Generation');

        const custLogin = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'ravi.verma', password: 'password' })
        });
        const custData = await custLogin.json();
        customerToken = custData.token;
        logResult('CUSTOMER_LOGIN', custLogin.ok, 'Login as Customer');

        const tellerLogin = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'priya.desai', password: 'password' })
        });
        const tellerData = await tellerLogin.json();
        tellerToken = tellerData.token;
        logResult('TELLER_LOGIN', tellerLogin.ok, 'Login as Teller');


        // 2. RBAC Access Control
        console.log('\n[PHASE 2] RBAC - Access Control Verification');

        // Customer trying to access teller route
        const custToTeller = await fetch(`${BASE_URL}/teller/lookup?query=test`, {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        logResult('RBAC_CUST_TO_TELLER', custToTeller.status === 403 || custToTeller.status === 401, 'Customer accessing Teller route (Expected Fail)');

        // Teller trying to access admin route
        const tellerToAdmin = await fetch(`${BASE_URL}/admin/monitoring/stats`, {
            headers: { 'Authorization': `Bearer ${tellerToken}` }
        });
        logResult('RBAC_TELLER_TO_ADMIN', tellerToAdmin.status === 403 || tellerToAdmin.status === 401, 'Teller accessing Admin route (Expected Fail)');

        // Valid Teller access
        const tellerToTeller = await fetch(`${BASE_URL}/teller/account-types`, {
            headers: { 'Authorization': `Bearer ${tellerToken}` }
        });
        logResult('RBAC_TELLER_AUTH', tellerToTeller.ok, 'Teller accessing Teller route (Expected Success)');


        // 3. No Token Access
        console.log('\n[PHASE 3] Authentication - Missing/Invalid Tokens');
        const noToken = await fetch(`${BASE_URL}/customer/accounts`);
        logResult('AUTH_NO_TOKEN', noToken.status === 401, 'Accessing protected route with no token');

        const badToken = await fetch(`${BASE_URL}/customer/accounts`, {
            headers: { 'Authorization': 'Bearer invalid_token_here' }
        });
        logResult('AUTH_BAD_TOKEN', badToken.status === 401, 'Accessing protected route with invalid token');


        // 4. SQL Injection Resistance
        console.log('\n[PHASE 4] Security - SQL Injection Protection');
        // Test in lookup query
        const sqlInj = await fetch(`${BASE_URL}/teller/lookup?query=' OR 1=1 --`, {
            headers: { 'Authorization': `Bearer ${tellerToken}` }
        });
        const injData = await sqlInj.json();
        logResult('SECURITY_SQL_INJ', sqlInj.ok && Array.isArray(injData.results) && injData.results.length < 50, 'SQL Injection attempt results (Verified Parameterized)');


        // 5. OTP Max Attempts
        console.log('\n[PHASE 5] Security - OTP Attempt Limits');
        // Generate an OTP first
        const otpGen = await fetch(`${BASE_URL}/otp/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customerToken}` },
            body: JSON.stringify({ purpose: 'TRANSACTION', amount: 100, toAccountId: 'ACC-MUM-003-0421' })
        });

        if (otpGen.ok) {
            console.log('Testing 4 invalid OTP attempts (max should be 3)...');
            for (let i = 1; i <= 4; i++) {
                const otpVal = await fetch(`${BASE_URL}/customer/transfer/internal`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customerToken}` },
                    body: JSON.stringify({
                        fromAccountId: 'ACC-MUM-003-8821',
                        toAccountId: 'ACC-MUM-003-0421',
                        amount: 10,
                        otpCode: '000000'
                    })
                });
                const res = await otpVal.json();
                console.log(`  Attempt ${i}: Status ${otpVal.status}, Message: ${res.message}`);
                if (i === 4) {
                    logResult('SECURITY_OTP_LIMIT', otpVal.status === 400 && res.message.toLowerCase().includes('cancelled'), 'OTP blocked after max attempts');
                }
            }
        } else {
            console.error('Failed to generate OTP for testing.');
        }

    } catch (err) {
        console.error('Security Test Failure:', err.message);
    }
}

runSecurityTests();
