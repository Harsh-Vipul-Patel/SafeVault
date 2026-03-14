-- Suraksha Bank Seed Data
-- Run after db_setup.sql to populate test data

PROMPT Inserting Seed Data...

-- 1. USERS (password_hash is a placeholder SHA256 of 'password')
INSERT INTO USERS (username, password_hash, user_type) VALUES ('ravi.verma', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'CUSTOMER');
INSERT INTO USERS (username, password_hash, user_type) VALUES ('priya.desai', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'EMPLOYEE');
INSERT INTO USERS (username, password_hash, user_type) VALUES ('rk.sharma', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'EMPLOYEE');
INSERT INTO USERS (username, password_hash, user_type) VALUES ('sys.root', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'EMPLOYEE');
INSERT INTO USERS (username, password_hash, user_type) VALUES ('a.krishnan', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'EMPLOYEE');
INSERT INTO USERS (username, password_hash, user_type) VALUES ('amit.kumar', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'CUSTOMER');
COMMIT;

PROMPT Users inserted.

-- 2. BRANCHES
INSERT INTO BRANCHES (branch_id, branch_name, ifsc_code, city, state, is_active)
VALUES ('BRN-MUM-003', 'Mumbai Central Branch', 'SURK0000003', 'Mumbai', 'Maharashtra', '1');

INSERT INTO BRANCHES (branch_id, branch_name, ifsc_code, city, state, is_active)
VALUES ('BRN-DEL-001', 'Delhi Connaught Branch', 'SURK0000001', 'New Delhi', 'Delhi', '1');
COMMIT;

PROMPT Branches inserted.

-- 3. EMPLOYEES (Teller, Manager, Admin)
INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, is_active, user_id)
SELECT 'EMP-MUM-TELLER-01', 'BRN-MUM-003', 'Priya Desai', 'TELLER', DATE '2022-06-01', '1', user_id
FROM USERS WHERE username = 'priya.desai';

INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, is_active, user_id)
SELECT 'EMP-MUM-MGR-01', 'BRN-MUM-003', 'R.K. Sharma', 'BRANCH_MANAGER', DATE '2018-01-15', '1', user_id
FROM USERS WHERE username = 'rk.sharma';

INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, is_active, user_id)
SELECT 'EMP-SYS-ADMIN-01', 'BRN-MUM-003', 'System Root', 'SYSTEM_ADMIN', DATE '2020-01-01', '1', user_id
FROM USERS WHERE username = 'sys.root';

INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, is_active, user_id)
SELECT 'EMP-MUM-LOAN-01', 'BRN-MUM-003', 'A. Krishnan', 'LOAN_MANAGER', DATE '2021-03-10', '1', user_id
FROM USERS WHERE username = 'a.krishnan';

-- Update branch managers
UPDATE BRANCHES SET manager_emp_id = 'EMP-MUM-MGR-01' WHERE branch_id = 'BRN-MUM-003';
COMMIT;

PROMPT Employees inserted.

-- 4. ACCOUNT_TYPES
INSERT INTO ACCOUNT_TYPES (type_name, interest_rate, min_balance, max_withdrawal)
VALUES ('Savings Premium', 0.045, 25000.00, 2000000.00);

INSERT INTO ACCOUNT_TYPES (type_name, interest_rate, min_balance, max_withdrawal)
VALUES ('Business Current', 0.000, 50000.00, 5000000.00);

INSERT INTO ACCOUNT_TYPES (type_name, interest_rate, min_balance, max_withdrawal)
VALUES ('Basic Savings', 0.035, 500.00, 500000.00);
COMMIT;

PROMPT Account types inserted.

-- 5. CUSTOMERS
INSERT INTO CUSTOMERS (customer_id, full_name, date_of_birth, pan_number, email, phone, kyc_status, user_id)
SELECT 'CUST-001', 'Ravi Verma', DATE '1988-04-15', 'ABCPV1234A', 'kingharsh271@gmail.com', '9876543210', 'VERIFIED', user_id
FROM USERS WHERE username = 'ravi.verma';

INSERT INTO CUSTOMERS (customer_id, full_name, date_of_birth, pan_number, email, phone, kyc_status, user_id)
SELECT 'CUST-002', 'Amit Kumar', DATE '1992-08-20', 'DEFAK5678B', 'amit.kumar@email.com', '9876543211', 'VERIFIED', user_id
FROM USERS WHERE username = 'amit.kumar';
COMMIT;

PROMPT Customers inserted.

-- 6. ACCOUNTS (Link to customers)
INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
VALUES ('ACC-MUM-003-8821', '004000010000001', 'CUST-001', 1, 'BRN-MUM-003', 1020000.00, 'ACTIVE', DATE '2020-03-01', 25000.00, 'Mrs. Anjali Verma');

INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
VALUES ('ACC-MUM-003-1029', '004000020000002', 'CUST-001', 2, 'BRN-MUM-003', 225000.00, 'ACTIVE', DATE '2021-06-15', 50000.00, NULL);

INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date, minimum_balance, nominee_name)
VALUES ('ACC-MUM-003-0421', '004000010000003', 'CUST-002', 1, 'BRN-MUM-003', 124500.00, 'ACTIVE', DATE '2022-01-10', 25000.00, 'Mr. Suresh Kumar');
COMMIT;

PROMPT Accounts inserted.

-- 7. SYSTEM_CONFIG (Velocity limit & other configs)
INSERT INTO SYSTEM_CONFIG (config_key, config_value, description)
VALUES ('VELOCITY_DAILY_LIMIT', '500000', 'Maximum daily debit per account before compliance flag triggers');

INSERT INTO SYSTEM_CONFIG (config_key, config_value, description)
VALUES ('HIGH_VALUE_THRESHOLD', '200000', 'Transfer amount above which dual approval is required');

INSERT INTO SYSTEM_CONFIG (config_key, config_value, description)
VALUES ('NEFT_CUT_OFF_TIME', '16:30', 'Latest time for same-day NEFT processing');
COMMIT;

PROMPT System config inserted.

-- 8. Sample recent TRANSACTIONS for dashboard
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
COMMIT;

PROMPT Sample transactions inserted.
PROMPT =============================================
PROMPT Seed Data Complete! Accounts available:
PROMPT   ACC-MUM-003-8821 : Ravi Verma - Savings  (1,02,0000)
PROMPT   ACC-MUM-003-1029 : Ravi Verma - Current  (2,25,000)
PROMPT   ACC-MUM-003-0421 : Amit Kumar - Savings  (1,24,500)
PROMPT =============================================
COMMIT;