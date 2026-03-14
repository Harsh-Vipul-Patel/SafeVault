require('dotenv').config();
const fs = require('fs');
const oracledb = require('oracledb');
const db = require('./db.js');

async function checkData() {
    let connection;
    try {
        await db.initializeDBPool();
        connection = await oracledb.getPool().getConnection();
        
        let out = "--- ACCOUNT_TYPES ---\n";
        let result = await connection.execute(`SELECT type_id, type_name FROM ACCOUNT_TYPES`);
        out += JSON.stringify(result.rows, null, 2) + "\n\n";
        
        fs.writeFileSync('output_types.json', out, 'utf8');
        console.log("Written to output_data2.json");
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
        await db.closeDBPool();
    }
}

checkData();
