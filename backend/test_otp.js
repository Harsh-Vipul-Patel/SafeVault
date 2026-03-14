require('dotenv').config();
const oracledb = require('oracledb');
const db = require('./db.js');
const bcrypt = require('bcryptjs');

async function testOtp() {
    let connection;
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        let u = await connection.execute(`SELECT user_id FROM USERS WHERE username='ravi.verma'`);
        let uid = u.rows[0].USER_ID;

        const otpCode = '123456';
        const otpHash = await bcrypt.hash(otpCode, 10);
        
        console.log("Trying to insert OTP...");
        await connection.execute(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES (:user_id, :tx_id, :otp_hash, :purpose, CURRENT_TIMESTAMP + INTERVAL '1' MINUTE, 'PENDING')`,
            {
                user_id: uid,
                tx_id: null,
                otp_hash: otpHash,
                purpose: 'TEST'
            },
            { autoCommit: true }
        );
        console.log("OTP Inserted successfully");
        
    } catch (err) {
        console.error("OTP Error:", err.message);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
        await db.closeDBPool();
    }
}
testOtp();
