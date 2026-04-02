-- ================================================================
-- FIX: Bank Pool Account & Double-Entry Bookkeeping
-- Creates per-branch bank pool accounts so every financial flow
-- (loans, EMIs, fees, interest) uses proper double-entry booking.
-- ================================================================

SET SERVEROUTPUT ON;
PROMPT ========================================
PROMPT Bank Pool Account Setup — Starting...
PROMPT ========================================

-- ================================================================
-- STEP 1: Create bank entity (user + customer + config)
-- ================================================================
DECLARE
    v_user_id RAW(16);
    v_count NUMBER;
BEGIN
    -- Check if bank.pool user already exists
    SELECT COUNT(*) INTO v_count FROM USERS WHERE username = 'bank.pool';
    IF v_count = 0 THEN
        INSERT INTO USERS (username, password_hash, user_type)
        VALUES ('bank.pool', 'SYSTEM_INTERNAL_NO_LOGIN', 'EMPLOYEE')
        RETURNING user_id INTO v_user_id;
        DBMS_OUTPUT.PUT_LINE('Created bank.pool user: ' || RAWTOHEX(v_user_id));
    ELSE
        SELECT user_id INTO v_user_id FROM USERS WHERE username = 'bank.pool';
        DBMS_OUTPUT.PUT_LINE('bank.pool user already exists: ' || RAWTOHEX(v_user_id));
    END IF;

    -- Create bank customer entity
    SELECT COUNT(*) INTO v_count FROM CUSTOMERS WHERE customer_id = 'CUST-BANK-001';
    IF v_count = 0 THEN
        INSERT INTO CUSTOMERS (customer_id, full_name, date_of_birth, pan_number, phone, kyc_status, user_id)
        VALUES ('CUST-BANK-001', 'Suraksha Bank - Pool Entity', DATE '2000-01-01', 'BANKPOOL01', '0000000000', 'VERIFIED', v_user_id);
        DBMS_OUTPUT.PUT_LINE('Created CUST-BANK-001 customer entity.');
    ELSE
        DBMS_OUTPUT.PUT_LINE('CUST-BANK-001 already exists.');
    END IF;

    -- Config entry
    SELECT COUNT(*) INTO v_count FROM SYSTEM_CONFIG WHERE config_key = 'BANK_POOL_CUSTOMER_ID';
    IF v_count = 0 THEN
        INSERT INTO SYSTEM_CONFIG (config_key, config_value, description)
        VALUES ('BANK_POOL_CUSTOMER_ID', 'CUST-BANK-001', 'Customer ID used for all bank pool/business accounts');
    END IF;
END;
/
COMMIT;
PROMPT STEP 1 DONE: Bank entity created.


-- ================================================================
-- STEP 2: Expand TRANSACTIONS constraint for new types
-- ================================================================
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE TRANSACTIONS DROP CONSTRAINT chk_txn_type';
    DBMS_OUTPUT.PUT_LINE('Dropped old chk_txn_type constraint.');
EXCEPTION WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('chk_txn_type constraint not found, skipping drop.');
END;
/

ALTER TABLE TRANSACTIONS ADD CONSTRAINT chk_txn_type CHECK (
    transaction_type IN (
        'CREDIT', 'DEBIT',
        'TRANSFER_DEBIT', 'TRANSFER_CREDIT',
        'INTEREST_CREDIT', 'INTEREST_DEBIT',
        'FEE_DEBIT', 'FEE_CREDIT',
        'EXTERNAL_DEBIT', 'EXTERNAL_CREDIT',
        'LOAN_DISBURSE_DEBIT', 'LOAN_DISBURSE_CREDIT',
        'LOAN_EMI_DEBIT', 'LOAN_EMI_CREDIT',
        'LOAN_PENALTY_CREDIT'
    )
);
PROMPT STEP 2 DONE: Transaction types expanded.


-- ================================================================
-- STEP 3: Create pool accounts for existing branches
-- ================================================================
DECLARE
    v_count NUMBER;
BEGIN
    FOR br IN (SELECT branch_id FROM BRANCHES) LOOP
        SELECT COUNT(*) INTO v_count FROM ACCOUNTS WHERE account_id = 'ACC-BANK-' || br.branch_id;
        IF v_count = 0 THEN
            INSERT INTO ACCOUNTS (
                account_id, account_number, customer_id, account_type_id,
                home_branch_id, balance, status, opened_date, minimum_balance
            ) VALUES (
                'ACC-BANK-' || br.branch_id,
                '999' || LPAD(ABS(ORA_HASH(br.branch_id)), 15, '0'),
                'CUST-BANK-001',
                2,  -- Business Current
                br.branch_id,
                100000000.00,  -- 10 Crore initial
                'ACTIVE',
                SYSDATE,
                0  -- No minimum balance for bank pool
            );
            DBMS_OUTPUT.PUT_LINE('Created pool account: ACC-BANK-' || br.branch_id);
        ELSE
            DBMS_OUTPUT.PUT_LINE('Pool account already exists: ACC-BANK-' || br.branch_id);
        END IF;
    END LOOP;
END;
/
COMMIT;
PROMPT STEP 3 DONE: Pool accounts created for all branches.


-- ================================================================
-- STEP 4: Helper function to get branch pool account ID
-- ================================================================
CREATE OR REPLACE FUNCTION fn_get_branch_pool_account (
    p_branch_id IN VARCHAR2
) RETURN VARCHAR2 AS
    v_pool_id VARCHAR2(40);
BEGIN
    v_pool_id := 'ACC-BANK-' || p_branch_id;
    RETURN v_pool_id;
END;
/
PROMPT STEP 4 DONE: fn_get_branch_pool_account created.


-- ================================================================
-- STEP 5: Recreate sp_disburse_loan with DOUBLE-ENTRY
-- Bank pool DEBITED → Customer CREDITED
-- ================================================================
CREATE OR REPLACE PROCEDURE sp_disburse_loan (
    p_loan_app_id IN RAW,
    p_loan_mgr_id IN VARCHAR2
) AS
    v_status           VARCHAR2(20);
    v_linked_account   VARCHAR2(20);
    v_requested_amount NUMBER;
    v_annual_rate      NUMBER;
    v_tenure_months    NUMBER;
    v_limit            NUMBER;
    v_loan_account_id  VARCHAR2(40);
    v_user_id          RAW(16);
    v_branch_id        VARCHAR2(20);
    v_pool_account_id  VARCHAR2(40);
    v_pool_balance     NUMBER;
BEGIN
    SELECT la.status, la.linked_account_id, la.requested_amount, la.annual_rate, la.tenure_months, la.branch_id
    INTO v_status, v_linked_account, v_requested_amount, v_annual_rate, v_tenure_months, v_branch_id
    FROM LOAN_APPLICATIONS la WHERE la.loan_app_id = p_loan_app_id FOR UPDATE;

    IF v_status != 'APPROVED' THEN
        RAISE_APPLICATION_ERROR(-20011, 'Loan is not in APPROVED state.');
    END IF;

    BEGIN
        SELECT TO_NUMBER(config_value) INTO v_limit
        FROM SYSTEM_CONFIG WHERE config_key = 'LOAN_AUTO_DISBURSE_LIMIT';
    EXCEPTION WHEN NO_DATA_FOUND THEN v_limit := 500000;
    END;

    IF v_requested_amount > v_limit THEN
        SELECT user_id INTO v_user_id FROM EMPLOYEES WHERE employee_id = p_loan_mgr_id;
        INSERT INTO DUAL_APPROVAL_QUEUE (requested_by, operation_type, payload_json, status)
        VALUES (v_user_id, 'LOAN_DISBURSEMENT',
            '{"loan_app_id":"' || RAWTOHEX(p_loan_app_id) || '","amount":' || v_requested_amount || '}',
            'PENDING');
    ELSE
        -- Get branch pool account
        v_pool_account_id := fn_get_branch_pool_account(v_branch_id);

        -- Verify pool has sufficient funds
        SELECT balance INTO v_pool_balance
        FROM ACCOUNTS WHERE account_id = v_pool_account_id FOR UPDATE;

        IF v_pool_balance < v_requested_amount THEN
            RAISE_APPLICATION_ERROR(-20050, 'Insufficient funds in bank pool account for disbursement.');
        END IF;

        v_loan_account_id := 'LN-' || TO_CHAR(SYSTIMESTAMP, 'FF4');

        INSERT INTO LOAN_ACCOUNTS (loan_account_id, loan_app_id, disbursed_amount, outstanding_principal, disbursed_at, status)
        VALUES (v_loan_account_id, p_loan_app_id, v_requested_amount, v_requested_amount, SYSTIMESTAMP, 'ACTIVE');

        UPDATE LOAN_APPLICATIONS SET status = 'DISBURSED' WHERE loan_app_id = p_loan_app_id;

        -- ===== DOUBLE-ENTRY BOOKKEEPING =====
        -- 1. DEBIT bank pool (money leaves the bank)
        UPDATE ACCOUNTS SET balance = balance - v_requested_amount WHERE account_id = v_pool_account_id;
        INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
        VALUES (v_pool_account_id, 'LOAN_DISBURSE_DEBIT', v_requested_amount,
                v_pool_balance - v_requested_amount, p_loan_mgr_id,
                'Loan disbursement to ' || v_linked_account || ' [' || v_loan_account_id || ']');

        -- 2. CREDIT customer linked account (money enters customer's account)
        UPDATE ACCOUNTS SET balance = balance + v_requested_amount WHERE account_id = v_linked_account;
        DECLARE
            v_cust_bal NUMBER;
        BEGIN
            SELECT balance INTO v_cust_bal FROM ACCOUNTS WHERE account_id = v_linked_account;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (v_linked_account, 'LOAN_DISBURSE_CREDIT', v_requested_amount,
                    v_cust_bal, p_loan_mgr_id,
                    'Loan disbursement received [' || v_loan_account_id || ']');
        END;

        -- AUTO-GENERATE EMI SCHEDULE
        sp_generate_emi_schedule(v_loan_account_id, v_requested_amount, v_annual_rate, v_tenure_months);

        -- Notification
        DECLARE
            v_cust_name VARCHAR2(100);
            v_cust_id   VARCHAR2(20);
            v_user      RAW(16);
        BEGIN
            SELECT c.full_name, c.customer_id, c.user_id INTO v_cust_name, v_cust_id, v_user
            FROM CUSTOMERS c JOIN LOAN_APPLICATIONS la ON c.customer_id = la.customer_id
            WHERE la.loan_app_id = p_loan_app_id;

            INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
            VALUES (v_cust_id, v_user, 'LOAN_DISBURSED', 'EMAIL',
                JSON_OBJECT('customer_name' VALUE v_cust_name,
                            'loan_account_id' VALUE v_loan_account_id,
                            'amount' VALUE v_requested_amount));
        END;
    END IF;
    COMMIT;
END;
/
PROMPT STEP 5 DONE: sp_disburse_loan with double-entry.


-- ================================================================
-- STEP 6: Recreate sp_record_emi_payment with DOUBLE-ENTRY
-- Customer DEBITED → Bank pool CREDITED
-- ================================================================
CREATE OR REPLACE PROCEDURE sp_record_emi_payment (
    p_emi_id      IN NUMBER,
    p_loan_mgr_id IN VARCHAR2
) AS
    v_status          VARCHAR2(10);
    v_due_date        DATE;
    v_emi_amount      NUMBER;
    v_loan_account_id VARCHAR2(20);
    v_principal_comp  NUMBER;
    v_linked_account  VARCHAR2(20);
    v_penalty         NUMBER := 0;
    v_branch_id       VARCHAR2(20);
    v_pool_account_id VARCHAR2(40);
    v_pool_balance    NUMBER;
    v_cust_balance    NUMBER;
    v_total_debit     NUMBER;
BEGIN
    SELECT es.status, es.due_date, es.emi_amount, es.loan_account_id, es.principal_component
    INTO v_status, v_due_date, v_emi_amount, v_loan_account_id, v_principal_comp
    FROM EMI_SCHEDULE es WHERE es.emi_id = p_emi_id FOR UPDATE;

    SELECT la.linked_account_id, la.branch_id
    INTO v_linked_account, v_branch_id
    FROM LOAN_APPLICATIONS la
    WHERE la.loan_app_id = (SELECT loan_app_id FROM LOAN_ACCOUNTS WHERE loan_account_id = v_loan_account_id);

    IF v_status != 'PENDING' AND v_status != 'OVERDUE' THEN
        RAISE_APPLICATION_ERROR(-20012, 'EMI is already paid.');
    END IF;

    -- Calculate penalty
    IF SYSDATE > v_due_date THEN
        v_penalty := ROUND((SYSDATE - v_due_date) * 0.005 * v_emi_amount, 2);
    END IF;

    v_total_debit := v_emi_amount + v_penalty;
    v_pool_account_id := fn_get_branch_pool_account(v_branch_id);

    -- ===== DOUBLE-ENTRY BOOKKEEPING =====
    -- 1. DEBIT customer (EMI + penalty leaves their account)
    SELECT balance INTO v_cust_balance FROM ACCOUNTS WHERE account_id = v_linked_account FOR UPDATE;
    IF v_cust_balance - v_total_debit < 0 THEN
        RAISE_APPLICATION_ERROR(-20001, 'Insufficient funds for EMI payment.');
    END IF;

    UPDATE ACCOUNTS SET balance = balance - v_total_debit WHERE account_id = v_linked_account;
    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
    VALUES (v_linked_account, 'LOAN_EMI_DEBIT', v_total_debit,
            v_cust_balance - v_total_debit, p_loan_mgr_id,
            'EMI #' || p_emi_id || ' payment [' || v_loan_account_id || ']');

    -- 2. CREDIT bank pool (EMI amount goes to bank)
    SELECT balance INTO v_pool_balance FROM ACCOUNTS WHERE account_id = v_pool_account_id FOR UPDATE;
    UPDATE ACCOUNTS SET balance = balance + v_emi_amount WHERE account_id = v_pool_account_id;
    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
    VALUES (v_pool_account_id, 'LOAN_EMI_CREDIT', v_emi_amount,
            v_pool_balance + v_emi_amount, p_loan_mgr_id,
            'EMI repayment from ' || v_linked_account || ' [' || v_loan_account_id || ']');

    -- 3. CREDIT penalty separately to bank pool (if any)
    IF v_penalty > 0 THEN
        UPDATE ACCOUNTS SET balance = balance + v_penalty WHERE account_id = v_pool_account_id;
        INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
        VALUES (v_pool_account_id, 'LOAN_PENALTY_CREDIT', v_penalty,
                v_pool_balance + v_emi_amount + v_penalty, p_loan_mgr_id,
                'Late penalty for EMI #' || p_emi_id || ' [' || v_loan_account_id || ']');
    END IF;

    -- Update EMI schedule and loan accounts
    UPDATE EMI_SCHEDULE SET status = 'PAID', paid_at = SYSTIMESTAMP, penalty_amount = v_penalty WHERE emi_id = p_emi_id;
    UPDATE LOAN_ACCOUNTS SET outstanding_principal = outstanding_principal - v_principal_comp WHERE loan_account_id = v_loan_account_id;

    INSERT INTO LOAN_PAYMENTS (loan_account_id, emi_id, amount_paid, penalty_paid, paid_by_emp_id)
    VALUES (v_loan_account_id, p_emi_id, v_emi_amount, v_penalty, p_loan_mgr_id);

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id   VARCHAR2(20);
        v_user      RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, c.user_id
        INTO v_cust_name, v_cust_id, v_user
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id
        WHERE a.account_id = v_linked_account;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'EMI_PAID', 'EMAIL',
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'loan_account_id' VALUE v_loan_account_id,
                'emi_amount' VALUE v_emi_amount,
                'penalty' VALUE v_penalty
            )
        );
    END;

    COMMIT;
END;
/
PROMPT STEP 6 DONE: sp_record_emi_payment with double-entry.


-- ================================================================
-- STEP 7: Recreate sp_deposit with fee credit to bank pool
-- ================================================================
CREATE OR REPLACE PROCEDURE sp_deposit (
    p_account_id IN VARCHAR2,
    p_amount     IN NUMBER,
    p_teller_id  IN VARCHAR2
) AS
    v_balance    NUMBER;
    v_status     VARCHAR2(10);
    v_branch_id  VARCHAR2(20);
    v_pool_id    VARCHAR2(40);
BEGIN
    SELECT balance, status, home_branch_id INTO v_balance, v_status, v_branch_id
    FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;

    IF v_status NOT IN ('ACTIVE', 'DORMANT') THEN
        RAISE_APPLICATION_ERROR(-20003, 'Account is ' || v_status || '. Cannot deposit.');
    END IF;

    UPDATE ACCOUNTS SET balance = balance + p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_account_id, 'CREDIT', p_amount, v_balance + p_amount, p_teller_id);

    -- Fee Deduction + Credit to Bank Pool
    DECLARE
        v_fee NUMBER;
        v_pool_bal NUMBER;
    BEGIN
        v_fee := fn_calculate_fee('CASH_DEP', p_amount);
        IF v_fee > 0 THEN
            UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_account_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (p_account_id, 'FEE_DEBIT', v_fee, v_balance + p_amount - v_fee, 'SYSTEM', 'Cash Deposit Fee');

            -- DOUBLE-ENTRY: Credit fee to bank pool
            v_pool_id := fn_get_branch_pool_account(v_branch_id);
            SELECT balance INTO v_pool_bal FROM ACCOUNTS WHERE account_id = v_pool_id FOR UPDATE;
            UPDATE ACCOUNTS SET balance = balance + v_fee WHERE account_id = v_pool_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (v_pool_id, 'FEE_CREDIT', v_fee, v_pool_bal + v_fee, 'SYSTEM', 'Cash Deposit Fee from ' || p_account_id);
        END IF;
    END;

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_acc_num VARCHAR2(18);
        v_user RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, a.account_number, c.user_id
        INTO v_cust_name, v_cust_id, v_acc_num, v_user
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_account_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'TXN_ALERT', 'IN_APP',
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'txn_type' VALUE 'CREDIT',
                'amount' VALUE p_amount,
                'balance_after' VALUE v_balance + p_amount,
                'txn_id' VALUE 'DEP-' || TO_CHAR(SYSTIMESTAMP, 'FF4'),
                'txn_timestamp' VALUE TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'account_number' VALUE v_acc_num
            )
        );
    END;

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/
PROMPT STEP 7 DONE: sp_deposit with fee credit to bank pool.


-- ================================================================
-- STEP 8: Recreate sp_withdraw with fee credit to bank pool
-- ================================================================
CREATE OR REPLACE PROCEDURE sp_withdraw (
    p_account_id IN VARCHAR2,
    p_amount     IN NUMBER,
    p_teller_id  IN VARCHAR2
) AS
    v_balance    NUMBER;
    v_min        NUMBER;
    v_status     VARCHAR2(10);
    v_branch_id  VARCHAR2(20);
    v_pool_id    VARCHAR2(40);
BEGIN
    EXECUTE IMMEDIATE 'SELECT balance, minimum_balance, status, home_branch_id FROM ACCOUNTS WHERE account_id = :1 FOR UPDATE WAIT 5'
    INTO v_balance, v_min, v_status, v_branch_id USING p_account_id;

    IF v_status != 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20003, 'Account is ' || v_status || '. Cannot withdraw.');
    END IF;

    IF v_balance - p_amount < v_min THEN
        RAISE_APPLICATION_ERROR(-20001, 'Insufficient funds. Minimum balance must be maintained.');
    END IF;

    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_account_id, 'DEBIT', p_amount, v_balance - p_amount, p_teller_id);

    -- Fee Deduction + Credit to Bank Pool
    DECLARE
        v_fee NUMBER;
        v_pool_bal NUMBER;
    BEGIN
        v_fee := fn_calculate_fee('CASH_WTH', p_amount);
        IF v_fee > 0 THEN
            UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_account_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (p_account_id, 'FEE_DEBIT', v_fee, v_balance - p_amount - v_fee, 'SYSTEM', 'Cash Withdrawal Fee');

            -- DOUBLE-ENTRY: Credit fee to bank pool
            v_pool_id := fn_get_branch_pool_account(v_branch_id);
            SELECT balance INTO v_pool_bal FROM ACCOUNTS WHERE account_id = v_pool_id FOR UPDATE;
            UPDATE ACCOUNTS SET balance = balance + v_fee WHERE account_id = v_pool_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (v_pool_id, 'FEE_CREDIT', v_fee, v_pool_bal + v_fee, 'SYSTEM', 'Cash Withdrawal Fee from ' || p_account_id);
        END IF;
    END;

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_acc_num VARCHAR2(18);
        v_user RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, a.account_number, c.user_id
        INTO v_cust_name, v_cust_id, v_acc_num, v_user
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_account_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'TXN_ALERT', 'IN_APP',
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'txn_type' VALUE 'DEBIT',
                'amount' VALUE p_amount,
                'balance_after' VALUE v_balance - p_amount,
                'txn_id' VALUE 'WTH-' || TO_CHAR(SYSTIMESTAMP, 'FF4'),
                'txn_timestamp' VALUE TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'account_number' VALUE v_acc_num
            )
        );
    END;

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/
PROMPT STEP 8 DONE: sp_withdraw with fee credit to bank pool.


-- ================================================================
-- STEP 9: Recreate sp_initiate_external_transfer with fee credit to bank pool
-- ================================================================
CREATE OR REPLACE PROCEDURE sp_initiate_external_transfer (
    p_account_id   IN VARCHAR2,
    p_amount       IN NUMBER,
    p_ifsc         IN VARCHAR2,
    p_acc_no       IN VARCHAR2,
    p_mode         IN VARCHAR2,
    p_initiated_by IN VARCHAR2
) AS
    v_balance    NUMBER;
    v_min        NUMBER;
    v_status     VARCHAR2(10);
    v_fee        NUMBER;
    v_branch_id  VARCHAR2(20);
    v_pool_id    VARCHAR2(40);
BEGIN
    SELECT balance, minimum_balance, status, home_branch_id INTO v_balance, v_min, v_status, v_branch_id
    FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;

    IF v_status != 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20003, 'Account is not ACTIVE.');
    END IF;

    v_fee := fn_calculate_fee(p_mode, p_amount);

    IF v_balance - p_amount - v_fee < v_min THEN
        RAISE_APPLICATION_ERROR(-20001, 'Insufficient funds (Amount + Fee: ' || (p_amount + v_fee) || ').');
    END IF;

    -- Escrow Funds
    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_account_id;
    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, status)
    VALUES (p_account_id, 'EXTERNAL_DEBIT', p_amount, v_balance - p_amount, p_initiated_by, 'PENDING');

    -- Fee Deduction + Credit to Bank Pool
    IF v_fee > 0 THEN
        UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_account_id;
        INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
        VALUES (p_account_id, 'FEE_DEBIT', v_fee, v_balance - p_amount - v_fee, 'SYSTEM', p_mode || ' Transfer Fee');

        -- DOUBLE-ENTRY: Credit fee to bank pool
        v_pool_id := fn_get_branch_pool_account(v_branch_id);
        DECLARE
            v_pool_bal NUMBER;
        BEGIN
            SELECT balance INTO v_pool_bal FROM ACCOUNTS WHERE account_id = v_pool_id FOR UPDATE;
            UPDATE ACCOUNTS SET balance = balance + v_fee WHERE account_id = v_pool_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (v_pool_id, 'FEE_CREDIT', v_fee, v_pool_bal + v_fee, 'SYSTEM', p_mode || ' Transfer Fee from ' || p_account_id);
        END;
    END IF;

    INSERT INTO PENDING_EXTERNAL_TRANSFERS (source_account_id, amount, destination_ifsc, destination_account, transfer_mode, initiated_by)
    VALUES (p_account_id, p_amount, p_ifsc, p_acc_no, p_mode, p_initiated_by);

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_user RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, c.user_id
        INTO v_cust_name, v_cust_id, v_user
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id
        WHERE a.account_id = p_account_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'EXT_TXN_INITIATED', 'EMAIL',
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'amount' VALUE p_amount,
                'dest_acc' VALUE p_acc_no,
                'status' VALUE 'PENDING'
            )
        );
    END;

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/
PROMPT STEP 9 DONE: sp_initiate_external_transfer with fee credit to bank pool.


-- ================================================================
-- STEP 10: Recreate sp_post_savings_interest with DOUBLE-ENTRY
-- Bank pool DEBITED (interest expense) → Customer CREDITED
-- ================================================================
CREATE OR REPLACE PROCEDURE sp_post_savings_interest AS
    v_interest_rate NUMBER := 0.03;
    v_avg_bal       NUMBER;
    v_interest_amt  NUMBER;
    v_posted_txn_id NUMBER;
    v_branch_id     VARCHAR2(20);
    v_pool_id       VARCHAR2(40);
    v_pool_balance  NUMBER;
BEGIN
    FOR r IN (
        SELECT a.account_id, a.balance, a.home_branch_id, at.type_name
        FROM ACCOUNTS a
        JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
        WHERE a.status = 'ACTIVE'
        AND (at.type_name LIKE '%Savings%')
        AND a.customer_id != 'CUST-BANK-001'  -- Exclude bank pool accounts
    ) LOOP
        v_avg_bal := fn_get_average_balance(r.account_id);
        v_interest_amt := ROUND((v_avg_bal * v_interest_rate) / 12, 2);

        IF v_interest_amt > 0 THEN
            -- CREDIT customer
            UPDATE ACCOUNTS SET balance = balance + v_interest_amt WHERE account_id = r.account_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (r.account_id, 'INTEREST_CREDIT', v_interest_amt, r.balance + v_interest_amt, 'SYSTEM', 'Monthly Interest Credit (3% on Avg Bal)')
            RETURNING transaction_id INTO v_posted_txn_id;

            -- DOUBLE-ENTRY: DEBIT bank pool (interest is an expense for the bank)
            v_pool_id := fn_get_branch_pool_account(r.home_branch_id);
            BEGIN
                SELECT balance INTO v_pool_balance FROM ACCOUNTS WHERE account_id = v_pool_id FOR UPDATE;
                UPDATE ACCOUNTS SET balance = balance - v_interest_amt WHERE account_id = v_pool_id;
                INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
                VALUES (v_pool_id, 'INTEREST_DEBIT', v_interest_amt, v_pool_balance - v_interest_amt, 'SYSTEM',
                        'Interest expense paid to ' || r.account_id);
            EXCEPTION WHEN NO_DATA_FOUND THEN
                DBMS_OUTPUT.PUT_LINE('WARNING: No pool account for branch ' || r.home_branch_id);
            END;

            -- Log it
            INSERT INTO INTEREST_ACCRUAL_LOG (account_id, accrual_date, principal_amount, rate_applied, interest_amount, posted_txn_id)
            VALUES (r.account_id, SYSDATE, v_avg_bal, v_interest_rate, v_interest_amt, v_posted_txn_id);
        END IF;
    END LOOP;
    COMMIT;
END;
/
PROMPT STEP 10 DONE: sp_post_savings_interest with double-entry.


-- ================================================================
-- STEP 11: Recreate sp_deduct_service_charges with fee credit to bank pool
-- ================================================================
CREATE OR REPLACE PROCEDURE sp_deduct_service_charges (
    p_account_id IN VARCHAR2,
    p_fee_type   IN VARCHAR2
) AS
    v_fee_amt   NUMBER;
    v_branch_id VARCHAR2(20);
    v_pool_id   VARCHAR2(40);
    v_pool_bal  NUMBER;
BEGIN
    SELECT fee_amount INTO v_fee_amt FROM FEE_SCHEDULE WHERE fee_id = p_fee_type;

    IF v_fee_amt > 0 THEN
        -- Get branch for pool account lookup
        SELECT home_branch_id INTO v_branch_id FROM ACCOUNTS WHERE account_id = p_account_id;

        -- Debit customer
        sp_withdraw(p_account_id, v_fee_amt, 'SYSTEM_FEE');

        -- DOUBLE-ENTRY: Credit fee to bank pool
        v_pool_id := fn_get_branch_pool_account(v_branch_id);
        SELECT balance INTO v_pool_bal FROM ACCOUNTS WHERE account_id = v_pool_id FOR UPDATE;
        UPDATE ACCOUNTS SET balance = balance + v_fee_amt WHERE account_id = v_pool_id;
        INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
        VALUES (v_pool_id, 'FEE_CREDIT', v_fee_amt, v_pool_bal + v_fee_amt, 'SYSTEM', p_fee_type || ' service charge from ' || p_account_id);
    END IF;
    COMMIT;
END;
/
PROMPT STEP 11 DONE: sp_deduct_service_charges with double-entry.


-- ================================================================
-- STEP 12: POOL_ACCESS_CREDENTIALS table
-- Stores hashed password per pool account for two-step auth
-- ================================================================
BEGIN
    EXECUTE IMMEDIATE 'DROP TABLE POOL_ACCESS_CREDENTIALS CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -942 THEN RAISE; END IF;
END;
/

CREATE TABLE POOL_ACCESS_CREDENTIALS (
    credential_id    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pool_account_id  VARCHAR2(40) NOT NULL REFERENCES ACCOUNTS(account_id),
    password_hash    VARCHAR2(255) NOT NULL,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    access_count     NUMBER DEFAULT 0,
    CONSTRAINT uq_pool_credential UNIQUE (pool_account_id)
);

PROMPT STEP 12 DONE: POOL_ACCESS_CREDENTIALS table created.
PROMPT NOTE: Pool passwords are generated by the backend at branch creation.
PROMPT For existing branches, use POST /api/admin/bank-pool/reset-password.


PROMPT ========================================
PROMPT Bank Pool Account Setup — COMPLETE!
PROMPT ========================================
PROMPT
PROMPT Verify with:
PROMPT   SELECT account_id, balance FROM ACCOUNTS WHERE account_id LIKE 'ACC-BANK-%';
PROMPT   SELECT * FROM SYSTEM_CONFIG WHERE config_key = 'BANK_POOL_CUSTOMER_ID';
PROMPT   SELECT pool_account_id FROM POOL_ACCESS_CREDENTIALS;
PROMPT ========================================
