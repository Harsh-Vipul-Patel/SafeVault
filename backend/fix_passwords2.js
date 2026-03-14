require('dotenv').config();
const oracledb = require('oracledb');
const db = require('./db.js');

async function fixPasswords() {
    let connection;
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        // Use the exact SHA256 of 'password' as defined in db_seed.sql
        const targetHash = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';
        
        await connection.execute(
            `UPDATE USERS SET password_hash = :hash WHERE username IN ('sunita.rao', 'vikram.mehta')`,
            { hash: targetHash },
            { autoCommit: true }
        );
        
        console.log("Passwords fixed!");

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
        await db.closeDBPool();
    }
}

fixPasswords();
