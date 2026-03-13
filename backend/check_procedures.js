require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

async function checkProcedures() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        
        const query = `
SELECT object_name, status
FROM   user_objects
WHERE  object_type = 'PROCEDURE'
AND    object_name IN (
  'SP_INTERNAL_TRANSFER','SP_INITIATE_EXTERNAL_TRANSFER',
  'SP_GENERATE_STATEMENT','SP_CHANGE_PASSWORD',
  'SP_DEPOSIT','SP_WITHDRAW','SP_OPEN_ACCOUNT',
  'SP_SUBMIT_DUAL_APPROVAL','SP_VERIFY_KYC',
  'SP_OPEN_FD','SP_OPEN_RD',
  'SP_ISSUE_CHEQUE_BOOK','SP_RECORD_STOP_PAYMENT',
  'SP_CREATE_SERVICE_REQUEST','SP_APPROVE_DUAL_QUEUE',
  'SP_SET_ACCOUNT_STATUS','SP_APPROVE_EXTERNAL_TRANSFER',
  'SP_REJECT_EXTERNAL_TRANSFER','SP_GENERATE_BRANCH_MIS',
  'SP_PROCESS_FD_MATURITY','SP_RESOLVE_SERVICE_REQUEST',
  'SP_GENERATE_EMI_SCHEDULE','SP_DISBURSE_LOAN',
  'SP_RECORD_EMI_PAYMENT','SP_CLOSE_LOAN',
  'SP_UPDATE_LOAN_STATUS','SP_LOAN_PREPAYMENT',
  'SP_FORECLOSE_LOAN','SP_MARK_LOAN_OVERDUE',
  'SP_EXECUTE_STANDING_INSTRUCTION','SP_PROCESS_CHEQUE_CLEARING',
  'SP_PROCESS_RD_MATURITY'
)
ORDER BY object_name
`;
        
        const result = await connection.execute(query);
        console.log(`Found ${result.rows.length} procedures.`);
        
        let allValid = true;
        result.rows.forEach(row => {
            console.log(`${row.OBJECT_NAME}: ${row.STATUS}`);
            if (row.STATUS !== 'VALID') {
                allValid = false;
            }
        });
        
        console.log('---');
        if (result.rows.length === 32 && allValid) {
            console.log('✅ PASS: Exactly 32 rows returned and all are VALID.');
        } else {
            console.log('❌ FAIL: The check failed.');
            console.log(`Total Rows: ${result.rows.length} (Expected 32)`);
            console.log(`All Valid: ${allValid} (Expected true)`);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}

checkProcedures();
