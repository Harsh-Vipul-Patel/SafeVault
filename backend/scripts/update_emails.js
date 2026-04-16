require('dotenv').config();
const oracledb = require('oracledb');

async function run() {
    let c; 
    try { 
        c = await oracledb.getConnection({
            user: process.env.DB_USER||'C##HARSHUERSR', 
            password: process.env.DB_PASSWORD||'password123', 
            connectionString: process.env.DB_CONNECTION_STRING||'localhost:1521/XEPDB1'
        }); 
        const result = await c.execute(`UPDATE EMPLOYEES SET email = 'harsh2712006@gmail.com'`, [], {autoCommit: true}); 
        console.log(`Updated all ${result.rowsAffected} employee emails to harsh2712006@gmail.com.`); 
    } catch(e) {
        console.error(e);
    } finally {
        if(c) await c.close();
    } 
} 
run();
