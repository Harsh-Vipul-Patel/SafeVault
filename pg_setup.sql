-- SafeVault PostgreSQL Setup Script (Neon / PostgreSQL)
-- Converted from Oracle 21c schema

-- Drop existing tables (in reverse dependency order)
DROP TABLE IF EXISTS LOAN_PAYMENTS CASCADE;
DROP TABLE IF EXISTS EMI_SCHEDULE CASCADE;
DROP TABLE IF EXISTS LOAN_ACCOUNTS CASCADE;
DROP TABLE IF EXISTS LOAN_APPLICATIONS CASCADE;
DROP TABLE IF EXISTS AUDIT_LOG CASCADE;
DROP TABLE IF EXISTS PROCEDURE_EXECUTION_LOG CASCADE;
DROP TABLE IF EXISTS PENDING_EXTERNAL_TRANSFERS CASCADE;
DROP TABLE IF EXISTS SYSTEM_CONFIG CASCADE;
DROP TABLE IF EXISTS INTEREST_ACCRUAL_LOG CASCADE;
DROP TABLE IF EXISTS ACCRUAL_BATCH_CONTROL CASCADE;
DROP TABLE IF EXISTS COMPLIANCE_FLAGS CASCADE;
DROP TABLE IF EXISTS DUAL_APPROVAL_QUEUE CASCADE;
DROP TABLE IF EXISTS TRANSFER_LOG CASCADE;
DROP TABLE IF EXISTS NOTIFICATION_LOG CASCADE;
DROP TABLE IF EXISTS OTPS CASCADE;
DROP TABLE IF EXISTS TRANSACTIONS CASCADE;
DROP TABLE IF EXISTS ACCOUNTS CASCADE;
DROP TABLE IF EXISTS ACCOUNT_TYPES CASCADE;
DROP TABLE IF EXISTS CUSTOMERS CASCADE;
DROP TABLE IF EXISTS EMPLOYEES CASCADE;
DROP TABLE IF EXISTS BRANCHES CASCADE;
DROP TABLE IF EXISTS USERS CASCADE;

-- Enable UUID extension if needed (not strictly required for gen_random_uuid in PG 13+)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS (Authentication Table)
CREATE TABLE USERS (
    user_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Increased size for safe hashing
    last_login TIMESTAMPTZ,
    failed_attempts SMALLINT DEFAULT 0,
    is_locked CHAR(1) DEFAULT '0',
    session_token VARCHAR(100),
    user_type VARCHAR(20) CHECK (user_type IN ('CUSTOMER','EMPLOYEE'))
);

-- 2. BRANCHES
CREATE TABLE BRANCHES (
    branch_id VARCHAR(20) PRIMARY KEY,
    branch_name VARCHAR(100) NOT NULL,
    ifsc_code VARCHAR(11) UNIQUE NOT NULL,
    address TEXT,
    city VARCHAR(50),
    state VARCHAR(50),
    manager_emp_id VARCHAR(20), -- FK Added later
    is_active CHAR(1) DEFAULT '1'
);

-- 3. EMPLOYEES
CREATE TABLE EMPLOYEES (
    employee_id VARCHAR(20) PRIMARY KEY,
    branch_id VARCHAR(20) REFERENCES BRANCHES(branch_id),
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('TELLER','BRANCH_MANAGER','SYSTEM_ADMIN','LOAN_MANAGER')),
    hire_date DATE NOT NULL,
    is_active CHAR(1) DEFAULT '1',
    user_id UUID REFERENCES USERS(user_id)
);

-- Add manager FK to BRANCHES
ALTER TABLE BRANCHES ADD CONSTRAINT fk_branch_manager FOREIGN KEY (manager_emp_id) REFERENCES EMPLOYEES(employee_id);

-- 4. CUSTOMERS
CREATE TABLE CUSTOMERS (
    customer_id VARCHAR(20) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    pan_number VARCHAR(10) UNIQUE NOT NULL,
    aadhaar_hash VARCHAR(64) UNIQUE,
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(15) UNIQUE NOT NULL,
    address TEXT,
    kyc_status VARCHAR(20) CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    user_id UUID REFERENCES USERS(user_id)
);

-- 5. ACCOUNT_TYPES
CREATE TABLE ACCOUNT_TYPES (
    type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) NOT NULL,
    interest_rate NUMERIC(5,4),
    min_balance NUMERIC(15,2) NOT NULL,
    max_withdrawal NUMERIC(15,2)
);

-- 6. ACCOUNTS
CREATE TABLE ACCOUNTS (
    account_id VARCHAR(20) PRIMARY KEY,
    account_number VARCHAR(18) UNIQUE NOT NULL,
    customer_id VARCHAR(20) REFERENCES CUSTOMERS(customer_id),
    account_type_id INTEGER REFERENCES ACCOUNT_TYPES(type_id),
    home_branch_id VARCHAR(20) REFERENCES BRANCHES(branch_id),
    balance NUMERIC(15,2) NOT NULL CHECK (balance >= 0),
    status VARCHAR(10) CHECK (status IN ('ACTIVE','DORMANT','FROZEN','CLOSED')),
    opened_date DATE NOT NULL,
    closed_date DATE,
    minimum_balance NUMERIC(15,2) DEFAULT 500.00 NOT NULL,
    nominee_name VARCHAR(100)
);

-- 7. TRANSACTIONS
CREATE TABLE TRANSACTIONS (
    transaction_id SERIAL PRIMARY KEY,
    transaction_ref VARCHAR(30) UNIQUE,
    account_id VARCHAR(20) REFERENCES ACCOUNTS(account_id),
    transaction_type VARCHAR(30) NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(15,2) NOT NULL,
    transaction_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    description VARCHAR(200),
    initiated_by VARCHAR(50) NOT NULL,
    branch_id VARCHAR(20) REFERENCES BRANCHES(branch_id),
    linked_transfer_id UUID,
    status VARCHAR(20) DEFAULT 'COMPLETED',
    CONSTRAINT chk_txn_type CHECK (transaction_type IN ('CREDIT', 'DEBIT', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'INTEREST_CREDIT', 'FEE_DEBIT', 'EXTERNAL_DEBIT', 'EXTERNAL_CREDIT'))
);

-- 8. TRANSFER_LOG
CREATE TABLE TRANSFER_LOG (
    transfer_log_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    debit_txn_id INTEGER REFERENCES TRANSACTIONS(transaction_id),
    credit_txn_id INTEGER REFERENCES TRANSACTIONS(transaction_id),
    transferred_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. DUAL_APPROVAL_QUEUE
CREATE TABLE DUAL_APPROVAL_QUEUE (
    queue_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requested_by UUID REFERENCES USERS(user_id),
    operation_type VARCHAR(30),
    payload_json TEXT NOT NULL,
    status VARCHAR(20) CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(20) REFERENCES EMPLOYEES(employee_id),
    reviewed_at TIMESTAMPTZ,
    review_note TEXT
);

-- 10. COMPLIANCE_FLAGS
CREATE TABLE COMPLIANCE_FLAGS (
    flag_id SERIAL PRIMARY KEY,
    account_id VARCHAR(20) REFERENCES ACCOUNTS(account_id),
    transaction_id INTEGER REFERENCES TRANSACTIONS(transaction_id),
    flag_type VARCHAR(50),
    threshold_value NUMERIC(15,2) NOT NULL,
    flagged_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(50)
);

-- 11. ACCRUAL_BATCH_CONTROL
CREATE TABLE ACCRUAL_BATCH_CONTROL (
    run_id SERIAL PRIMARY KEY,
    bucket_id SMALLINT NOT NULL CHECK (bucket_id BETWEEN 0 AND 9),
    accrual_date DATE NOT NULL,
    status VARCHAR(15) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    accounts_processed INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    CONSTRAINT uq_bucket_date UNIQUE (bucket_id, accrual_date)
);

-- 12. INTEREST_ACCRUAL_LOG
CREATE TABLE INTEREST_ACCRUAL_LOG (
    accrual_id SERIAL PRIMARY KEY,
    account_id VARCHAR(20) REFERENCES ACCOUNTS(account_id),
    batch_run_id INTEGER REFERENCES ACCRUAL_BATCH_CONTROL(run_id),
    accrual_date DATE NOT NULL,
    principal_amount NUMERIC(15,2) NOT NULL,
    rate_applied NUMERIC(5,4) NOT NULL,
    interest_amount NUMERIC(15,2) NOT NULL,
    posted_txn_id INTEGER REFERENCES TRANSACTIONS(transaction_id)
);

-- 13. SYSTEM_CONFIG
CREATE TABLE SYSTEM_CONFIG (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value VARCHAR(200) NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES USERS(user_id)
);

-- 14. PENDING_EXTERNAL_TRANSFERS
CREATE TABLE PENDING_EXTERNAL_TRANSFERS (
    transfer_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_account_id VARCHAR(20) NOT NULL REFERENCES ACCOUNTS(account_id),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    destination_ifsc VARCHAR(11) NOT NULL CHECK (destination_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
    destination_account VARCHAR(20) NOT NULL,
    destination_name VARCHAR(100),
    purpose VARCHAR(200),
    status VARCHAR(15) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SETTLED', 'REJECTED', 'CANCELLED')),
    transfer_mode VARCHAR(10) NOT NULL CHECK (transfer_mode IN ('RTGS', 'NEFT', 'IMPS')),
    initiated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    initiated_by VARCHAR(50) NOT NULL,
    settled_at TIMESTAMPTZ,
    settlement_reference VARCHAR(30),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT
);

-- 15. PROCEDURE_EXECUTION_LOG
CREATE TABLE PROCEDURE_EXECUTION_LOG (
    log_id SERIAL PRIMARY KEY,
    proc_name VARCHAR(100) NOT NULL,
    called_by VARCHAR(50) NOT NULL,
    called_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    execution_ms INTEGER,
    parameters_hash VARCHAR(64),
    success_flag CHAR(1) NOT NULL,
    error_message TEXT
);

-- 16. AUDIT_LOG
CREATE TABLE AUDIT_LOG (
    audit_id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id VARCHAR(50) NOT NULL,
    operation VARCHAR(30) NOT NULL,
    changed_by VARCHAR(50) NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    old_value_json TEXT, -- In PG we could use JSONB, but kept as TEXT for now to match Oracle setup
    new_value_json TEXT,
    change_reason TEXT,
    violation_flag CHAR(1) DEFAULT '0',
    ip_address VARCHAR(45),
    session_id UUID -- Changed from RAW(16) to UUID
);

-- 17. LOAN_APPLICATIONS
CREATE TABLE LOAN_APPLICATIONS (
    loan_app_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id VARCHAR(20) REFERENCES CUSTOMERS(customer_id),
    branch_id VARCHAR(20) REFERENCES BRANCHES(branch_id),
    loan_type VARCHAR(20) CHECK (loan_type IN ('PERSONAL','HOME','VEHICLE','EDUCATION')),
    requested_amount NUMERIC(15,2) CHECK (requested_amount > 0),
    tenure_months NUMBER(3) CHECK (tenure_months BETWEEN 1 AND 360),
    annual_rate NUMERIC(5,4),
    status VARCHAR(20) CHECK (status IN ('RECEIVED','UNDER_REVIEW','APPROVED','DISBURSED','ACTIVE','CLOSED','DEFAULTED')),
    linked_account_id VARCHAR(20) REFERENCES ACCOUNTS(account_id),
    reviewed_by VARCHAR(20) REFERENCES EMPLOYEES(employee_id),
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 18. LOAN_ACCOUNTS
CREATE TABLE LOAN_ACCOUNTS (
    loan_account_id VARCHAR(20) PRIMARY KEY,
    loan_app_id UUID REFERENCES LOAN_APPLICATIONS(loan_app_id),
    disbursed_amount NUMERIC(15,2) CHECK (disbursed_amount > 0),
    outstanding_principal NUMERIC(15,2) CHECK (outstanding_principal >= 0),
    disbursed_at TIMESTAMPTZ,
    disbursement_txn_id INTEGER REFERENCES TRANSACTIONS(transaction_id),
    status VARCHAR(15) CHECK (status IN ('ACTIVE','CLOSED','DEFAULTED'))
);

-- 19. EMI_SCHEDULE
CREATE TABLE EMI_SCHEDULE (
    emi_id SERIAL PRIMARY KEY,
    loan_account_id VARCHAR(20) REFERENCES LOAN_ACCOUNTS(loan_account_id),
    emi_number INTEGER,
    due_date DATE NOT NULL,
    emi_amount NUMERIC(12,2) CHECK (emi_amount > 0),
    principal_component NUMERIC(12,2),
    interest_component NUMERIC(12,2),
    closing_balance NUMERIC(15,2) CHECK (closing_balance >= 0),
    status VARCHAR(10) CHECK (status IN ('PENDING','PAID','OVERDUE')),
    paid_at TIMESTAMPTZ,
    penalty_amount NUMERIC(10,2) DEFAULT 0
);

-- 20. LOAN_PAYMENTS
CREATE TABLE LOAN_PAYMENTS (
    payment_id SERIAL PRIMARY KEY,
    loan_account_id VARCHAR(20) REFERENCES LOAN_ACCOUNTS(loan_account_id),
    emi_id INTEGER REFERENCES EMI_SCHEDULE(emi_id),
    payment_txn_id INTEGER REFERENCES TRANSACTIONS(transaction_id),
    amount_paid NUMERIC(12,2) CHECK (amount_paid > 0),
    penalty_paid NUMERIC(10,2) DEFAULT 0,
    payment_ref VARCHAR(30),
    paid_by_emp_id VARCHAR(20) REFERENCES EMPLOYEES(employee_id),
    paid_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 21. OTPS
CREATE TABLE OTPS (
    otp_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES USERS(user_id),
    transaction_id VARCHAR(50),
    otp_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(50),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING'
);

-- 22. NOTIFICATION_LOG
CREATE TABLE NOTIFICATION_LOG (
    notification_id SERIAL PRIMARY KEY,
    customer_id VARCHAR(20) REFERENCES CUSTOMERS(customer_id),
    user_id UUID REFERENCES USERS(user_id),
    trigger_event VARCHAR(50),
    channel VARCHAR(20),
    message_clob TEXT,
    sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Audit log prevention trigger logic is different in PG (usually requires a function + trigger)
CREATE OR REPLACE FUNCTION fn_prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_audit_modification
BEFORE UPDATE OR DELETE ON AUDIT_LOG
FOR EACH STATEMENT
EXECUTE FUNCTION fn_prevent_audit_modification();
