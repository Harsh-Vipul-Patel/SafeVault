-- Suraksha Bank Safe Vault System
-- Database Setup Script (Oracle 21c)
-- Run this as a user with DBA privileges (e.g., SYSTEM or SYS)

-- Drop existing tables (in reverse dependency order)
BEGIN
  FOR t IN (SELECT table_name FROM user_tables WHERE table_name IN (
    'LOAN_PAYMENTS', 'EMI_SCHEDULE', 'LOAN_ACCOUNTS', 'LOAN_APPLICATIONS',
    'AUDIT_LOG', 'PROCEDURE_EXECUTION_LOG', 'PENDING_EXTERNAL_TRANSFERS',
    'SYSTEM_CONFIG', 'INTEREST_ACCRUAL_LOG', 'ACCRUAL_BATCH_CONTROL',
    'COMPLIANCE_FLAGS', 'DUAL_APPROVAL_QUEUE', 'TRANSFER_LOG',
    'TRANSACTIONS', 'ACCOUNTS', 'ACCOUNT_TYPES', 'CUSTOMERS',
    'EMPLOYEES', 'BRANCHES', 'USERS'
  )) LOOP
    EXECUTE IMMEDIATE 'DROP TABLE ' || t.table_name || ' CASCADE CONSTRAINTS';
  END LOOP;
END;
/

-- 1. USERS (Authentication Table)
CREATE TABLE USERS (
    user_id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    username VARCHAR2(50) UNIQUE NOT NULL,
    password_hash VARCHAR2(64) NOT NULL,
    last_login TIMESTAMP WITH TIME ZONE,
    failed_attempts SMALLINT DEFAULT 0,
    is_locked CHAR(1) DEFAULT '0',
    session_token VARCHAR2(100),
    user_type VARCHAR2(20) CHECK (user_type IN ('CUSTOMER','EMPLOYEE'))
);

-- 2. BRANCHES
CREATE TABLE BRANCHES (
    branch_id VARCHAR2(20) PRIMARY KEY,
    branch_name VARCHAR2(100) NOT NULL,
    ifsc_code VARCHAR2(11) UNIQUE NOT NULL,
    address CLOB,
    city VARCHAR2(50),
    state VARCHAR2(50),
    manager_emp_id VARCHAR2(20), -- FK Added later
    is_active CHAR(1) DEFAULT '1'
);

-- 3. EMPLOYEES
CREATE TABLE EMPLOYEES (
    employee_id VARCHAR2(20) PRIMARY KEY,
    branch_id VARCHAR2(20) REFERENCES BRANCHES(branch_id),
    full_name VARCHAR2(100) NOT NULL,
    role VARCHAR2(20) NOT NULL CHECK (role IN ('TELLER','BRANCH_MANAGER','SYSTEM_ADMIN','LOAN_MANAGER')),
    hire_date DATE NOT NULL,
    is_active CHAR(1) DEFAULT '1',
    user_id RAW(16) REFERENCES USERS(user_id)
);

-- Add manager FK to BRANCHES
ALTER TABLE BRANCHES ADD CONSTRAINT fk_branch_manager FOREIGN KEY (manager_emp_id) REFERENCES EMPLOYEES(employee_id);

-- 4. CUSTOMERS
CREATE TABLE CUSTOMERS (
    customer_id VARCHAR2(20) PRIMARY KEY,
    full_name VARCHAR2(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    pan_number VARCHAR2(10) UNIQUE NOT NULL,
    aadhaar_hash VARCHAR2(64) UNIQUE,
    email VARCHAR2(100) UNIQUE,
    phone VARCHAR2(15) UNIQUE NOT NULL,
    address CLOB,
    kyc_status VARCHAR2(20) CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    user_id RAW(16) REFERENCES USERS(user_id)
);

-- 5. ACCOUNT_TYPES
CREATE TABLE ACCOUNT_TYPES (
    type_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type_name VARCHAR2(50) NOT NULL,
    interest_rate NUMBER(5,4),
    min_balance NUMBER(15,2) NOT NULL,
    max_withdrawal NUMBER(15,2)
);

-- 6. ACCOUNTS
CREATE TABLE ACCOUNTS (
    account_id VARCHAR2(20) PRIMARY KEY,
    account_number VARCHAR2(18) UNIQUE NOT NULL,
    customer_id VARCHAR2(20) REFERENCES CUSTOMERS(customer_id),
    account_type_id NUMBER REFERENCES ACCOUNT_TYPES(type_id),
    home_branch_id VARCHAR2(20) REFERENCES BRANCHES(branch_id),
    balance NUMBER(15,2) NOT NULL CHECK (balance >= 0),
    status VARCHAR2(10) CHECK (status IN ('ACTIVE','DORMANT','FROZEN','CLOSED')),
    opened_date DATE NOT NULL,
    closed_date DATE,
    minimum_balance NUMBER(15,2) DEFAULT 500.00 NOT NULL,
    nominee_name VARCHAR2(100)
);

-- 7. TRANSACTIONS
CREATE TABLE TRANSACTIONS (
    transaction_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_ref VARCHAR2(30) UNIQUE,
    account_id VARCHAR2(20) REFERENCES ACCOUNTS(account_id),
    transaction_type VARCHAR2(30) NOT NULL,
    amount NUMBER(15,2) NOT NULL CHECK (amount > 0),
    balance_after NUMBER(15,2) NOT NULL,
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    description VARCHAR2(200),
    initiated_by VARCHAR2(50) NOT NULL,
    branch_id VARCHAR2(20) REFERENCES BRANCHES(branch_id),
    linked_transfer_id RAW(16),
    status VARCHAR2(20) DEFAULT 'COMPLETED',
    CONSTRAINT chk_txn_type CHECK (transaction_type IN ('CREDIT', 'DEBIT', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'INTEREST_CREDIT', 'FEE_DEBIT', 'EXTERNAL_DEBIT', 'EXTERNAL_CREDIT'))
);

-- 8. TRANSFER_LOG
CREATE TABLE TRANSFER_LOG (
    transfer_log_id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    debit_txn_id NUMBER REFERENCES TRANSACTIONS(transaction_id),
    credit_txn_id NUMBER REFERENCES TRANSACTIONS(transaction_id),
    transferred_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);

-- 9. DUAL_APPROVAL_QUEUE
CREATE TABLE DUAL_APPROVAL_QUEUE (
    queue_id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    requested_by RAW(16) REFERENCES USERS(user_id),
    operation_type VARCHAR2(30),
    payload_json CLOB NOT NULL,
    status VARCHAR2(20) CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    reviewed_by VARCHAR2(20) REFERENCES EMPLOYEES(employee_id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_note CLOB
);

-- 10. COMPLIANCE_FLAGS
CREATE TABLE COMPLIANCE_FLAGS (
    flag_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id VARCHAR2(20) REFERENCES ACCOUNTS(account_id),
    transaction_id NUMBER REFERENCES TRANSACTIONS(transaction_id),
    flag_type VARCHAR2(50),
    threshold_value NUMBER(15,2) NOT NULL,
    flagged_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    reviewed_by VARCHAR2(50)
);

-- 11. ACCRUAL_BATCH_CONTROL
CREATE TABLE ACCRUAL_BATCH_CONTROL (
    run_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bucket_id SMALLINT NOT NULL CHECK (bucket_id BETWEEN 0 AND 9),
    accrual_date DATE NOT NULL,
    status VARCHAR2(15) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    accounts_processed INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message CLOB,
    CONSTRAINT uq_bucket_date UNIQUE (bucket_id, accrual_date)
);

-- 12. INTEREST_ACCRUAL_LOG
CREATE TABLE INTEREST_ACCRUAL_LOG (
    accrual_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id VARCHAR2(20) REFERENCES ACCOUNTS(account_id),
    batch_run_id NUMBER REFERENCES ACCRUAL_BATCH_CONTROL(run_id),
    accrual_date DATE NOT NULL,
    principal_amount NUMBER(15,2) NOT NULL,
    rate_applied NUMBER(5,4) NOT NULL,
    interest_amount NUMBER(15,2) NOT NULL,
    posted_txn_id NUMBER REFERENCES TRANSACTIONS(transaction_id)
);

-- 13. SYSTEM_CONFIG
CREATE TABLE SYSTEM_CONFIG (
    config_key VARCHAR2(50) PRIMARY KEY,
    config_value VARCHAR2(200) NOT NULL,
    description CLOB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_by RAW(16) REFERENCES USERS(user_id)
);

-- 14. PENDING_EXTERNAL_TRANSFERS
CREATE TABLE PENDING_EXTERNAL_TRANSFERS (
    transfer_id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    source_account_id VARCHAR2(20) NOT NULL REFERENCES ACCOUNTS(account_id),
    amount NUMBER(15,2) NOT NULL CHECK (amount > 0),
    destination_ifsc VARCHAR2(11) NOT NULL CHECK (REGEXP_LIKE(destination_ifsc, '^[A-Z]{4}0[A-Z0-9]{6}$')),
    destination_account VARCHAR2(20) NOT NULL,
    destination_name VARCHAR2(100),
    purpose VARCHAR2(200),
    status VARCHAR2(15) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SETTLED', 'REJECTED', 'CANCELLED')),
    transfer_mode VARCHAR2(10) NOT NULL CHECK (transfer_mode IN ('RTGS', 'NEFT', 'IMPS')),
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    initiated_by VARCHAR2(50) NOT NULL,
    settled_at TIMESTAMP WITH TIME ZONE,
    settlement_reference VARCHAR2(30),
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason CLOB
);

-- 15. PROCEDURE_EXECUTION_LOG
CREATE TABLE PROCEDURE_EXECUTION_LOG (
    log_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proc_name VARCHAR2(100) NOT NULL,
    called_by VARCHAR2(50) NOT NULL,
    called_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    execution_ms INTEGER,
    parameters_hash VARCHAR2(64),
    success_flag CHAR(1) NOT NULL,
    error_message CLOB
);

-- 16. AUDIT_LOG
CREATE TABLE AUDIT_LOG (
    audit_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name VARCHAR2(50) NOT NULL,
    record_id VARCHAR2(50) NOT NULL,
    operation VARCHAR2(30) NOT NULL,
    changed_by VARCHAR2(50) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    old_value_json CLOB,
    new_value_json CLOB,
    change_reason CLOB,
    violation_flag CHAR(1) DEFAULT '0',
    ip_address VARCHAR2(45),
    session_id RAW(16)
);

-- 17. LOAN_APPLICATIONS
CREATE TABLE LOAN_APPLICATIONS (
    loan_app_id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    customer_id VARCHAR2(20) REFERENCES CUSTOMERS(customer_id),
    branch_id VARCHAR2(20) REFERENCES BRANCHES(branch_id),
    loan_type VARCHAR2(20) CHECK (loan_type IN ('PERSONAL','HOME','VEHICLE','EDUCATION')),
    requested_amount NUMBER(15,2) CHECK (requested_amount > 0),
    tenure_months NUMBER(3) CHECK (tenure_months BETWEEN 1 AND 360),
    annual_rate NUMBER(5,4),
    status VARCHAR2(20) CHECK (status IN ('RECEIVED','UNDER_REVIEW','APPROVED','DISBURSED','ACTIVE','CLOSED','DEFAULTED')),
    linked_account_id VARCHAR2(20) REFERENCES ACCOUNTS(account_id),
    reviewed_by VARCHAR2(20) REFERENCES EMPLOYEES(employee_id),
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);

-- 18. LOAN_ACCOUNTS
CREATE TABLE LOAN_ACCOUNTS (
    loan_account_id VARCHAR2(20) PRIMARY KEY,
    loan_app_id RAW(16) REFERENCES LOAN_APPLICATIONS(loan_app_id),
    disbursed_amount NUMBER(15,2) CHECK (disbursed_amount > 0),
    outstanding_principal NUMBER(15,2) CHECK (outstanding_principal >= 0),
    disbursed_at TIMESTAMP WITH TIME ZONE,
    disbursement_txn_id NUMBER REFERENCES TRANSACTIONS(transaction_id),
    status VARCHAR2(15) CHECK (status IN ('ACTIVE','CLOSED','DEFAULTED'))
);

-- 19. EMI_SCHEDULE
CREATE TABLE EMI_SCHEDULE (
    emi_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loan_account_id VARCHAR2(20) REFERENCES LOAN_ACCOUNTS(loan_account_id),
    emi_number NUMBER(3),
    due_date DATE NOT NULL,
    emi_amount NUMBER(12,2) CHECK (emi_amount > 0),
    principal_component NUMBER(12,2),
    interest_component NUMBER(12,2),
    closing_balance NUMBER(15,2) CHECK (closing_balance >= 0),
    status VARCHAR2(10) CHECK (status IN ('PENDING','PAID','OVERDUE')),
    paid_at TIMESTAMP WITH TIME ZONE,
    penalty_amount NUMBER(10,2) DEFAULT 0
);

-- 20. LOAN_PAYMENTS
CREATE TABLE LOAN_PAYMENTS (
    payment_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loan_account_id VARCHAR2(20) REFERENCES LOAN_ACCOUNTS(loan_account_id),
    emi_id NUMBER REFERENCES EMI_SCHEDULE(emi_id),
    payment_txn_id NUMBER REFERENCES TRANSACTIONS(transaction_id),
    amount_paid NUMBER(12,2) CHECK (amount_paid > 0),
    penalty_paid NUMBER(10,2) DEFAULT 0,
    payment_ref VARCHAR2(30),
    paid_by_emp_id VARCHAR2(20) REFERENCES EMPLOYEES(employee_id),
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);

-- Create AUDIT_LOG Immutable Trigger
CREATE OR REPLACE TRIGGER trg_prevent_audit_modification
BEFORE UPDATE OR DELETE ON AUDIT_LOG
BEGIN
    RAISE_APPLICATION_ERROR(-20005, 'Audit log records cannot be modified or deleted.');
END;
/
COMMIT;