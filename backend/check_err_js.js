require('dotenv').config();
const oracledb = require('oracledb');
const db = require('./db.js');
const fs = require('fs');

async function checkErr() {
    let connection;
    let log = '';
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        // 1. Check branches
        let b = await connection.execute(`SELECT branch_id FROM BRANCHES`);
        log += "Branches: " + JSON.stringify(b.rows) + "\n";
        
        let targetType = 1; // Savings Premium
        try {
            await connection.execute(`
                INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
                VALUES ('ACC-MUM-003-0421', '004000010000003', 'CUST-002', :tid, 'BRN-MUM-003', 124500.00, 'ACTIVE', DATE '2022-01-10', 25000.00, 'Mr. Suresh Kumar')
            `, { tid: targetType });
            log += "Inserted CUST-002 account!\n";
        } catch(e) {
            log += "Error inserting CUST-002: " + e.message + "\n";
        }
        
    } catch (err) {
        log += "FATAL: " + err.message + "\n";
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
        await db.closeDBPool();
    }
    fs.writeFileSync('insert_error_log.txt', log, 'utf8');
}
checkErr();
