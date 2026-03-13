-- Suraksha Bank — Resend Email Integration Setup (Oracle 21c)

-- 1. Create NOTIFICATION_LOG Table
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE NOTIFICATION_LOG (
      notif_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      customer_id       VARCHAR2(20) REFERENCES CUSTOMERS(customer_id),
      user_id           RAW(16) REFERENCES USERS(user_id),
      trigger_event     VARCHAR2(40) NOT NULL,
      channel           VARCHAR2(10) NOT NULL CHECK (channel IN (''EMAIL'', ''SMS'', ''IN_APP'')),
      message_clob      CLOB NOT NULL,
      status            VARCHAR2(10) DEFAULT ''QUEUED'' NOT NULL CHECK (status IN (''QUEUED'', ''SENT'', ''FAILED'')),
      resend_message_id VARCHAR2(40),
      created_at        TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
    )';
EXCEPTION WHEN OTHERS THEN 
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- 2. Update sp_generate_branch_mis
CREATE OR REPLACE PROCEDURE sp_generate_branch_mis (
    p_branch_id IN VARCHAR2,
    p_from_date IN DATE,
    p_to_date IN DATE,
    p_cursor OUT SYS_REFCURSOR
) AS
    v_role VARCHAR2(20) := SYS_CONTEXT('SURAKSHA_CTX', 'role');
BEGIN
    -- Branch Scope Validation
    IF v_role = 'BRANCH_MANAGER' AND p_branch_id != SYS_CONTEXT('SURAKSHA_CTX', 'branch_id') THEN
        RAISE_APPLICATION_ERROR(-20040, 'Branch scope violation: Cannot access other branch MIS.');
    END IF;

    OPEN p_cursor FOR
    SELECT 
        (SELECT NVL(SUM(total_interest_income), 0) FROM v_loan_interest_income 
         WHERE branch_id = p_branch_id AND report_date BETWEEN p_from_date AND p_to_date) as interest_income,
        (SELECT NVL(SUM(projected_interest_liability), 0) FROM v_fd_interest_expense 
         WHERE branch_id = p_branch_id) as interest_expense,
        (SELECT NVL(SUM(amount), 0) FROM TRANSACTIONS t 
         JOIN ACCOUNTS a ON t.account_id = a.account_id 
         WHERE a.home_branch_id = p_branch_id AND t.transaction_type = 'FEE_DEBIT'
         AND t.transaction_date BETWEEN p_from_date AND p_to_date) as fee_income
    FROM DUAL;
END;
/
