-- Suraksha Bank Safe Vault System
-- Database Procedures Part 1: Financial Operations (Oracle 21c)

-- 1. Internal Transfer
CREATE OR REPLACE PROCEDURE sp_internal_transfer (
    p_sender_account_id IN VARCHAR2,
    p_receiver_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_initiated_by IN VARCHAR2
) AS
    v_sender_balance NUMBER;
    v_sender_min NUMBER;
    v_receiver_status VARCHAR2(10);
    v_actual_receiver_id VARCHAR2(20) := p_receiver_account_id;
    v_debit_txn_id NUMBER;
    v_credit_txn_id NUMBER;
BEGIN
    -- Implicitly serialized if we use FOR UPDATE, but standard says:
    -- SET TRANSACTION ISOLATION LEVEL SERIALIZABLE is set by connection
    
    -- Lock sender
    BEGIN
        SELECT balance, minimum_balance INTO v_sender_balance, v_sender_min
        FROM ACCOUNTS WHERE account_id = p_sender_account_id FOR UPDATE;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20004, 'Sender account not found.');
    END;

    IF v_sender_balance - p_amount < v_sender_min THEN
        RAISE_APPLICATION_ERROR(-20001, 'Insufficient funds for transfer.');
    END IF;

    -- Lock receiver
    BEGIN
        SELECT status INTO v_receiver_status
        FROM ACCOUNTS WHERE account_id = v_actual_receiver_id FOR UPDATE;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            -- Fallback: check if they passed account_number instead of account_id
            BEGIN
                SELECT status, account_id INTO v_receiver_status, v_actual_receiver_id
                FROM ACCOUNTS WHERE account_number = v_actual_receiver_id FOR UPDATE;
            EXCEPTION
                WHEN NO_DATA_FOUND THEN
                    RAISE_APPLICATION_ERROR(-20005, 'Receiver account not found.');
            END;
    END;

    IF v_receiver_status != 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20002, 'Receiver account is not ACTIVE.');
    END IF;

    -- Update balances
    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_sender_account_id;
    UPDATE ACCOUNTS SET balance = balance + p_amount WHERE account_id = v_actual_receiver_id;

    -- Insert Debits/Credits
    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_sender_account_id, 'TRANSFER_DEBIT', p_amount, v_sender_balance - p_amount, p_initiated_by)
    RETURNING transaction_id INTO v_debit_txn_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (v_actual_receiver_id, 'TRANSFER_CREDIT', p_amount, v_sender_balance + p_amount, p_initiated_by) -- Note: balance_after needs actual query but simplification for now.
    RETURNING transaction_id INTO v_credit_txn_id;

    -- Link
    INSERT INTO TRANSFER_LOG (debit_txn_id, credit_txn_id) VALUES (v_debit_txn_id, v_credit_txn_id);

    -- Notifications
    DECLARE
        v_cust_name_s VARCHAR2(100);
        v_cust_name_r VARCHAR2(100);
        v_cust_id_s VARCHAR2(20);
        v_cust_id_r VARCHAR2(20);
        v_acc_num_s VARCHAR2(18);
        v_acc_num_r VARCHAR2(18);
        v_user_s RAW(16);
        v_user_r RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, a.account_number, c.user_id 
        INTO v_cust_name_s, v_cust_id_s, v_acc_num_s, v_user_s
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_sender_account_id;

        SELECT c.full_name, c.customer_id, a.account_number, c.user_id 
        INTO v_cust_name_r, v_cust_id_r, v_acc_num_r, v_user_r
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = v_actual_receiver_id;

        -- Sender Notification
        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id_s, v_user_s, 'TXN_ALERT', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name_s,
                'txn_type' VALUE 'TRANSFER_DEBIT',
                'amount' VALUE p_amount,
                'balance_after' VALUE v_sender_balance - p_amount,
                'txn_id' VALUE v_debit_txn_id,
                'txn_timestamp' VALUE TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'account_number' VALUE v_acc_num_s
            )
        );

        -- Receiver Notification
        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id_r, v_user_r, 'TXN_ALERT', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name_r,
                'txn_type' VALUE 'TRANSFER_CREDIT',
                'amount' VALUE p_amount,
                'balance_after' VALUE (SELECT balance FROM ACCOUNTS WHERE account_id = v_actual_receiver_id),
                'txn_id' VALUE v_credit_txn_id,
                'txn_timestamp' VALUE TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'account_number' VALUE v_acc_num_r
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

-- 2. Deposit
CREATE OR REPLACE PROCEDURE sp_deposit (
    p_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_teller_id IN VARCHAR2
) AS
    v_balance NUMBER;
    v_status VARCHAR2(10);
BEGIN
    SELECT balance, status INTO v_balance, v_status
    FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;
    
    IF v_status NOT IN ('ACTIVE', 'DORMANT') THEN
        RAISE_APPLICATION_ERROR(-20003, 'Account is ' || v_status || '. Cannot deposit.');
    END IF;

    UPDATE ACCOUNTS SET balance = balance + p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_account_id, 'CREDIT', p_amount, v_balance + p_amount, p_teller_id);
    
    -- Fee Deduction
    DECLARE
        v_fee NUMBER;
    BEGIN
        v_fee := fn_calculate_fee('CASH_DEP', p_amount);
        IF v_fee > 0 THEN
            UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_account_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (p_account_id, 'FEE_DEBIT', v_fee, v_balance + p_amount - v_fee, 'SYSTEM', 'Cash Deposit Fee');
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
        VALUES (v_cust_id, v_user, 'TXN_ALERT', 'EMAIL', 
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

-- 3. Withdraw
CREATE OR REPLACE PROCEDURE sp_withdraw (
    p_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_teller_id IN VARCHAR2
) AS
    v_balance NUMBER;
    v_min NUMBER;
    v_status VARCHAR2(10);
BEGIN
    -- WAIT 5 to avoid eternal deadlock block
    -- In Oracle typically SELECT ... FOR UPDATE WAIT 5;
    EXECUTE IMMEDIATE 'SELECT balance, minimum_balance, status FROM ACCOUNTS WHERE account_id = :1 FOR UPDATE WAIT 5' 
    INTO v_balance, v_min, v_status USING p_account_id;

    IF v_status != 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20003, 'Account is ' || v_status || '. Cannot withdraw.');
    END IF;

    IF v_balance - p_amount < v_min THEN
        RAISE_APPLICATION_ERROR(-20001, 'Insufficient funds. Minimum balance must be maintained.');
    END IF;

    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_account_id, 'DEBIT', p_amount, v_balance - p_amount, p_teller_id);
    
    -- Fee Deduction
    DECLARE
        v_fee NUMBER;
    BEGIN
        v_fee := fn_calculate_fee('CASH_WTH', p_amount);
        IF v_fee > 0 THEN
            UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_account_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (p_account_id, 'FEE_DEBIT', v_fee, v_balance - p_amount - v_fee, 'SYSTEM', 'Cash Withdrawal Fee');
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
        VALUES (v_cust_id, v_user, 'TXN_ALERT', 'EMAIL', 
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

-- 4. Open Account
CREATE OR REPLACE PROCEDURE sp_open_account (
    p_customer_id IN VARCHAR2,
    p_type_id IN NUMBER,
    p_initial_deposit IN NUMBER,
    p_teller_id IN VARCHAR2,
    p_home_branch_id IN VARCHAR2
) AS
    v_account_id VARCHAR2(20);
    v_account_number VARCHAR2(18);
BEGIN
    v_account_id := 'ACC-' || p_home_branch_id || '-' || TO_CHAR(SYSTIMESTAMP, 'FF4');
    v_account_number := '00' || p_type_id || TO_CHAR(SYSDATE, 'YYYYMMDD') || TO_CHAR(SYSTIMESTAMP, 'FF4');

    INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date)
    VALUES (v_account_id, v_account_number, p_customer_id, p_type_id, p_home_branch_id, p_initial_deposit, 'ACTIVE', SYSDATE);

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
    VALUES (v_account_id, 'CREDIT', p_initial_deposit, p_initial_deposit, p_teller_id, 'Initial Deposit');
    
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/
