-- Create the Batch sequence
BEGIN
    EXECUTE IMMEDIATE 'CREATE SEQUENCE SEQ_BATCH_RUN START WITH 1000 INCREMENT BY 1';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- Create the required Batch Job Status table
BEGIN
    EXECUTE IMMEDIATE '
    CREATE TABLE ACCRUAL_BATCH_CONTROL (
        run_id NUMBER DEFAULT SEQ_BATCH_RUN.NEXTVAL PRIMARY KEY,
        bucket_id NUMBER,
        accrual_date DATE,
        status VARCHAR2(20),
        accounts_processed NUMBER DEFAULT 0,
        started_at TIMESTAMP DEFAULT SYSTIMESTAMP,
        completed_at TIMESTAMP,
        error_message VARCHAR2(1000)
    )';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- Procedure to generate the MIS dashboard data
CREATE OR REPLACE PROCEDURE sp_generate_branch_mis(
    p_branch_id IN VARCHAR2,
    p_from_date IN DATE,
    p_to_date IN DATE,
    p_cursor OUT SYS_REFCURSOR
) 
AS 
BEGIN
    OPEN p_cursor FOR
    SELECT 
        (SELECT NVL(SUM(amount), 0) FROM TRANSACTIONS 
         WHERE transaction_type IN ('LOAN_INTEREST', 'INTEREST_DEBIT', 'LOAN_CHARGE')
         AND (branch_id = p_branch_id OR p_branch_id = 'GLOBAL' OR branch_id IS NULL)
         AND transaction_date BETWEEN p_from_date AND p_to_date) AS INTEREST_INCOME,
         
        (SELECT NVL(SUM(amount), 0) FROM TRANSACTIONS 
         WHERE transaction_type IN ('INTEREST_CREDIT', 'FD_INTEREST', 'RD_INTEREST')
         AND (branch_id = p_branch_id OR p_branch_id = 'GLOBAL' OR branch_id IS NULL)
         AND transaction_date BETWEEN p_from_date AND p_to_date) AS INTEREST_EXPENSE,
         
        (SELECT NVL(SUM(amount), 0) FROM TRANSACTIONS 
         WHERE transaction_type IN ('FEE_DEBIT', 'SERVICE_FEE', 'PENALTY_FEE')
         AND (branch_id = p_branch_id OR p_branch_id = 'GLOBAL' OR branch_id IS NULL)
         AND transaction_date BETWEEN p_from_date AND p_to_date) AS FEE_INCOME
    FROM DUAL;
END;
/

-- Insert some dummy batch controls for today so it shows up in "Batch Job Status"
INSERT INTO ACCRUAL_BATCH_CONTROL (bucket_id, accrual_date, status, accounts_processed, started_at, completed_at)
VALUES (1, TRUNC(SYSDATE), 'COMPLETED', 1240, SYSTIMESTAMP - INTERVAL '1' HOUR, SYSTIMESTAMP - INTERVAL '55' MINUTE);

INSERT INTO ACCRUAL_BATCH_CONTROL (bucket_id, accrual_date, status, accounts_processed, started_at)
VALUES (2, TRUNC(SYSDATE), 'IN_PROGRESS', 512, SYSTIMESTAMP - INTERVAL '10' MINUTE);

INSERT INTO ACCRUAL_BATCH_CONTROL (bucket_id, accrual_date, status, accounts_processed)
VALUES (3, TRUNC(SYSDATE), 'PENDING', 0);

COMMIT;
