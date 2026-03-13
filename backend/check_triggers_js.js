const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        const result = await connection.execute(
            `SELECT trigger_name, status 
             FROM user_triggers 
             WHERE trigger_name IN (
                'TRG_AUDIT_STATUS_CHANGE',
                'TRG_AUDIT_LOAN_STATUS',
                'TRG_PREVENT_SR_MODIFICATION',
                'TRG_AUDIT_ACCOUNT_WRITE',
                'TRG_AUDIT_KYC_CHANGE',
                'TRG_AUDIT_TRANSACTION',
                'TRG_AUDIT_DUAL_APPROVAL'
             ) 
             ORDER BY trigger_name`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log('--- TRIGGER STATUS ---');
        result.rows.forEach(row => {
            console.log(`${row.TRIGGER_NAME}: ${row.STATUS}`);
        });
        
        console.log(`Total found: ${result.rows.length}`);

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
}

run();
