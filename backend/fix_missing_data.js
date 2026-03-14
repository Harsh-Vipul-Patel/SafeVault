require('dotenv').config();
const oracledb = require('oracledb');
const db = require('./db.js');

async function fixData() {
    let connection;
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        console.log("Checking Account Types...");
        let typeResult = await connection.execute(`SELECT type_name FROM ACCOUNT_TYPES WHERE type_name = 'Basic Savings'`);
        if (typeResult.rows.length === 0) {
            console.log("Inserting Basic Savings type...");
            await connection.execute(`
                INSERT INTO ACCOUNT_TYPES (type_name, interest_rate, min_balance, max_withdrawal)
                VALUES ('Basic Savings', 0.035, 500.00, 500000.00)
            `);
        }
        
        console.log("Fetching type IDs...");
        let types = await connection.execute(`SELECT type_id, type_name FROM ACCOUNT_TYPES`);
        let typeMap = {};
        types.rows.forEach(r => typeMap[r.TYPE_NAME] = r.TYPE_ID);
        
        console.log("Inserting Accounts...");
        const queries = [
            {
                q: `INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
                    VALUES ('ACC-MUM-003-0421', '004000010000003', 'CUST-002', :tid, 'BRN-MUM-003', 124500.00, 'ACTIVE', DATE '2022-01-10', 25000.00, 'Mr. Suresh Kumar')`,
                binds: { tid: typeMap['Savings Premium'] },
                name: "Customer 2 - Amit Kumar"
            },
            {
                q: `INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
                    VALUES ('ACC-MUM-003-2233', '004000030000004', 'CUST-003', :tid, 'BRN-MUM-003', 75000.00, 'ACTIVE', DATE '2023-03-15', 500.00, 'Mr. Suresh Rao')`,
                binds: { tid: typeMap['Basic Savings'] },
                name: "Customer 3 - Sunita Rao"
            },
            {
                q: `INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
                    VALUES ('ACC-MUM-003-5577', '004000040000005', 'CUST-004', :tid, 'BRN-MUM-003', 540000.00, 'ACTIVE', DATE '2022-09-01', 25000.00, 'Mrs. Kamla Mehta')`,
                binds: { tid: typeMap['Savings Premium'] },
                name: "Customer 4 - Vikram Mehta"
            }
        ];
        
        for (let q of queries) {
            try {
                await connection.execute(q.q, q.binds);
                console.log(`Success inserting: ${q.name}`);
            } catch (e) {
                if (e.message.includes('ORA-00001: unique constraint')) {
                    console.log(`Already exists: ${q.name}`);
                } else {
                    console.error(`Error inserting ${q.name}:`, e.message);
                }
            }
        }
        await connection.commit();
        console.log("Committed.");
        
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
        await db.closeDBPool();
    }
}

fixData();
