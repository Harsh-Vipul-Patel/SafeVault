-- Suraksha Bank — Cheque Book and Stop Payment (Oracle 21c)

-- 1. Tables
CREATE TABLE CHEQUE_BOOKS (
  book_id             NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id          VARCHAR2(20) NOT NULL REFERENCES ACCOUNTS(account_id),
  start_cheque_number VARCHAR2(10) NOT NULL,
  end_cheque_number   VARCHAR2(10) NOT NULL,
  leaves_count        NUMBER(3) NOT NULL,
  leaves_used         NUMBER(3) DEFAULT 0 NOT NULL,
  issued_by           VARCHAR2(20) NOT NULL REFERENCES EMPLOYEES(employee_id),
  issued_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  status              VARCHAR2(10) DEFAULT 'ACTIVE' NOT NULL
                      CHECK (status IN ('ACTIVE','EXHAUSTED','CANCELLED')),
  CONSTRAINT uq_chq_start UNIQUE (start_cheque_number),
  CONSTRAINT chk_chq_range CHECK (end_cheque_number > start_cheque_number)
);

CREATE SEQUENCE CHQ_RANGE_SEQ START WITH 100001 INCREMENT BY 1 NOCACHE;

CREATE TABLE CHEQUES (
  cheque_id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cheque_number     VARCHAR2(10) NOT NULL,
  book_id           NUMBER NOT NULL REFERENCES CHEQUE_BOOKS(book_id),
  drawee_account_id VARCHAR2(20) REFERENCES ACCOUNTS(account_id),
  payee_account_id  VARCHAR2(20) REFERENCES ACCOUNTS(account_id),
  payee_name        VARCHAR2(150),
  amount            NUMBER(15,2) NOT NULL CHECK (amount >= 0),
  presented_at      TIMESTAMP WITH TIME ZONE,
  cleared_at        TIMESTAMP WITH TIME ZONE,
  status            VARCHAR2(12) DEFAULT 'PRESENTED' NOT NULL
                    CHECK (status IN ('PRESENTED','CLEARED','BOUNCED','STOPPED')),
  debit_txn_id      NUMBER REFERENCES TRANSACTIONS(transaction_id),
  credit_txn_id     NUMBER REFERENCES TRANSACTIONS(transaction_id),
  presented_by      VARCHAR2(20) REFERENCES EMPLOYEES(employee_id),
  CONSTRAINT uq_cheque_number UNIQUE (cheque_number)
);

CREATE TABLE STOP_PAYMENT_INSTRUCTIONS (
  stop_id       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cheque_number VARCHAR2(10) NOT NULL,
  account_id    VARCHAR2(20) NOT NULL REFERENCES ACCOUNTS(account_id),
  book_id       NUMBER NOT NULL REFERENCES CHEQUE_BOOKS(book_id),
  reason        VARCHAR2(200) NOT NULL,
  recorded_by   VARCHAR2(20) NOT NULL REFERENCES EMPLOYEES(employee_id),
  status        VARCHAR2(10) DEFAULT 'ACTIVE' NOT NULL
                CHECK (status IN ('ACTIVE','REVOKED')),
  revoked_by    VARCHAR2(20) REFERENCES EMPLOYEES(employee_id),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  revoked_at    TIMESTAMP WITH TIME ZONE,
  CONSTRAINT uq_stop_cheque UNIQUE (cheque_number, status)
);

-- 2. Trigger: trg_cheque_book_validate
CREATE OR REPLACE TRIGGER trg_cheque_book_validate
BEFORE INSERT ON CHEQUES
FOR EACH ROW
DECLARE
    v_start VARCHAR2(10);
    v_end VARCHAR2(10);
    v_acc_id VARCHAR2(20);
BEGIN
    SELECT start_cheque_number, end_cheque_number, account_id 
    INTO v_start, v_end, v_acc_id
    FROM CHEQUE_BOOKS WHERE book_id = :NEW.book_id;

    IF :NEW.cheque_number < v_start OR :NEW.cheque_number > v_end THEN
        RAISE_APPLICATION_ERROR(-20034, 'Cheque number not found in this book.');
    END IF;
    
    -- Ensure drawee is correct
    :NEW.drawee_account_id := v_acc_id;
END;
/

-- 3. Procedures
CREATE OR REPLACE PROCEDURE sp_issue_cheque_book (
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
    -- 1. Validations
    SELECT status INTO v_acc_status FROM ACCOUNTS WHERE account_id = p_account_id;
    IF v_acc_status != 'ACTIVE' THEN RAISE_APPLICATION_ERROR(-20030, 'Account not active.'); END IF;
    
    SELECT kyc_status INTO v_kyc_status FROM CUSTOMERS WHERE customer_id = (SELECT customer_id FROM ACCOUNTS WHERE account_id = p_account_id);
    IF v_kyc_status != 'VERIFIED' THEN RAISE_APPLICATION_ERROR(-20031, 'KYC not verified.'); END IF;

    -- 2. Continuity Logic: Start = Last Global End + 1
    BEGIN
        SELECT MAX(end_cheque_number) INTO v_last_end FROM CHEQUE_BOOKS;
        IF v_last_end IS NOT NULL THEN
            v_start_num := TO_NUMBER(v_last_end) + 1;
        ELSE
            -- Fallback to sequence if no books exist
            v_start_num := CHQ_RANGE_SEQ.NEXTVAL;
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            v_start_num := CHQ_RANGE_SEQ.NEXTVAL;
    END;
    
    v_end_num := v_start_num + p_leaves_count - 1;

    -- 3. Sequence Synchronization (Keep global sequence ahead of used ranges)
    -- We advance the sequence to match v_end_num so other things using CHQ_RANGE_SEQ 
    -- (if any exist in the future) don't create overlaps.
    LOOP
        SELECT CHQ_RANGE_SEQ.NEXTVAL INTO v_temp FROM DUAL;
        EXIT WHEN v_temp >= v_end_num;
    END LOOP;

    -- 4. Overlap Protection (Safety check)
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

    -- 6. Notification
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
END;
/

CREATE OR REPLACE PROCEDURE sp_record_stop_payment (
    p_cheque_number IN VARCHAR2,
    p_account_id IN VARCHAR2,
    p_reason IN VARCHAR2,
    p_teller_id IN VARCHAR2
) AS
    v_book_id NUMBER;
    v_cheque_status VARCHAR2(12);
    v_cheque_exists_in_cheques BOOLEAN := FALSE;
BEGIN
    -- 1. Validate cheque is in active book
    SELECT book_id INTO v_book_id 
    FROM CHEQUE_BOOKS 
    WHERE account_id = p_account_id 
      AND p_cheque_number BETWEEN start_cheque_number AND end_cheque_number
      AND status = 'ACTIVE'
      FETCH FIRST 1 ROWS ONLY;

    -- 2. Check if already cleared or bounced
    BEGIN
        SELECT status INTO v_cheque_status FROM CHEQUES WHERE cheque_number = p_cheque_number;
        v_cheque_exists_in_cheques := TRUE;
        IF v_cheque_status IN ('CLEARED', 'BOUNCED') THEN
            RAISE_APPLICATION_ERROR(-20033, 'Cannot stop a cheque that is already ' || v_cheque_status);
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN NULL; -- Cheque not yet recorded in CHEQUES table
    END;

    -- 3. Record Instruction
    MERGE INTO STOP_PAYMENT_INSTRUCTIONS target
    USING (SELECT p_cheque_number as chq, p_account_id as acc FROM DUAL) source
    ON (target.cheque_number = source.chq AND target.account_id = source.acc AND target.status = 'ACTIVE')
    WHEN NOT MATCHED THEN
        INSERT (cheque_number, account_id, book_id, reason, recorded_by)
        VALUES (p_cheque_number, p_account_id, v_book_id, p_reason, p_teller_id);
    
    -- 4. Mark in CHEQUES table
    MERGE INTO CHEQUES target
    USING (SELECT p_cheque_number as chq, v_book_id as bid FROM DUAL) source
    ON (target.cheque_number = source.chq)
    WHEN MATCHED THEN
        UPDATE SET status = 'STOPPED' WHERE status != 'STOPPED'
    WHEN NOT MATCHED THEN
        INSERT (cheque_number, book_id, drawee_account_id, amount, status, presented_by)
        VALUES (p_cheque_number, v_book_id, p_account_id, 0, 'STOPPED', p_teller_id);

    -- 5. Update leaves_used if it was not already used
    IF NOT v_cheque_exists_in_cheques THEN
        UPDATE CHEQUE_BOOKS SET leaves_used = leaves_used + 1 WHERE book_id = v_book_id;
    END IF;

    COMMIT;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20032, 'Cheque number not in active book range.');
END;
/

CREATE OR REPLACE PROCEDURE sp_process_cheque_clearing (
    p_cheque_number IN VARCHAR2,
    p_drawee_account_id IN VARCHAR2,
    p_payee_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_teller_id IN VARCHAR2
) AS
    v_book_id NUMBER;
    v_stop_status VARCHAR2(10);
    v_balance NUMBER;
BEGIN
    -- 1. Validate Cheque Book
    SELECT book_id INTO v_book_id 
    FROM CHEQUE_BOOKS 
    WHERE account_id = p_drawee_account_id 
      AND p_cheque_number BETWEEN start_cheque_number AND end_cheque_number
      AND status = 'ACTIVE'
      FETCH FIRST 1 ROWS ONLY;

    -- 2. Check Stop Payment
    BEGIN
        SELECT status INTO v_stop_status FROM STOP_PAYMENT_INSTRUCTIONS 
        WHERE cheque_number = p_cheque_number AND status = 'ACTIVE'
        FETCH FIRST 1 ROWS ONLY;
        
        -- Mark as stopped if not already
        MERGE INTO CHEQUES target
        USING (SELECT p_cheque_number as chq FROM DUAL) source
        ON (target.cheque_number = source.chq)
        WHEN MATCHED THEN
            UPDATE SET status = 'STOPPED'
        WHEN NOT MATCHED THEN
            INSERT (cheque_number, book_id, drawee_account_id, payee_account_id, amount, status, presented_by)
            VALUES (p_cheque_number, v_book_id, p_drawee_account_id, p_payee_account_id, p_amount, 'STOPPED', p_teller_id);
        
        RAISE_APPLICATION_ERROR(-20035, 'Stop payment instruction active for cheque #' || p_cheque_number);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN NULL;
    END;

    -- 3. Financial Transaction
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    
    SELECT balance INTO v_balance FROM ACCOUNTS WHERE account_id = p_drawee_account_id FOR UPDATE WAIT 5;

    IF v_balance < p_amount THEN
        MERGE INTO CHEQUES target
        USING (SELECT p_cheque_number as chq FROM DUAL) source
        ON (target.cheque_number = source.chq)
        WHEN MATCHED THEN
            UPDATE SET status = 'BOUNCED', amount = p_amount, payee_account_id = p_payee_account_id
        WHEN NOT MATCHED THEN
            INSERT (cheque_number, book_id, drawee_account_id, payee_account_id, amount, status, presented_by)
            VALUES (p_cheque_number, v_book_id, p_drawee_account_id, p_payee_account_id, p_amount, 'BOUNCED', p_teller_id);
            
        COMMIT;
        RAISE_APPLICATION_ERROR(-20036, 'Insufficient balance — cheque #' || p_cheque_number || ' bounced.');
    END IF;

    -- Execute Move
    sp_withdraw(p_drawee_account_id, p_amount, 'CHQ-CLR-' || p_cheque_number);
    sp_deposit(p_payee_account_id, p_amount, 'CHQ-CLR-' || p_cheque_number);

    -- 4. Finalize Cheque
    MERGE INTO CHEQUES target
    USING (SELECT p_cheque_number as chq FROM DUAL) source
    ON (target.cheque_number = source.chq)
    WHEN MATCHED THEN
        UPDATE SET status = 'CLEARED', cleared_at = SYSTIMESTAMP, amount = p_amount, payee_account_id = p_payee_account_id
    WHEN NOT MATCHED THEN
        INSERT (
            cheque_number, book_id, drawee_account_id, payee_account_id, amount, 
            status, cleared_at, presented_by
        ) VALUES (
            p_cheque_number, v_book_id, p_drawee_account_id, p_payee_account_id, p_amount, 
            'CLEARED', SYSTIMESTAMP, p_teller_id
        );

    -- Increment usage only if it wasn't already in CHEQUES (e.g. presented)
    -- Actually, if it's already there, it might have been STOPPED or BOUNCED before and now we are clearing it?
    -- No, cleared logic should check.
    UPDATE CHEQUE_BOOKS SET leaves_used = leaves_used + 1 WHERE book_id = v_book_id;
    COMMIT;

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20034, 'Cheque number not found in any active book range.');
END;
/
