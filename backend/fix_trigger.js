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

        console.log('Replacing Trigger...');
        await connection.execute(`
CREATE OR REPLACE TRIGGER trg_transaction_velocity
AFTER INSERT ON TRANSACTIONS
FOR EACH ROW
WHEN (NEW.transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT'))
DECLARE
    PRAGMA AUTONOMOUS_TRANSACTION;
    v_daily_total NUMBER;
    v_velocity_limit NUMBER;
BEGIN
    -- Check total debits for today (autonomous transaction won't see the uncommitted current row)
    SELECT NVL(SUM(amount), 0) INTO v_daily_total
    FROM TRANSACTIONS
    WHERE account_id = :NEW.account_id
      AND transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT')
      AND TRUNC(transaction_date) = TRUNC(SYSDATE);

    -- Add the current transaction amount
    v_daily_total := v_daily_total + :NEW.amount;

    -- Get configured limit, default 500000 if not found
    BEGIN
        SELECT TO_NUMBER(config_value) INTO v_velocity_limit
        FROM SYSTEM_CONFIG WHERE config_key = 'VELOCITY_DAILY_LIMIT';
    EXCEPTION WHEN NO_DATA_FOUND THEN
        v_velocity_limit := 500000;
    END;

    IF v_daily_total > v_velocity_limit THEN
        -- Insert a compliance flag silently
        INSERT INTO COMPLIANCE_FLAGS (account_id, transaction_id, flag_type, threshold_value)
        VALUES (:NEW.account_id, :NEW.transaction_id, 'VELOCITY_BREACH', v_velocity_limit);

        -- And flag the audit log
        UPDATE AUDIT_LOG
        SET violation_flag = '1'
        WHERE record_id = :NEW.account_id
        AND operation = 'UPDATE' AND table_name = 'ACCOUNTS'
        AND ROWNUM = 1; 
    END IF;
    
    COMMIT; -- Required for autonomous transaction
END;
    `);

        console.log('Trigger replaced successfully.');
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error(e); }
        }
    }
}

run();
