require('dotenv').config();
const oracledb = require('oracledb');
const db = require('./db.js');

async function updateEmails() {
    let connection;
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        const targetEmail = 'meetkumar.t@ahduni.edu.in';
        
        console.log(`Updating all customer emails to: ${targetEmail}`);
        const result = await connection.execute(
            `UPDATE CUSTOMERS SET email = :email`,
            { email: targetEmail },
            { autoCommit: true }
        );
        console.log(`Updated ${result.rowsAffected} customer records.`);
        
        console.log("\nNew Email Config:");
        const b = await connection.execute(`SELECT full_name, email FROM CUSTOMERS`);
        console.table(b.rows);
        
    } catch (err) {
        console.error("Error updating emails:", err.message);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
        await db.closeDBPool();
    }
}
updateEmails();
