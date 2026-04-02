-- Final complete DB seed with dynamic type_id resolution

-- Insert missing account types
INSERT INTO ACCOUNT_TYPES (type_name, interest_rate, min_balance, max_withdrawal)
VALUES ('Savings Premium', 0.045, 25000.00, 2000000.00);

INSERT INTO ACCOUNT_TYPES (type_name, interest_rate, min_balance, max_withdrawal)
VALUES ('Business Current', 0.000, 50000.00, 5000000.00);
COMMIT;

-- Show account types
SELECT type_id, type_name FROM ACCOUNT_TYPES ORDER BY type_id;

-- Insert Ravi's Premium Savings account (update if duplicate)
DECLARE
    v_type_id NUMBER;
    v_exists  NUMBER;
BEGIN
    SELECT type_id INTO v_type_id FROM ACCOUNT_TYPES WHERE type_name='Savings Premium' AND ROWNUM=1;
    SELECT COUNT(*) INTO v_exists FROM ACCOUNTS WHERE account_id='ACC-MUM-003-8821';
    IF v_exists = 0 THEN
        INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
        VALUES ('ACC-MUM-003-8821', '004000010000001', 'CUST-001', v_type_id, 'BRN-MUM-003', 1020000.00, 'ACTIVE', DATE '2020-03-01', 25000.00, 'Mrs. Anjali Verma');
    ELSE
        UPDATE ACCOUNTS SET account_type_id=v_type_id, balance=1020000.00 WHERE account_id='ACC-MUM-003-8821';
    END IF;
END;
/

-- Insert Ravi's Business Current account
DECLARE
    v_type_id NUMBER;
BEGIN
    SELECT type_id INTO v_type_id FROM ACCOUNT_TYPES WHERE type_name='Business Current' AND ROWNUM=1;
    INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance)
    VALUES ('ACC-MUM-003-1029', '004000020000002', 'CUST-001', v_type_id, 'BRN-MUM-003', 225000.00, 'ACTIVE', DATE '2021-06-15', 50000.00);
EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
    UPDATE ACCOUNTS SET account_type_id=v_type_id, balance=225000.00 WHERE account_id='ACC-MUM-003-1029';
END;
/
COMMIT;

-- Verify final state
SELECT account_id, balance, status, account_type_id FROM ACCOUNTS ORDER BY account_id;
COMMIT;
EXIT;
