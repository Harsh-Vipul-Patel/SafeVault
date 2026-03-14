const oracledb = require('oracledb');
require('dotenv').config({ path: './.env' });

async function fixTrigger() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('Connected to Oracle DB.');

        const sql = `
        CREATE OR REPLACE TRIGGER trg_transaction_velocity
        AFTER INSERT ON TRANSACTIONS
        FOR EACH ROW
        WHEN (NEW.transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT'))
        DECLARE
            PRAGMA AUTONOMOUS_TRANSACTION;
            v_daily_total    NUMBER;
            v_velocity_limit NUMBER := 500000;
        BEGIN
            SELECT NVL(SUM(amount), 0) INTO v_daily_total
            FROM TRANSACTIONS
            WHERE account_id = :NEW.account_id
              AND transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT')
              AND TRUNC(transaction_date) = TRUNC(SYSDATE);

            BEGIN
                SELECT TO_NUMBER(config_value) INTO v_velocity_limit
                FROM SYSTEM_CONFIG WHERE config_key = 'VELOCITY_DAILY_LIMIT';
            EXCEPTION WHEN NO_DATA_FOUND THEN
                v_velocity_limit := 500000;
            END;

            IF v_daily_total > v_velocity_limit THEN
                INSERT INTO COMPLIANCE_FLAGS (account_id, transaction_id, flag_type, threshold_value)
                VALUES (:NEW.account_id, :NEW.transaction_id, 'VELOCITY_BREACH', v_velocity_limit);
                COMMIT;
            END IF;
        END;
        `;

        await connection.execute(sql);
        console.log('Trigger trg_transaction_velocity updated successfully.');

    } catch (err) {
        console.error('Error applying fix:', err);
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

fixTrigger();
