-- SafeVault PostgreSQL Procedures Part 1: Financial Operations
-- Converted from Oracle 21c

-- 1. Internal Transfer
CREATE OR REPLACE PROCEDURE sp_internal_transfer (
    p_sender_account_id VARCHAR,
    p_receiver_account_id VARCHAR,
    p_amount NUMERIC,
    p_initiated_by VARCHAR
) LANGUAGE plpgsql AS $$
DECLARE
    v_sender_balance NUMERIC;
    v_sender_min NUMERIC;
    v_receiver_status VARCHAR(10);
    v_actual_receiver_id VARCHAR(20) := p_receiver_account_id;
    v_debit_txn_id INTEGER;
    v_credit_txn_id INTEGER;
    v_cust_name_s VARCHAR(100);
    v_cust_name_r VARCHAR(100);
    v_cust_id_s VARCHAR(20);
    v_cust_id_r VARCHAR(20);
    v_acc_num_s VARCHAR(18);
    v_acc_num_r VARCHAR(18);
    v_user_s UUID;
    v_user_r UUID;
BEGIN
    -- Lock sender
    SELECT balance, minimum_balance INTO v_sender_balance, v_sender_min
    FROM ACCOUNTS WHERE account_id = p_sender_account_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sender account not found.' USING ERRCODE = 'P0004'; -- Mapping to custom error if needed
    END IF;

    IF v_sender_balance - p_amount < v_sender_min THEN
        RAISE EXCEPTION 'Insufficient funds for transfer.' USING ERRCODE = 'P0001';
    END IF;

    -- Lock receiver (checking account_id first)
    SELECT status INTO v_receiver_status
    FROM ACCOUNTS WHERE account_id = v_actual_receiver_id FOR UPDATE;

    IF NOT FOUND THEN
        -- Fallback: check if they passed account_number
        SELECT status, account_id INTO v_receiver_status, v_actual_receiver_id
        FROM ACCOUNTS WHERE account_number = p_receiver_account_id FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Receiver account not found.' USING ERRCODE = 'P0005';
        END IF;
    END IF;

    IF v_receiver_status != 'ACTIVE' THEN
        RAISE EXCEPTION 'Receiver account is not ACTIVE.' USING ERRCODE = 'P0002';
    END IF;

    -- Update balances
    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_sender_account_id;
    UPDATE ACCOUNTS SET balance = balance + p_amount WHERE account_id = v_actual_receiver_id;

    -- Insert Debits/Credits
    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_sender_account_id, 'TRANSFER_DEBIT', p_amount, v_sender_balance - p_amount, p_initiated_by)
    RETURNING transaction_id INTO v_debit_txn_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (v_actual_receiver_id, 'TRANSFER_CREDIT', p_amount, (SELECT balance FROM ACCOUNTS WHERE account_id = v_actual_receiver_id), p_initiated_by)
    RETURNING transaction_id INTO v_credit_txn_id;

    -- Link
    INSERT INTO TRANSFER_LOG (debit_txn_id, credit_txn_id) VALUES (v_debit_txn_id, v_credit_txn_id);

    -- Notifications
    SELECT c.full_name, c.customer_id, a.account_number, c.user_id 
    INTO v_cust_name_s, v_cust_id_s, v_acc_num_s, v_user_s
    FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_sender_account_id;

    SELECT c.full_name, c.customer_id, a.account_number, c.user_id 
    INTO v_cust_name_r, v_cust_id_r, v_acc_num_r, v_user_r
    FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = v_actual_receiver_id;

    -- Sender Notification
    INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
    VALUES (v_cust_id_s, v_user_s, 'TXN_ALERT', 'EMAIL', 
        json_build_object(
            'customer_name', v_cust_name_s,
            'txn_type', 'TRANSFER_DEBIT',
            'amount', p_amount,
            'balance_after', v_sender_balance - p_amount,
            'txn_id', v_debit_txn_id,
            'txn_timestamp', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'account_number', v_acc_num_s
        )::text
    );

    -- Receiver Notification
    INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
    VALUES (v_cust_id_r, v_user_r, 'TXN_ALERT', 'EMAIL', 
        json_build_object(
            'customer_name', v_cust_name_r,
            'txn_type', 'TRANSFER_CREDIT',
            'amount', p_amount,
            'balance_after', (SELECT balance FROM ACCOUNTS WHERE account_id = v_actual_receiver_id),
            'txn_id', v_credit_txn_id,
            'txn_timestamp', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'account_number', v_acc_num_r
        )::text
    );
END;
$$;

-- 2. Deposit
CREATE OR REPLACE PROCEDURE sp_deposit (
    p_account_id VARCHAR,
    p_amount NUMERIC,
    p_teller_id VARCHAR
) LANGUAGE plpgsql AS $$
DECLARE
    v_balance NUMERIC;
    v_status VARCHAR(10);
    v_cust_name VARCHAR(100);
    v_cust_id VARCHAR(20);
    v_acc_num VARCHAR(18);
    v_user UUID;
BEGIN
    SELECT balance, status INTO v_balance, v_status
    FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found.';
    END IF;

    IF v_status NOT IN ('ACTIVE', 'DORMANT') THEN
        RAISE EXCEPTION 'Account is %. Cannot deposit.', v_status;
    END IF;

    UPDATE ACCOUNTS SET balance = balance + p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_account_id, 'CREDIT', p_amount, v_balance + p_amount, p_teller_id);
    
    -- Notification
    SELECT c.full_name, c.customer_id, a.account_number, c.user_id 
    INTO v_cust_name, v_cust_id, v_acc_num, v_user
    FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_account_id;

    INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
    VALUES (v_cust_id, v_user, 'TXN_ALERT', 'EMAIL', 
        json_build_object(
            'customer_name', v_cust_name,
            'txn_type', 'CREDIT',
            'amount', p_amount,
            'balance_after', v_balance + p_amount,
            'txn_id', 'DEP-' || floor(random() * 9000 + 1000)::text,
            'txn_timestamp', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'account_number', v_acc_num
        )::text
    );
END;
$$;

-- 3. Withdraw
CREATE OR REPLACE PROCEDURE sp_withdraw (
    p_account_id VARCHAR,
    p_amount NUMERIC,
    p_teller_id VARCHAR
) LANGUAGE plpgsql AS $$
DECLARE
    v_balance NUMERIC;
    v_min NUMERIC;
    v_status VARCHAR(10);
    v_cust_name VARCHAR(100);
    v_cust_id VARCHAR(20);
    v_acc_num VARCHAR(18);
    v_user UUID;
BEGIN
    -- WAIT logic in PG is handled differently, standard SELECT FOR UPDATE blocks
    SELECT balance, minimum_balance, status INTO v_balance, v_min, v_status
    FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found.';
    END IF;

    IF v_status != 'ACTIVE' THEN
        RAISE EXCEPTION 'Account is %. Cannot withdraw.', v_status;
    END IF;

    IF v_balance - p_amount < v_min THEN
        RAISE EXCEPTION 'Insufficient funds. Minimum balance must be maintained.' USING ERRCODE = 'P0001';
    END IF;

    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_account_id, 'DEBIT', p_amount, v_balance - p_amount, p_teller_id);
    
    -- Notification
    SELECT c.full_name, c.customer_id, a.account_number, c.user_id 
    INTO v_cust_name, v_cust_id, v_acc_num, v_user
    FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_account_id;

    INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
    VALUES (v_cust_id, v_user, 'TXN_ALERT', 'EMAIL', 
        json_build_object(
            'customer_name', v_cust_name,
            'txn_type', 'DEBIT',
            'amount', p_amount,
            'balance_after', v_balance - p_amount,
            'txn_id', 'WTH-' || floor(random() * 9000 + 1000)::text,
            'txn_timestamp', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'account_number', v_acc_num
        )::text
    );
END;
$$;

-- 4. Open Account
CREATE OR REPLACE PROCEDURE sp_open_account (
    p_customer_id VARCHAR,
    p_type_id INTEGER,
    p_initial_deposit NUMERIC,
    p_teller_id VARCHAR,
    p_home_branch_id VARCHAR
) LANGUAGE plpgsql AS $$
DECLARE
    v_account_id VARCHAR(20);
    v_account_number VARCHAR(18);
BEGIN
    v_account_id := 'ACC-' || p_home_branch_id || '-' || floor(random() * 9000 + 1000)::text;
    v_account_number := '00' || p_type_id || to_char(now(), 'YYYYMMDD') || floor(random() * 9000 + 1000)::text;

    INSERT INTO ACCOUNTS (account_id, account_number, customer_id, account_type_id, home_branch_id, balance, status, opened_date)
    VALUES (v_account_id, v_account_number, p_customer_id, p_type_id, p_home_branch_id, p_initial_deposit, 'ACTIVE', CURRENT_DATE);

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
    VALUES (v_account_id, 'CREDIT', p_initial_deposit, p_initial_deposit, p_teller_id, 'Initial Deposit');
END;
$$;
