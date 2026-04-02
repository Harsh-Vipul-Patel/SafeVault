-- Fix: TRG_TRANSACTION_VELOCITY mutating table error
-- Root cause: trigger reads TRANSACTIONS table during an INSERT into that same table
-- Fix: PRAGMA AUTONOMOUS_TRANSACTION allows the trigger to open and close its own transaction context
-- for the SELECT without seeing the uncommitted mutating row

CREATE OR REPLACE TRIGGER trg_transaction_velocity
AFTER INSERT ON TRANSACTIONS
FOR EACH ROW
WHEN (NEW.transaction_type IN ('DEBIT', 'TRANSFER_DEBIT', 'EXTERNAL_DEBIT'))
DECLARE
    PRAGMA AUTONOMOUS_TRANSACTION;
    v_daily_total    NUMBER;
    v_velocity_limit NUMBER := 500000;
BEGIN
    -- Autonomous TX: can see committed rows safely
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
        COMMIT; -- Autonomous TX needs explicit commit
    END IF;
END;
/

SHOW ERRORS TRIGGER trg_transaction_velocity;

-- Quick re-test
BEGIN
    sp_internal_transfer('ACC-MUM-003-8821', 'ACC-MUM-003-1029', 500, 'CUST-001');
    DBMS_OUTPUT.PUT_LINE('Transfer SUCCESS');
END;
/

SELECT 'AFTER_FIX' AS state, account_id, balance FROM ACCOUNTS 
WHERE account_id IN ('ACC-MUM-003-8821','ACC-MUM-003-1029');

EXIT;
