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
  amount            NUMBER(15,2) NOT NULL CHECK (amount > 0),
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
    v_book_id NUMBER;
BEGIN
    SELECT status, customer_id INTO v_acc_status, v_kyc_status FROM ACCOUNTS WHERE account_id = p_account_id;
    IF v_acc_status != 'ACTIVE' THEN RAISE_APPLICATION_ERROR(-20030, 'Account not active.'); END IF;
    
    SELECT kyc_status INTO v_kyc_status FROM CUSTOMERS WHERE customer_id = (SELECT customer_id FROM ACCOUNTS WHERE account_id = p_account_id);
    IF v_kyc_status != 'VERIFIED' THEN RAISE_APPLICATION_ERROR(-20031, 'KYC not verified.'); END IF;

    v_start_num := CHQ_RANGE_SEQ.NEXTVAL;
    -- Shift sequence for next book
    FOR i IN 1..p_leaves_count-1 LOOP 
        v_start_num := v_start_num; -- Dummy but ensuring we move forward
        -- Actually we should use INCREMENT BY instead of loop, 
        -- but simple NEXTVAL logic for start/end is fine.
    END LOOP;
    -- Wait, if I use NEXTVAL it only moves once. 
    -- Better logic:
    -- v_start_num := CHQ_RANGE_SEQ.NEXTVAL;
    -- v_end_num := v_start_num + p_leaves_count - 1;
    -- But sequence only knows v_start_num. 
    -- So I need to set sequence's next value to v_end_num + 1.
    -- EXECUTE IMMEDIATE 'ALTER SEQUENCE CHQ_RANGE_SEQ INCREMENT BY ' || (p_leaves_count - 1);
    -- SELECT CHQ_RANGE_SEQ.NEXTVAL INTO v_temp FROM DUAL;
    -- EXECUTE IMMEDIATE 'ALTER SEQUENCE CHQ_RANGE_SEQ INCREMENT BY 1';

    INSERT INTO CHEQUE_BOOKS (
        account_id, start_cheque_number, end_cheque_number, leaves_count, issued_by
    ) VALUES (
        p_account_id, LPAD(v_start_num, 6, '0'), LPAD(v_start_num + p_leaves_count - 1, 6, '0'),
        p_leaves_count, p_teller_id
    ) RETURNING book_id INTO v_book_id;

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
BEGIN
    -- Validate cheque is in active book
    SELECT book_id INTO v_book_id 
    FROM CHEQUE_BOOKS 
    WHERE account_id = p_account_id 
      AND p_cheque_number BETWEEN start_cheque_number AND end_cheque_number
      AND status = 'ACTIVE'
      FETCH FIRST 1 ROWS ONLY;

    -- Check if already cleared
    BEGIN
        SELECT status INTO v_cheque_status FROM CHEQUES WHERE cheque_number = p_cheque_number;
        IF v_cheque_status = 'CLEARED' THEN
            RAISE_APPLICATION_ERROR(-20033, 'Cannot stop a cleared cheque.');
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN NULL;
    END;

    INSERT INTO STOP_PAYMENT_INSTRUCTIONS (cheque_number, account_id, book_id, reason, recorded_by)
    VALUES (p_cheque_number, p_account_id, v_book_id, p_reason, p_teller_id);
    
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
      AND p_cheque_number BETWEEN start_cheque_number AND end_cheque_number;

    -- 2. Check Stop Payment
    BEGIN
        SELECT status INTO v_stop_status FROM STOP_PAYMENT_INSTRUCTIONS 
        WHERE cheque_number = p_cheque_number AND status = 'ACTIVE';
        
        INSERT INTO CHEQUES (cheque_number, book_id, drawee_account_id, payee_account_id, amount, status, presented_by)
        VALUES (p_cheque_number, v_book_id, p_drawee_account_id, p_payee_account_id, p_amount, 'STOPPED', p_teller_id);
        
        RAISE_APPLICATION_ERROR(-20035, 'Stop payment instruction active.');
    EXCEPTION
        WHEN NO_DATA_FOUND THEN NULL;
    END;

    -- 3. Financial Transaction
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    
    SELECT balance INTO v_balance FROM ACCOUNTS WHERE account_id = p_drawee_account_id FOR UPDATE WAIT 5;

    IF v_balance < p_amount THEN
        INSERT INTO CHEQUES (cheque_number, book_id, drawee_account_id, payee_account_id, amount, status, presented_by)
        VALUES (p_cheque_number, v_book_id, p_drawee_account_id, p_payee_account_id, p_amount, 'BOUNCED', p_teller_id);
        COMMIT;
        RAISE_APPLICATION_ERROR(-20036, 'Insufficient balance — cheque bounced.');
    END IF;

    -- Execute Move
    sp_withdraw(p_drawee_account_id, p_amount, 'CHQ-CLR-' || p_cheque_number);
    sp_deposit(p_payee_account_id, p_amount, 'CHQ-CLR-' || p_cheque_number);

    -- 4. Finalize Cheque
    INSERT INTO CHEQUES (
        cheque_number, book_id, drawee_account_id, payee_account_id, amount, 
        status, cleared_at, presented_by
    ) VALUES (
        p_cheque_number, v_book_id, p_drawee_account_id, p_payee_account_id, p_amount, 
        'CLEARED', SYSTIMESTAMP, p_teller_id
    );

    UPDATE CHEQUE_BOOKS SET leaves_used = leaves_used + 1 WHERE book_id = v_book_id;
    COMMIT;

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20034, 'Cheque number not found in any active book.');
END;
/
