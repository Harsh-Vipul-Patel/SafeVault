-- SafeVault PostgreSQL Triggers
-- Converted from Oracle 21c

-- 1. Balance Change Audit Function and Trigger
CREATE OR REPLACE FUNCTION fn_audit_balance_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.balance <> NEW.balance) THEN
        INSERT INTO AUDIT_LOG (
            table_name, record_id, operation, changed_by, 
            old_value_json, new_value_json, change_reason, ip_address
        ) VALUES (
            'ACCOUNTS', NEW.account_id, 'UPDATE', 
            current_setting('suraksha.client_identifier', true), -- Custom session variable
            json_build_object('balance', OLD.balance, 'status', OLD.status)::text,
            json_build_object('balance', NEW.balance, 'status', NEW.status)::text,
            current_setting('suraksha.change_reason', true),
            inet_client_addr()::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_balance_change
AFTER UPDATE OF balance ON ACCOUNTS
FOR EACH ROW
EXECUTE FUNCTION fn_audit_balance_change();

-- 2. Status Change Audit Function and Trigger
CREATE OR REPLACE FUNCTION fn_audit_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status <> NEW.status) THEN
        INSERT INTO AUDIT_LOG (
            table_name, record_id, operation, changed_by, 
            old_value_json, new_value_json, change_reason
        ) VALUES (
            'ACCOUNTS', NEW.account_id, 'UPDATE_STATUS', 
            current_setting('suraksha.client_identifier', true),
            json_build_object('status', OLD.status)::text,
            json_build_object('status', NEW.status)::text,
            current_setting('suraksha.change_reason', true)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_status_change
AFTER UPDATE OF status ON ACCOUNTS
FOR EACH ROW
EXECUTE FUNCTION fn_audit_status_change();

-- 3. Transaction Reference Trigger (Handling sequence manually if not SERIAL)
-- Since transaction_id is SERIAL, we can use it for formatting if needed, 
-- but here we follow the Oracle TXN-DATE-SEQ pattern.
CREATE SEQUENCE IF NOT EXISTS seq_transaction_id START 1;

CREATE OR REPLACE FUNCTION fn_transaction_sequence()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.transaction_ref IS NULL THEN
        NEW.transaction_ref := 'TXN-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('seq_transaction_id')::text, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_sequence
BEFORE INSERT ON TRANSACTIONS
FOR EACH ROW
EXECUTE FUNCTION fn_transaction_sequence();

-- 4. Account Closure Check
CREATE OR REPLACE FUNCTION fn_account_closure_check()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'CLOSED' AND OLD.balance > 0 THEN
        RAISE EXCEPTION 'Account closure rejected: Balance must be zero.' USING ERRCODE = 'P0002';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_account_closure_check
BEFORE UPDATE OF status ON ACCOUNTS
FOR EACH ROW
EXECUTE FUNCTION fn_account_closure_check();

-- 5. Velocity Check Trigger
-- In PG, AFTER INSERT ROW trigger CAN query the table without ORA-04091.
CREATE OR REPLACE FUNCTION fn_transaction_velocity()
RETURNS TRIGGER AS $$
DECLARE
    v_daily_total NUMERIC;
    v_velocity_limit NUMERIC;
BEGIN
    -- Check total debits for today
    SELECT COALESCE(SUM(amount), 0) INTO v_daily_total
    FROM TRANSACTIONS
    WHERE account_id = NEW.account_id
      AND transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT')
      AND transaction_date::date = CURRENT_DATE;
      
    -- Get configured limit
    SELECT CAST(config_value AS NUMERIC) INTO v_velocity_limit
    FROM SYSTEM_CONFIG WHERE config_key = 'VELOCITY_DAILY_LIMIT';
    
    IF NOT FOUND THEN
        v_velocity_limit := 500000;
    END IF;

    IF v_daily_total > v_velocity_limit THEN
        -- Insert a compliance flag
        INSERT INTO COMPLIANCE_FLAGS (account_id, transaction_id, flag_type, threshold_value)
        VALUES (NEW.account_id, NEW.transaction_id, 'VELOCITY_BREACH', v_velocity_limit);
        
        -- Flag the audit log (simplification: update last account update)
        UPDATE AUDIT_LOG 
        SET violation_flag = '1'
        WHERE record_id = NEW.account_id 
        AND table_name = 'ACCOUNTS' 
        AND operation = 'UPDATE'
        AND changed_at >= CURRENT_TIMESTAMP - INTERVAL '1 second';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_velocity
AFTER INSERT ON TRANSACTIONS
FOR EACH ROW
WHEN (NEW.transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT'))
EXECUTE FUNCTION fn_transaction_velocity();
