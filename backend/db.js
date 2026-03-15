const oracledb = require('oracledb');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

async function initializeDBPool() {
    try {
        console.log('Initializing Oracle DB connection pool...');
        await oracledb.createPool({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING,
            poolMin: 2,
            poolMax: 10,
            poolIncrement: 1
        });
        console.log('Oracle DB connection pool started.');
    } catch (err) {
        console.error('init() error: ', err.message);
        throw err;
    }
}

async function closeDBPool() {
    console.log('Closing Oracle DB connection pool...');
    try {
        await oracledb.getPool().close(10);
        console.log('Oracle DB connection pool closed.');
    } catch (err) {
        console.error('close() error: ', err.message);
    }
}

module.exports = { initializeDBPool, closeDBPool };
