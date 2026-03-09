-- ============================================================
-- Suraksha Bank — Add 2 New Customers (Customer 3 & 4)
-- Run this in SQL*Plus or Oracle SQL Developer
-- Password for all new accounts: password (SHA256 hash)
-- SHA256("password") = ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
-- ============================================================

-- USER 3: Sunita Rao
INSERT INTO USERS (username, password_hash, user_type)
VALUES ('sunita.rao',
        'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
        'CUSTOMER');

-- USER 4: Vikram Mehta
INSERT INTO USERS (username, password_hash, user_type)
VALUES ('vikram.mehta',
        'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
        'CUSTOMER');

COMMIT;

-- CUSTOMER 3: Sunita Rao
INSERT INTO CUSTOMERS (customer_id, full_name, date_of_birth, pan_number, email, phone, kyc_status, user_id)
SELECT 'CUST-003', 'Sunita Rao', DATE '1990-11-03', 'GHPSR7890C',
       'sunita.rao@email.com', '9876543212', 'VERIFIED', user_id
FROM USERS WHERE username = 'sunita.rao';

-- CUSTOMER 4: Vikram Mehta
INSERT INTO CUSTOMERS (customer_id, full_name, date_of_birth, pan_number, email, phone, kyc_status, user_id)
SELECT 'CUST-004', 'Vikram Mehta', DATE '1985-06-21', 'JKLVM4321D',
       'vikram.mehta@email.com', '9876543213', 'VERIFIED', user_id
FROM USERS WHERE username = 'vikram.mehta';

COMMIT;

-- ACCOUNT for Sunita Rao — Basic Savings
INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id,
                      home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
VALUES ('ACC-MUM-003-2233', '004000030000004', 'CUST-003', 3, 'BRN-MUM-003',
        75000.00, 'ACTIVE', DATE '2023-03-15', 500.00, 'Mr. Suresh Rao');

-- ACCOUNT for Vikram Mehta — Savings Premium
INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id,
                      home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
VALUES ('ACC-MUM-003-5577', '004000040000005', 'CUST-004', 1, 'BRN-MUM-003',
        540000.00, 'ACTIVE', DATE '2022-09-01', 25000.00, 'Mrs. Kamla Mehta');

COMMIT;

-- Sample transactions for new accounts
INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-2233', 'CREDIT', 75000.00, 75000.00, 'SYSTEM', 'Account Opening Deposit');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-2233', 'DEBIT', 5000.00, 70000.00, 'EMP-MUM-TELLER-01', 'Utility Bill Payment');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-2233', 'INTEREST_CREDIT', 875.00, 70875.00, 'SYSTEM', 'Quarterly Interest Credit');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-5577', 'CREDIT', 540000.00, 540000.00, 'SYSTEM', 'Account Opening Deposit');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-5577', 'CREDIT', 200000.00, 740000.00, 'SYSTEM', 'Salary Credit - InfraWorks Ltd');

INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
VALUES ('ACC-MUM-003-5577', 'DEBIT', 200000.00, 540000.00, 'SYSTEM', 'Mutual Fund SIP Transfer');

COMMIT;

PROMPT ============================================================
PROMPT New Customers Added Successfully!
PROMPT ============================================================
PROMPT   USERNAME        PASSWORD    CUSTOMER    ACCOUNT
PROMPT   ravi.verma      password    CUST-001    ACC-MUM-003-8821
PROMPT   amit.kumar      password    CUST-002    ACC-MUM-003-0421
PROMPT   sunita.rao      password    CUST-003    ACC-MUM-003-2233
PROMPT   vikram.mehta    password    CUST-004    ACC-MUM-003-5577
PROMPT   priya.desai     password    TELLER      EMP-MUM-TELLER-01
PROMPT   rk.sharma       password    MANAGER     EMP-MUM-MGR-01
PROMPT ============================================================

EXIT;
