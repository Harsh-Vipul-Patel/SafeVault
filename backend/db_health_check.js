const oracledb = require('oracledb');
require('dotenv').config({ path: './.env' });

async function check() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('--- SURAKSHA BANK DB HEALTH CHECK ---');

        // 1. Check Tables
        const tables = ['USERS', 'EMPLOYEES', 'CUSTOMERS', 'ACCOUNTS', 'TRANSACTIONS', 'KYC_DETAILS', 'NOTIFICATION_LOG', 'AUDIT_LOG', 'SERVICE_REQUESTS'];
        console.log('\n--- TABLES ---');
        for (const table of tables) {
            try {
                const res = await conn.execute(`SELECT COUNT(*) FROM ${table}`);
                console.log(`[PASS] ${table.padEnd(20)}: ${res.rows[0][0]} rows`);
            } catch (e) {
                console.log(`[FAIL] ${table.padEnd(20)}: MISSING or ERROR ${e.message.split('\n')[0]}`);
            }
        }

        // 2. Check Procedures
        const procedures = ['SP_VERIFY_KYC', 'SP_DEPOSIT', 'SP_WITHDRAW', 'SP_OPEN_ACCOUNT', 'SP_INTERNAL_TRANSFER', 'SP_ISSUE_CHEQUE_BOOK'];
        console.log('\n--- PROCEDURES ---');
        for (const proc of procedures) {
            try {
                const res = await conn.execute(`SELECT status FROM user_objects WHERE object_name = '${proc}' AND object_type = 'PROCEDURE'`);
                if (res.rows.length > 0) {
                    console.log(`[PASS] ${proc.padEnd(25)}: ${res.rows[0][0]}`);
                } else {
                    console.log(`[FAIL] ${proc.padEnd(25)}: MISSING`);
                }
            } catch (e) {
                console.log(`[FAIL] ${proc.padEnd(25)}: ERROR ${e.message.split('\n')[0]}`);
            }
        }

        // 3. Check Specific KYC Procedure Errors
        console.log('\n--- COMPILATION ERRORS ---');
        const errors = await conn.execute(`SELECT name, type, line, position, text FROM user_errors WHERE attribute = 'ERROR'`);
        if (errors.rows.length === 0) {
            console.log('No compilation errors found.');
        } else {
            errors.rows.forEach(r => console.log(`[!] ${r[0]} (${r[1]}) at line ${r[2]}: ${r[4]}`));
        }

    } catch (err) {
        console.error('CRITICAL ERROR:', err.message);
    } finally {
        if (conn) await conn.close();
    }
}

check();
