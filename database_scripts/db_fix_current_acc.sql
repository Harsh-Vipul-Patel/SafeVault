-- Check actual IDs in ACCOUNT_TYPES and fix the missing account
SELECT type_id, type_name FROM ACCOUNT_TYPES ORDER BY type_id;

-- Insert missing account using a subquery to get correct type_id
INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
SELECT 'ACC-MUM-003-1029', '004000020000002', 'CUST-001', type_id, 'BRN-MUM-003', 225000.00, 'ACTIVE', DATE '2021-06-15', 50000.00, NULL
FROM ACCOUNT_TYPES WHERE type_name = 'Business Current';

-- Verify accounts exist now
SELECT account_id, balance, status FROM ACCOUNTS;

COMMIT;
EXIT;
