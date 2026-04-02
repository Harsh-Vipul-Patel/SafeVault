-- Suraksha Bank Safe Vault System
-- Database Procedures Part 2: Approvals, External Transfers & Admin (Oracle 21c)

    -- 5. Initiate External Transfer
CREATE OR REPLACE PROCEDURE sp_initiate_external_transfer (
    p_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_ifsc IN VARCHAR2,
    p_acc_no IN VARCHAR2,
    p_mode IN VARCHAR2,
    p_initiated_by IN VARCHAR2
) AS
    v_balance NUMBER;
    v_min NUMBER;
    v_status VARCHAR2(10);
    v_fee NUMBER;
BEGIN
    SELECT balance, minimum_balance, status INTO v_balance, v_min, v_status
    FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;

    IF v_status != 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20003, 'Account is not ACTIVE.');
    END IF;

    -- Calculate Fee First
    v_fee := fn_calculate_fee(p_mode, p_amount);

    -- Check balance including transfer amount and fee
    IF v_balance - p_amount - v_fee < v_min THEN
        RAISE_APPLICATION_ERROR(-20001, 'Insufficient funds (Amount + Fee: ' || (p_amount + v_fee) || ').');
    END IF;

    -- Escrow Funds (Deduct immediately)
    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, status)
    VALUES (p_account_id, 'EXTERNAL_DEBIT', p_amount, v_balance - p_amount, p_initiated_by, 'PENDING');

    -- Fee Deduction
    IF v_fee > 0 THEN
        UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_account_id;
        INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
        VALUES (p_account_id, 'FEE_DEBIT', v_fee, v_balance - p_amount - v_fee, 'SYSTEM', p_mode || ' Transfer Fee');
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

-- 6. Approve External Transfer
CREATE OR REPLACE PROCEDURE sp_approve_external_transfer (
    p_transfer_id IN RAW,
    p_manager_id IN VARCHAR2
) AS
    v_status VARCHAR2(15);
    v_utr VARCHAR2(30);
BEGIN
    SELECT status INTO v_status FROM PENDING_EXTERNAL_TRANSFERS WHERE transfer_id = p_transfer_id FOR UPDATE;

    IF v_status != 'PENDING' THEN
        RAISE_APPLICATION_ERROR(-20004, 'Transfer is not PENDING.');
    END IF;

    v_utr := 'RTGS' || TO_CHAR(SYSDATE, 'YYYYMMDD') || LPAD(ROUND(DBMS_RANDOM.VALUE(1, 999999)), 6, '0');

    UPDATE PENDING_EXTERNAL_TRANSFERS 
    SET status = 'SETTLED', settled_at = SYSTIMESTAMP, settlement_reference = v_utr
    WHERE transfer_id = p_transfer_id;

    UPDATE TRANSACTIONS SET status = 'COMPLETED'
    WHERE transaction_type = 'EXTERNAL_DEBIT' 
      AND linked_transfer_id = p_transfer_id;

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_user RAW(16);
        v_amt NUMBER;
        v_dest VARCHAR2(20);
    BEGIN
        SELECT c.full_name, c.customer_id, c.user_id, p.amount, p.destination_account
        INTO v_cust_name, v_cust_id, v_user, v_amt, v_dest
        FROM CUSTOMERS c 
        JOIN PENDING_EXTERNAL_TRANSFERS p ON c.customer_id = p.source_account_id -- Simplified: assumes source_account_id = customer_id? No, need to join via ACCOUNTS
        JOIN ACCOUNTS a ON c.customer_id = a.customer_id
        WHERE p.transfer_id = p_transfer_id AND a.account_id = p.source_account_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'EXT_TXN_APPROVED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'amount' VALUE v_amt,
                'dest_acc' VALUE v_dest,
                'utr' VALUE v_utr
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

-- 7. Submit Dual Approval
CREATE OR REPLACE PROCEDURE sp_submit_dual_approval (
    p_operation_type IN VARCHAR2,
    p_payload_clob IN CLOB,
    p_requested_by_username IN VARCHAR2
) AS
    v_user_id RAW(16);
BEGIN
    SELECT user_id INTO v_user_id FROM USERS WHERE LOWER(username) = LOWER(p_requested_by_username);
    
    INSERT INTO DUAL_APPROVAL_QUEUE (requested_by, operation_type, payload_json, status)
    VALUES (v_user_id, p_operation_type, p_payload_clob, 'PENDING');
    COMMIT;
END;

/

-- 8. Set Account Status (Manager Only)
CREATE OR REPLACE PROCEDURE sp_set_account_status (
    p_account_id IN VARCHAR2,
    p_new_status IN VARCHAR2,
    p_manager_id IN VARCHAR2,
    p_reason IN VARCHAR2
) AS
BEGIN
    -- Authorization check should be at app layer, but setting context here enables triggers to log reason
    DBMS_SESSION.SET_CONTEXT('SURAKSHA_CTX', 'change_reason', p_reason);
    
    UPDATE ACCOUNTS SET status = p_new_status WHERE account_id = p_account_id;
    COMMIT;
END;
/
