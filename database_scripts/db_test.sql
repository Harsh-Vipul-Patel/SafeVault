-- Integration test: verify SPs now actually change balances
-- Before state
SELECT 'BEFORE' AS state, account_id, balance FROM ACCOUNTS WHERE account_id IN ('ACC-MUM-003-8821','ACC-MUM-003-1029');

-- Run deposit on Savings account
BEGIN
    sp_deposit('ACC-MUM-003-8821', 1000, 'EMP-MUM-TELLER-01');
END;
/

-- Run internal transfer: Savings -> Current
BEGIN
    sp_internal_transfer('ACC-MUM-003-8821', 'ACC-MUM-003-1029', 500, 'CUST-001');
END;
/

-- After state
SELECT 'AFTER' AS state, account_id, balance FROM ACCOUNTS WHERE account_id IN ('ACC-MUM-003-8821','ACC-MUM-003-1029');

-- Show last 5 transactions
SELECT transaction_id, account_id, transaction_type, amount, balance_after FROM TRANSACTIONS ORDER BY transaction_id DESC FETCH FIRST 5 ROWS ONLY;

EXIT;
