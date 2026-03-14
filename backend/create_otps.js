require('dotenv').config();
const oracledb = require('oracledb');
const db = require('./db.js');

async function createOtps() {
    let connection;
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        console.log("Creating OTPS table...");
        await connection.execute(`
            CREATE TABLE OTPS (
                otp_id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
                user_id RAW(16) NOT NULL,
                transaction_id VARCHAR2(50),
                otp_hash VARCHAR2(255) NOT NULL,
                purpose VARCHAR2(50) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                status VARCHAR2(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED')),
                created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
                CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES USERS(user_id) ON DELETE CASCADE
            )
        `);
        console.log("OTPS table created successfully.");
        
    } catch (err) {
        console.error("Error creating OTPS table:", err.message);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
        await db.closeDBPool();
    }
}
createOtps();
