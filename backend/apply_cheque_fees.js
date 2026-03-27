const oracledb = require('oracledb');
require('dotenv').config({ path: './.env' });

const spDeduct = `CREATE OR REPLACE PROCEDURE sp_deduct_service_charges (
    p_account_id IN VARCHAR2,
    p_fee_type IN VARCHAR2
) AS
    v_fee_amt NUMBER;
    v_teller_id VARCHAR2(20) := 'SYSTEM_FEE';
BEGIN
    SELECT fee_amount INTO v_fee_amt FROM FEE_SCHEDULE WHERE fee_id = p_fee_type;
    
    IF v_fee_amt > 0 THEN
        sp_withdraw(p_account_id, v_fee_amt, v_teller_id);
    END IF;
    COMMIT;
END;`;

const spIssue = `CREATE OR REPLACE PROCEDURE sp_issue_cheque_book (
    p_account_id IN VARCHAR2,
    p_leaves_count IN NUMBER,
    p_teller_id IN VARCHAR2
) AS
    v_acc_status VARCHAR2(10);
    v_kyc_status VARCHAR2(20);
    v_start_num NUMBER;
    v_end_num NUMBER;
    v_book_id NUMBER;
    v_overlap_count NUMBER;
    v_last_end VARCHAR2(10);
    v_temp NUMBER;
BEGIN
    SELECT status INTO v_acc_status FROM ACCOUNTS WHERE account_id = p_account_id;
    IF v_acc_status != 'ACTIVE' THEN RAISE_APPLICATION_ERROR(-20030, 'Account not active.'); END IF;
    
    SELECT kyc_status INTO v_kyc_status FROM CUSTOMERS WHERE customer_id = (SELECT customer_id FROM ACCOUNTS WHERE account_id = p_account_id);
    IF v_kyc_status != 'VERIFIED' THEN RAISE_APPLICATION_ERROR(-20031, 'KYC not verified.'); END IF;

    BEGIN
        SELECT MAX(end_cheque_number) INTO v_last_end FROM CHEQUE_BOOKS;
        IF v_last_end IS NOT NULL THEN
            v_start_num := TO_NUMBER(v_last_end) + 1;
        ELSE
            v_start_num := CHQ_RANGE_SEQ.NEXTVAL;
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            v_start_num := CHQ_RANGE_SEQ.NEXTVAL;
    END;
    
    v_end_num := v_start_num + p_leaves_count - 1;

    LOOP
        SELECT CHQ_RANGE_SEQ.NEXTVAL INTO v_temp FROM DUAL;
        EXIT WHEN v_temp >= v_end_num;
    END LOOP;

    SELECT COUNT(*) INTO v_overlap_count 
    FROM CHEQUE_BOOKS 
    WHERE status = 'ACTIVE'
      AND (
        (v_start_num BETWEEN TO_NUMBER(start_cheque_number) AND TO_NUMBER(end_cheque_number)) OR
        (v_end_num BETWEEN TO_NUMBER(start_cheque_number) AND TO_NUMBER(end_cheque_number)) OR
        (TO_NUMBER(start_cheque_number) BETWEEN v_start_num AND v_end_num)
      );

    IF v_overlap_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20037, 'Continuity Breach: Range overlaps with an existing book. System configuration requires review.');
    END IF;

    INSERT INTO CHEQUE_BOOKS (
        account_id, start_cheque_number, end_cheque_number, leaves_count, issued_by
    ) VALUES (
        p_account_id, LPAD(v_start_num, 6, '0'), LPAD(v_end_num, 6, '0'),
        p_leaves_count, p_teller_id
    ) RETURNING book_id INTO v_book_id;

    sp_deduct_service_charges(p_account_id, 'CHEQUE_BOOK_ISSUE');

    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_user_id RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, c.user_id 
        INTO v_cust_name, v_cust_id, v_user_id
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id 
        WHERE a.account_id = p_account_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user_id, 'CHQ_BOOK_ISSUED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'account_id' VALUE p_account_id,
                'start_num' VALUE LPAD(v_start_num, 6, '0'),
                'end_num' VALUE LPAD(v_end_num, 6, '0'),
                'leaves' VALUE p_leaves_count
            )
        );
    END;

    COMMIT;
END;`;

(async () => {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });
        await conn.execute(spDeduct);
        console.log("sp_deduct_service_charges recompiled.");
        await conn.execute(spIssue);
        console.log("sp_issue_cheque_book recompiled.");
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
})();
