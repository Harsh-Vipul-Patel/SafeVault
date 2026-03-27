-- Fixes for ORA-01403 in sp_approve_external_transfer
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
        FROM PENDING_EXTERNAL_TRANSFERS p
        JOIN ACCOUNTS a ON p.source_account_id = a.account_id -- Corrected JOIN condition
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

-- Allow Manager to receive OTPs
ALTER TABLE EMPLOYEES ADD (email VARCHAR2(100));
UPDATE EMPLOYEES SET email = 'kingharsh271@gmail.com' WHERE email IS NULL;
COMMIT;
