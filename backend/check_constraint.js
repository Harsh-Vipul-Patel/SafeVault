require('dotenv').config();
const oracledb = require('oracledb');
const db = require('./db.js');
const fs = require('fs');

async function checkConstraint() {
    let connection;
    let log = '';
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        let c = await connection.execute(`
            SELECT table_name, column_name 
            FROM all_cons_columns 
            WHERE constraint_name = 'SYS_C008729'
        `);
        log += "Constraint details: " + JSON.stringify(c.rows) + "\n";
        
        let a = await connection.execute(`SELECT * FROM ACCOUNTS`);
        log += "All accounts raw: " + JSON.stringify(a.rows) + "\n";
        
    } catch (err) {
        log += "FATAL: " + err.message + "\n";
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
        await db.closeDBPool();
    }
    fs.writeFileSync('constraint_log.txt', log, 'utf8');
}
checkConstraint();
