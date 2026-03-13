-- Create Missing Audit and Protection Triggers
-- These triggers are added to enhance auditing without modifying existing business logic.

-- 1. TRG_AUDIT_STATUS_CHANGE
-- Audits changes to the 'status' column in the ACCOUNTS table.
-- Note: 'trg_audit_status_change' might exist with a different case, so we use CREATE OR REPLACE.
CREATE OR REPLACE TRIGGER TRG_AUDIT_STATUS_CHANGE
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
END;
/

-- 2. TRG_AUDIT_LOAN_STATUS
-- Audits changes to the 'status' column in the LOAN_APPLICATIONS table.
CREATE OR REPLACE TRIGGER TRG_AUDIT_LOAN_STATUS
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
END;
/

-- 3. TRG_AUDIT_ACCOUNT_WRITE
-- Audits general modifications (Inserts/Updates/Deletes) to the ACCOUNTS table.
CREATE OR REPLACE TRIGGER TRG_AUDIT_ACCOUNT_WRITE
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
END;
/

-- 4. TRG_AUDIT_TRANSACTION
-- Logs new transaction records into AUDIT_LOG for traceability.
CREATE OR REPLACE TRIGGER TRG_AUDIT_TRANSACTION
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
END;
/

-- 5. TRG_AUDIT_DUAL_APPROVAL
-- Logs when a DUAL_APPROVAL_QUEUE request is processed.
CREATE OR REPLACE TRIGGER TRG_AUDIT_DUAL_APPROVAL
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
END;
/

COMMIT;
