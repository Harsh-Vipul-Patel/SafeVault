-- Fix Manager Email
UPDATE EMPLOYEES SET email = 'harsh2712006@gmail.com' WHERE role = 'BRANCH_MANAGER';
COMMIT;

PROMPT Manager email updated to harsh2712006@gmail.com.
PROMPT Recompiling Stored Procedures for Audit Logging...

-- 1. sp_set_account_status
CREATE OR REPLACE PROCEDURE sp_set_account_status (
    p_account_id IN VARCHAR2,
    p_new_status IN VARCHAR2,
    p_manager_id IN VARCHAR2,
    p_reason IN VARCHAR2
) AS
    v_old_status VARCHAR2(10);
BEGIN
    SELECT status INTO v_old_status FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;
    
    UPDATE ACCOUNTS SET status = p_new_status WHERE account_id = p_account_id;
    
    INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, old_value_json, new_value_json, change_reason)
    VALUES ('ACCOUNTS', p_account_id, 'STATUS_CHANGE', NVL(p_manager_id, 'SYSTEM'), 
            JSON_OBJECT('status' VALUE v_old_status), 
            JSON_OBJECT('status' VALUE p_new_status), 
            p_reason);
            
    COMMIT;
END;
/

-- 2. sp_approve_external_transfer
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

    -- Notice: the old value is PENDING, new is SETTLED
    INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, old_value_json, new_value_json, change_reason)
    VALUES ('PENDING_EXTERNAL_TRANSFERS', RAWTOHEX(p_transfer_id), 'APPROVE_TRANSFER', NVL(p_manager_id, 'SYSTEM'), 
            JSON_OBJECT('status' VALUE 'PENDING'), 
            JSON_OBJECT('status' VALUE 'SETTLED', 'settlement_reference' VALUE v_utr), 
            'Manager Approved External Transfer');

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
        FROM PENDING_EXTERNAL_TRANSFERS p
        JOIN ACCOUNTS a ON p.source_account_id = a.account_id
        JOIN CUSTOMERS c ON a.customer_id = c.customer_id
        WHERE p.transfer_id = p_transfer_id;

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

-- 3. sp_reject_external_transfer
CREATE OR REPLACE PROCEDURE sp_reject_external_transfer (
    p_transfer_id IN RAW,
    p_manager_id IN VARCHAR2,
    p_rejection_reason IN VARCHAR2
) AS
    v_status VARCHAR2(15);
    v_source_acc VARCHAR2(20);
    v_amount NUMBER;
BEGIN
    SELECT status, source_account_id, amount 
    INTO v_status, v_source_acc, v_amount
    FROM PENDING_EXTERNAL_TRANSFERS 
    WHERE transfer_id = p_transfer_id FOR UPDATE;

    IF v_status != 'PENDING' THEN
        RAISE_APPLICATION_ERROR(-20004, 'Transfer is not PENDING.');
    END IF;

    -- Update transfer status
    UPDATE PENDING_EXTERNAL_TRANSFERS 
    SET status = 'REJECTED', 
        rejected_at = SYSTIMESTAMP, 
        rejection_reason = p_rejection_reason
    WHERE transfer_id = p_transfer_id;

    -- Reverse the escrowed funds
    UPDATE ACCOUNTS 
    SET balance = balance + v_amount 
    WHERE account_id = v_source_acc;

    -- Mark original debit transaction as FAILED
    UPDATE TRANSACTIONS 
    SET status = 'FAILED', description = description || ' (REJECTED: ' || p_rejection_reason || ')'
    WHERE transaction_type = 'EXTERNAL_DEBIT' 
      AND linked_transfer_id = p_transfer_id;

    -- Log the reversal as a credit adjustment
    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, status, description, linked_transfer_id)
    VALUES (v_source_acc, 'TRANSFER_CREDIT', v_amount, (SELECT balance FROM ACCOUNTS WHERE account_id = v_source_acc), p_manager_id, 'COMPLETED', 'Reversal for Rejected External Transfer', p_transfer_id);

    INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, old_value_json, new_value_json, change_reason)
    VALUES ('PENDING_EXTERNAL_TRANSFERS', RAWTOHEX(p_transfer_id), 'REJECT_TRANSFER', NVL(p_manager_id, 'SYSTEM'), 
            JSON_OBJECT('status' VALUE 'PENDING'), 
            JSON_OBJECT('status' VALUE 'REJECTED'), 
            p_rejection_reason);

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/

-- 4. sp_approve_dual_queue
CREATE OR REPLACE PROCEDURE sp_approve_dual_queue (
    p_queue_id IN RAW,
    p_manager_id IN VARCHAR2,
    p_review_note IN VARCHAR2
) AS
    v_status VARCHAR2(20);
BEGIN
    SELECT status INTO v_status FROM DUAL_APPROVAL_QUEUE WHERE queue_id = p_queue_id FOR UPDATE;

    IF v_status != 'PENDING' THEN
        RAISE_APPLICATION_ERROR(-20005, 'Queue item is not PENDING.');
    END IF;

    UPDATE DUAL_APPROVAL_QUEUE
    SET status = 'APPROVED',
        reviewed_by = p_manager_id,
        reviewed_at = SYSTIMESTAMP,
        review_note = p_review_note
    WHERE queue_id = p_queue_id;

    INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, old_value_json, new_value_json, change_reason)
    VALUES ('DUAL_APPROVAL_QUEUE', RAWTOHEX(p_queue_id), 'APPROVE_QUEUE_ITEM', NVL(p_manager_id, 'SYSTEM'), 
            JSON_OBJECT('status' VALUE 'PENDING'), 
            JSON_OBJECT('status' VALUE 'APPROVED'), 
            p_review_note);

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/

-- 5. sp_reject_dual_queue
CREATE OR REPLACE PROCEDURE sp_reject_dual_queue (
    p_queue_id IN RAW,
    p_manager_id IN VARCHAR2,
    p_review_note IN VARCHAR2
) AS
    v_status VARCHAR2(20);
BEGIN
    SELECT status INTO v_status FROM DUAL_APPROVAL_QUEUE WHERE queue_id = p_queue_id FOR UPDATE;

    IF v_status != 'PENDING' THEN
        RAISE_APPLICATION_ERROR(-20005, 'Queue item is not PENDING.');
    END IF;

    UPDATE DUAL_APPROVAL_QUEUE
    SET status = 'REJECTED',
        reviewed_by = p_manager_id,
        reviewed_at = SYSTIMESTAMP,
        review_note = p_review_note
    WHERE queue_id = p_queue_id;

    INSERT INTO AUDIT_LOG (table_name, record_id, operation, changed_by, old_value_json, new_value_json, change_reason)
    VALUES ('DUAL_APPROVAL_QUEUE', RAWTOHEX(p_queue_id), 'REJECT_QUEUE_ITEM', NVL(p_manager_id, 'SYSTEM'), 
            JSON_OBJECT('status' VALUE 'PENDING'), 
            JSON_OBJECT('status' VALUE 'REJECTED'), 
            p_review_note);

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/

PROMPT Audit Log Procedures Compiled Successfully!
