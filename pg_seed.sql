-- SafeVault PostgreSQL Seed Data
-- Converted from Oracle 21c

-- 1. SYSTEM_CONFIG
INSERT INTO SYSTEM_CONFIG (config_key, config_value, description) VALUES
('HIGH_VALUE_THRESHOLD', '100000', 'Threshold for mandatory manager approval on transfers'),
('VELOCITY_DAILY_LIMIT', '500000', 'Maximum daily debit limit per account'),
('MAX_OTP_ATTEMPTS', '3', 'Max failed OTP attempts before locking'),
('MAINTENANCE_MODE', '0', 'Set to 1 to block non-admin access');

-- 2. BRANCHES
INSERT INTO BRANCHES (branch_id, branch_name, ifsc_code, city, state, is_active) VALUES
('MUM-001', 'Mumbai Main Branch', 'SRKB0000001', 'Mumbai', 'Maharashtra', '1'),
('DEL-002', 'Delhi North Branch', 'SRKB0000002', 'Delhi', 'Delhi', '1'),
('BLR-003', 'Bangalore Tech Park', 'SRKB0000003', 'Bangalore', 'Karnataka', '1');

-- 3. USERS (Initial Admins/Employees)
-- Passwords are hashed versions of 'password123' (simplified for demo)
INSERT INTO USERS (username, password_hash, user_type) VALUES
('admin', '$2b$10$EPfLp7Z8eG.H6.v.C9qGueuXyL8M.vW7B8y6Y0v8vV7bW.vV.', 'EMPLOYEE');

-- 4. EMPLOYEES
-- Map admin to the Mumbai branch
INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, user_id)
SELECT 'EMP-001', 'MUM-001', 'System Administrator', 'SYSTEM_ADMIN', CURRENT_DATE, user_id FROM USERS WHERE username = 'admin';

-- 5. ACCOUNT_TYPES
INSERT INTO ACCOUNT_TYPES (type_name, interest_rate, min_balance, max_withdrawal) VALUES
('Savings', 0.0400, 500.00, 50000.00),
('Current', 0.0000, 5000.00, 1000000.00),
('Salary', 0.0450, 0.00, 100000.00);

-- 6. Sample Customers (Requires corresponding Users)
INSERT INTO USERS (username, password_hash, user_type) VALUES
('rahul.sharma', '$2b$10$EPfLp7Z8eG.H6.v.C9qGueuXyL8M.vW7B8y6Y0v8vV7bW.vV.', 'CUSTOMER'),
('priya.nair', '$2b$10$EPfLp7Z8eG.H6.v.C9qGueuXyL8M.vW7B8y6Y0v8vV7bW.vV.', 'CUSTOMER');

INSERT INTO CUSTOMERS (customer_id, full_name, date_of_birth, pan_number, email, phone, kyc_status, user_id)
SELECT 'CUST-101', 'Rahul Sharma', '1990-05-15', 'ABCDE1234F', 'rahul@example.com', '9876543210', 'VERIFIED', user_id FROM USERS WHERE username = 'rahul.sharma';

INSERT INTO CUSTOMERS (customer_id, full_name, date_of_birth, pan_number, email, phone, kyc_status, user_id)
SELECT 'CUST-102', 'Priya Nair', '1992-11-20', 'FGHIJ5678K', 'priya@example.com', '9876543211', 'VERIFIED', user_id FROM USERS WHERE username = 'priya.nair';

-- 7. Sample Accounts
INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date) VALUES
('ACC-101-01', '1010101010', 'CUST-101', 1, 'MUM-001', 10000.00, 'ACTIVE', CURRENT_DATE),
('ACC-102-01', '1020202020', 'CUST-102', 1, 'BLR-003', 25000.00, 'ACTIVE', CURRENT_DATE);

-- 8. Sample Transactions
INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description) VALUES
('ACC-101-01', 'CREDIT', 10000.00, 10000.00, 'SYSTEM', 'Initial Account Opening Deposit'),
('ACC-102-01', 'CREDIT', 25000.00, 25000.00, 'SYSTEM', 'Initial Account Opening Deposit');

-- 9. Sample Employees for other roles
INSERT INTO USERS (username, password_hash, user_type) VALUES
('manager.mumbai', '$2b$10$EPfLp7Z8eG.H6.v.C9qGueuXyL8M.vW7B8y6Y0v8vV7bW.vV.', 'EMPLOYEE'),
('teller.mumbai', '$2b$10$EPfLp7Z8eG.H6.v.C9qGueuXyL8M.vW7B8y6Y0v8vV7bW.vV.', 'EMPLOYEE');

INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, user_id)
SELECT 'EMP-002', 'MUM-001', 'Rajesh Kumar', 'BRANCH_MANAGER', CURRENT_DATE, user_id FROM USERS WHERE username = 'manager.mumbai';

INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, user_id)
SELECT 'EMP-003', 'MUM-001', 'Suresh Patel', 'TELLER', CURRENT_DATE, user_id FROM USERS WHERE username = 'teller.mumbai';

-- Update Branch Manager
UPDATE BRANCHES SET manager_emp_id = 'EMP-002' WHERE branch_id = 'MUM-001';
