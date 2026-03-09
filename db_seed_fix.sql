-- Suraksha Bank FIX: Re-seed Accounts and Transactions
-- Run this after db_seed.sql

PROMPT Fixing account types (removing inline comment that broke SQL parsing)...

-- Add missing 3rd account type (row with inline comment failed before)
INSERT INTO ACCOUNT_TYPES (type_name, interest_rate, min_balance, max_withdrawal)
VALUES ('Basic Savings', 0.035, 500.00, 500000.00);
COMMIT;
PROMPT Account type 3 added.

PROMPT Inserting accounts now that all 3 types exist...
INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
VALUES ('ACC-MUM-003-8821', '004000010000001', 'CUST-001', 1, 'BRN-MUM-003', 1020000.00, 'ACTIVE', DATE '2020-03-01', 25000.00, 'Mrs. Anjali Verma');

INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
VALUES ('ACC-MUM-003-1029', '004000020000002', 'CUST-001', 2, 'BRN-MUM-003', 225000.00, 'ACTIVE', DATE '2021-06-15', 50000.00, NULL);

INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
VALUES ('ACC-MUM-003-0421', '004000010000003', 'CUST-002', 1, 'BRN-MUM-003', 124500.00, 'ACTIVE', DATE '2022-01-10', 25000.00, 'Mr. Suresh Kumar');
COMMIT;
PROMPT Accounts inserted successfully.

PROMPT Disabling velocity trigger temporarily for seed data...
ALTER TRIGGER TRG_TRANSACTION_VELOCITY DISABLE;

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-0421', 'TRANSFER_CREDIT', 5000.00, 124500.00, 'SYSTEM', 'NEFT Received from HDFC');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-0421', 'DEBIT', 2000.00, 119500.00, 'EMP-MUM-TELLER-01', 'ATM Withdrawal');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-0421', 'INTEREST_CREDIT', 312.00, 119812.00, 'SYSTEM', 'Monthly Interest Credit');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-8821', 'CREDIT', 150000.00, 1020000.00, 'SYSTEM', 'Salary Credit - TechCorp');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-8821', 'DEBIT', 15000.00, 1005000.00, 'SYSTEM', 'SIP Investment');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-1029', 'CREDIT', 225000.00, 225000.00, 'EMP-MUM-TELLER-01', 'Account Opening Deposit');
COMMIT;

ALTER TRIGGER TRG_TRANSACTION_VELOCITY ENABLE;
PROMPT Transactions inserted. Trigger re-enabled.

PROMPT =============================================
PROMPT Fix seed complete. Test with:
PROMPT   sp_deposit('ACC-MUM-003-0421', 500, 'EMP-MUM-TELLER-01')
PROMPT   sp_internal_transfer('ACC-MUM-003-8821','ACC-MUM-003-1029', 1000, 'WEB_USER')
PROMPT =============================================
EXIT;
