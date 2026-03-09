const oracledb = require('oracledb');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';

async function testApi() {
  let connection;
  try {
    connection = await oracledb.getConnection({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectString: process.env.DB_CONNECTION_STRING
    });

    const users = await connection.execute("SELECT username FROM USERS WHERE role = 'CUSTOMER'");
    const username = users.rows[0][0];
    
    // Login
    console.log('Logging in with', username, 'and default Password123!');
    let res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST', body: JSON.stringify({ username: username, password: 'Password123!' }),
        headers: { 'Content-Type': 'application/json' }
    });
    
    if (!res.ok) {
       // try RaviVerma standard password
       console.log('Trying original DB password for RaviVerma...');
       res = await fetch(`${API_URL}/auth/login`, {
           method: 'POST', body: JSON.stringify({ username: 'RaviVerma', password: 'password123' }),
           headers: { 'Content-Type': 'application/json' }
       });
       if (!res.ok) throw new Error('Could not login. Res: ' + await res.text());
    }

    const login = await res.json();
    const token = login.token;

    const accounts = await connection.execute(`SELECT account_id FROM ACCOUNTS FETCH FIRST 2 ROWS ONLY`);
    const acc1 = accounts.rows[0][0];
    const acc2 = accounts.rows[1][0];

    // Generate OTP
    const otpRes = await fetch(`${API_URL}/otp/generate`, {
        method: 'POST', body: JSON.stringify({ purpose: 'TRANSACTION', amount: 10, toAccountId: acc2 }),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    if (!otpRes.ok) throw new Error('OTP generation failed: ' + await otpRes.text());

    // Fix OTP hash to 123456
    const bcrypt = require('bcryptjs');
    const knownHash = await bcrypt.hash('123456', 10);
    await connection.execute(`UPDATE OTPS SET otp_hash = :hash WHERE status = 'PENDING'`, { hash: knownHash }, { autoCommit: true });

    // Internal Transfer
    const attempt = await fetch(`${API_URL}/customer/transfer/internal`, {
        method: 'POST', body: JSON.stringify({ fromAccountId: acc1, toAccountId: acc2, amount: 1, otpCode: '123456' }),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    const ans = await attempt.json();
    console.log(`Transfer Result: ${attempt.status} -`, ans);

  } catch (err) {
    console.error('Failure:', err.message);
  } finally {
    if (connection) await connection.close();
  }
}

testApi();
