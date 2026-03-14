-- SafeVault PostgreSQL Procedures Part 2: Approvals, External Transfers & Admin
-- Converted from Oracle 21c

-- 5. Initiate External Transfer
CREATE OR REPLACE PROCEDURE sp_initiate_external_transfer (
    p_account_id VARCHAR,
    p_amount NUMERIC,
    p_ifsc VARCHAR,
    p_acc_no VARCHAR,
    p_mode VARCHAR,
    p_initiated_by VARCHAR
) LANGUAGE plpgsql AS $$
DECLARE
    v_balance NUMERIC;
    v_min NUMERIC;
    v_status VARCHAR(10);
    v_cust_name VARCHAR(100);
    v_cust_id VARCHAR(20);
    v_user UUID;
BEGIN
    SELECT balance, minimum_balance, status INTO v_balance, v_min, v_status
    FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;

    IF v_status != 'ACTIVE' THEN
        RAISE EXCEPTION 'Account is not ACTIVE.';
    END IF;

    IF v_balance - p_amount < v_min THEN
        RAISE EXCEPTION 'Insufficient funds.';
    END IF;

    -- Escrow Funds (Deduct immediately)
    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, status)
    VALUES (p_account_id, 'EXTERNAL_DEBIT', p_amount, v_balance - p_amount, p_initiated_by, 'PENDING');

    INSERT INTO PENDING_EXTERNAL_TRANSFERS (source_account_id, amount, destination_ifsc, destination_account, transfer_mode, initiated_by)
    VALUES (p_account_id, p_amount, p_ifsc, p_acc_no, p_mode, p_initiated_by);

    -- Notification
    SELECT c.full_name, c.customer_id, c.user_id 
    INTO v_cust_name, v_cust_id, v_user
    FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id 
    WHERE a.account_id = p_account_id;

    INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
    VALUES (v_cust_id, v_user, 'EXT_TXN_INITIATED', 'EMAIL', 
        json_build_object(
            'customer_name', v_cust_name,
            'amount', p_amount,
            'dest_acc', p_acc_no,
            'status', 'PENDING'
        )::text
    );
END;
$$;

-- 6. Approve External Transfer
CREATE OR REPLACE PROCEDURE sp_approve_external_transfer (
    p_transfer_id UUID,
    p_manager_id VARCHAR
) LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(15);
    v_utr VARCHAR(30);
    v_cust_name VARCHAR(100);
    v_cust_id VARCHAR(20);
    v_user UUID;
    v_amt NUMERIC;
    v_dest VARCHAR(20);
BEGIN
    SELECT status INTO v_status FROM PENDING_EXTERNAL_TRANSFERS WHERE transfer_id = p_transfer_id FOR UPDATE;

    IF v_status != 'PENDING' THEN
        RAISE EXCEPTION 'Transfer is not PENDING.';
    END IF;

    v_utr := 'RTGS' || to_char(now(), 'YYYYMMDD') || lpad(floor(random() * 999999 + 1)::text, 6, '0');

    UPDATE PENDING_EXTERNAL_TRANSFERS 
    SET status = 'SETTLED', settled_at = CURRENT_TIMESTAMP, settlement_reference = v_utr
    WHERE transfer_id = p_transfer_id;

    UPDATE TRANSACTIONS SET status = 'COMPLETED'
    WHERE transaction_type = 'EXTERNAL_DEBIT' 
      AND linked_transfer_id = p_transfer_id;

    -- Notification
    SELECT c.full_name, c.customer_id, c.user_id, p.amount, p.destination_account
    INTO v_cust_name, v_cust_id, v_user, v_amt, v_dest
    FROM CUSTOMERS c 
    JOIN ACCOUNTS a ON c.customer_id = a.customer_id
    JOIN PENDING_EXTERNAL_TRANSFERS p ON a.account_id = p.source_account_id
    WHERE p.transfer_id = p_transfer_id;

    INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
    VALUES (v_cust_id, v_user, 'EXT_TXN_APPROVED', 'EMAIL', 
        json_build_object(
            'customer_name', v_cust_name,
            'amount', v_amt,
            'dest_acc', v_dest,
            'utr', v_utr
        )::text
    );
END;
$$;

-- 7. Submit Dual Approval
CREATE OR REPLACE PROCEDURE sp_submit_dual_approval (
    p_operation_type VARCHAR,
    p_payload_json TEXT,
    p_requested_by_username VARCHAR
) LANGUAGE plpgsql AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT user_id INTO v_user_id FROM USERS WHERE LOWER(username) = LOWER(p_requested_by_username);
    
    INSERT INTO DUAL_APPROVAL_QUEUE (requested_by, operation_type, payload_json, status)
    VALUES (v_user_id, p_operation_type, p_payload_json, 'PENDING');
END;
$$;

-- 8. Set Account Status (Manager Only)
CREATE OR REPLACE PROCEDURE sp_set_account_status (
    p_account_id VARCHAR,
    p_new_status VARCHAR,
    p_manager_id VARCHAR,
    p_reason TEXT
) LANGUAGE plpgsql AS $$
BEGIN
    -- Equivalent to DBMS_SESSION.SET_CONTEXT
    PERFORM set_config('suraksha.change_reason', p_reason, false);
    
    UPDATE ACCOUNTS SET status = p_new_status WHERE account_id = p_account_id;
END;
$$;
