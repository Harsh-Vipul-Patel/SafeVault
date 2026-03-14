require('dotenv').config();
const oracledb = require('oracledb');
const db = require('./db.js');

async function checkEmails() {
    let connection;
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        let result = await connection.execute(`SELECT full_name, email FROM CUSTOMERS`);
        console.log(JSON.stringify(result.rows, null, 2));
        
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
        await db.closeDBPool();
    }
}

checkEmails();
