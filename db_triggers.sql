-- Suraksha Bank Safe Vault System
-- Database Triggers (Oracle 21c)

-- 1. Balance Change Audit Trigger
CREATE OR REPLACE TRIGGER trg_audit_balance_change
AFTER UPDATE OF balance ON ACCOUNTS
FOR EACH ROW
WHEN (OLD.balance <> NEW.balance)
BEGIN
    INSERT INTO AUDIT_LOG (
        table_name, record_id, operation, changed_by, 
        old_value_json, new_value_json, change_reason, ip_address, session_id
    ) VALUES (
        'ACCOUNTS', :NEW.account_id, 'UPDATE', 
        NVL(SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'), 'SYSTEM'),
        '{"balance": ' || :OLD.balance || ', "status": "' || :OLD.status || '"}',
        '{"balance": ' || :NEW.balance || ', "status": "' || :NEW.status || '"}',
        SYS_CONTEXT('SURAKSHA_CTX', 'change_reason'),
        SYS_CONTEXT('USERENV', 'IP_ADDRESS'),
        SYS_CONTEXT('USERENV', 'SESSIONID')
    );
END;
/

-- 2. Status Change Audit Trigger
CREATE OR REPLACE TRIGGER trg_audit_status_change
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

-- 3. Transaction Sequence and formatting Trigger
CREATE SEQUENCE seq_transaction_id START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE OR REPLACE TRIGGER trg_transaction_sequence
BEFORE INSERT ON TRANSACTIONS
FOR EACH ROW
BEGIN
    IF :NEW.transaction_ref IS NULL THEN
        :NEW.transaction_ref := 'TXN-' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '-' || LPAD(seq_transaction_id.NEXTVAL, 6, '0');
    END IF;
END;
/

-- 4. Account Closure Check Trigger
CREATE OR REPLACE TRIGGER trg_account_closure_check
BEFORE UPDATE OF status ON ACCOUNTS
FOR EACH ROW
WHEN (NEW.status = 'CLOSED')
BEGIN
    IF :OLD.balance > 0 THEN
        RAISE_APPLICATION_ERROR(-20002, 'Account closure rejected: Balance must be zero.');
    END IF;
END;
/

-- 5. Velocity Check Trigger
CREATE OR REPLACE TRIGGER trg_transaction_velocity
AFTER INSERT ON TRANSACTIONS
FOR EACH ROW
WHEN (NEW.transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT'))
DECLARE
    v_daily_total NUMBER;
    v_velocity_limit NUMBER;
BEGIN
    -- Check total debits for today
    SELECT NVL(SUM(amount), 0) INTO v_daily_total
    FROM TRANSACTIONS
    WHERE account_id = :NEW.account_id
      AND transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT')
      AND TRUNC(transaction_date) = TRUNC(SYSDATE);
      
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
        AND ROWNUM = 1; -- Assuming the balance update just happened
    END IF;
END;
/
