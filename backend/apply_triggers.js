const oracledb = require('oracledb');
require('dotenv').config();

const triggerDDLs = [
    `CREATE OR REPLACE TRIGGER TRG_AUDIT_STATUS_CHANGE
    AFTER UPDATE OF status ON ACCOUNTS
    FOR EACH ROW
    WHEN (OLD.status <> NEW.status)
    BEGIN
        INSERT INTO AUDIT_LOG (
            table_name, record_id, operation, changed_by, 
            old_value_json, new_value_json, change_reason
        ) VALUES (
            'ACCOUNTS', :NEW.account_id, 'UPDATE_STATUS', 
            NVL(SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'), 'SYSTEM'),
            '{"status": "' || :OLD.status || '"}',
            '{"status": "' || :NEW.status || '"}',
            SYS_CONTEXT('SURAKSHA_CTX', 'change_reason')
        );
    END;`,
    
    `CREATE OR REPLACE TRIGGER TRG_AUDIT_LOAN_STATUS
    AFTER UPDATE OF status ON LOAN_APPLICATIONS
    FOR EACH ROW
    WHEN (OLD.status <> NEW.status)
    BEGIN
        INSERT INTO AUDIT_LOG (
            table_name, record_id, operation, changed_by, 
            old_value_json, new_value_json, change_reason
        ) VALUES (
            'LOAN_APPLICATIONS', :NEW.loan_app_id, 'UPDATE_LOAN_STATUS', 
            NVL(SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'), 'SYSTEM'),
            '{"status": "' || :OLD.status || '"}',
            '{"status": "' || :NEW.status || '"}',
            'Loan status change'
        );
    END;`,

    `CREATE OR REPLACE TRIGGER TRG_AUDIT_ACCOUNT_WRITE
    AFTER INSERT OR UPDATE OR DELETE ON ACCOUNTS
    FOR EACH ROW
    DECLARE
        v_op VARCHAR2(20);
        v_id VARCHAR2(50);
    BEGIN
        IF INSERTING THEN
            v_op := 'INSERT';
            v_id := :NEW.account_id;
        ELSIF UPDATING THEN
            v_op := 'UPDATE';
            v_id := :NEW.account_id;
        ELSE
            v_op := 'DELETE';
            v_id := :OLD.account_id;
        END IF;

        INSERT INTO AUDIT_LOG (
            table_name, record_id, operation, changed_by
        ) VALUES (
            'ACCOUNTS', v_id, 'ACCOUNT_WRITE_' || v_op, 
            NVL(SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'), 'SYSTEM')
        );
    END;`,

    `CREATE OR REPLACE TRIGGER TRG_AUDIT_TRANSACTION
    AFTER INSERT ON TRANSACTIONS
    FOR EACH ROW
    BEGIN
        INSERT INTO AUDIT_LOG (
            table_name, record_id, operation, changed_by,
            new_value_json
        ) VALUES (
            'TRANSACTIONS', TO_CHAR(:NEW.transaction_id), 'INSERT_TRANSACTION', 
            NVL(SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'), 'SYSTEM'),
            '{"type": "' || :NEW.transaction_type || '", "amount": ' || :NEW.amount || '}'
        );
    END;`,

    `CREATE OR REPLACE TRIGGER TRG_AUDIT_DUAL_APPROVAL
    AFTER UPDATE OF status ON DUAL_APPROVAL_QUEUE
    FOR EACH ROW
    WHEN (OLD.status <> NEW.status AND NEW.status IN ('APPROVED', 'REJECTED'))
    BEGIN
        INSERT INTO AUDIT_LOG (
            table_name, record_id, operation, changed_by,
            old_value_json, new_value_json, change_reason
        ) VALUES (
            'DUAL_APPROVAL_QUEUE', :NEW.queue_id, 'PROCESS_APPROVAL', 
            NVL(SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'), 'SYSTEM'),
            '{"status": "' || :OLD.status || '"}',
            '{"status": "' || :NEW.status || '"}',
            :NEW.review_note
        );
    END;`
];

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('--- APPLYING TRIGGERS ---');
        for (const ddl of triggerDDLs) {
            try {
                await connection.execute(ddl);
                const triggerName = ddl.match(/TRIGGER\s+(\w+)/i)[1];
                console.log(`[PASS] Trigger ${triggerName} created.`);
            } catch (err) {
                console.error(`[FAIL] Trigger creation failed: ${err.message}`);
            }
        }

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

        console.log('\n--- FINAL TRIGGER STATUS ---');
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
