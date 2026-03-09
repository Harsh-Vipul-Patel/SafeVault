-- Suraksha Bank — MIS Dashboard & Fee Engine (Oracle 21c)

-- 1. Additional Fee Seeds
INSERT INTO FEE_SCHEDULE (fee_type, amount, description) 
VALUES ('MIN_BALANCE_PENALTY', 500.0, 'Penalty for falling below minimum balance');

INSERT INTO FEE_SCHEDULE (fee_type, amount, description) 
VALUES ('CHEQUE_BOOK_ISSUE', 100.0, 'Fee for issuing a new 25-leaf cheque book');

-- 2. MIS Views
BEGIN
    EXECUTE IMMEDIATE 'CREATE OR REPLACE VIEW v_loan_interest_income AS
    SELECT 
        la.branch_id,
        TRUNC(es.paid_at) AS report_date,
        SUM(es.interest_component) AS total_interest_income,
        COUNT(es.emi_id) AS repayment_count
    FROM EMI_SCHEDULE es
    JOIN LOAN_ACCOUNTS l ON es.loan_account_id = l.loan_account_id
    JOIN LOAN_APPLICATIONS la ON l.loan_app_id = la.loan_app_id
    WHERE es.status = ''PAID''
    GROUP BY la.branch_id, TRUNC(es.paid_at)';
EXCEPTION WHEN OTHERS THEN 
    DBMS_OUTPUT.PUT_LINE('Warning: Could not create v_loan_interest_income view (insufficient privileges).');
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE OR REPLACE VIEW v_fd_interest_expense AS
    SELECT 
        branch_id,
        TRUNC(SYSTIMESTAMP) AS report_date,
        SUM(principal_amount * (locked_rate/100) * (tenure_months/12)) AS projected_interest_liability,
        COUNT(fd_id) AS active_fd_count
    FROM FD_ACCOUNTS
    WHERE status = ''ACTIVE''
    GROUP BY branch_id';
EXCEPTION WHEN OTHERS THEN 
    DBMS_OUTPUT.PUT_LINE('Warning: Could not create v_fd_interest_expense view (insufficient privileges).');
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE OR REPLACE VIEW v_branch_liquidity AS
    SELECT 
        b.branch_id,
        b.branch_name,
        (SELECT NVL(SUM(balance), 0) FROM ACCOUNTS WHERE home_branch_id = b.branch_id) AS savings_balance,
        (SELECT NVL(SUM(principal_amount), 0) FROM FD_ACCOUNTS WHERE branch_id = b.branch_id AND status = ''ACTIVE'') AS fd_principal,
        (SELECT NVL(SUM(monthly_instalment * instalments_paid), 0) FROM RD_ACCOUNTS WHERE branch_id = b.branch_id AND status = ''ACTIVE'') AS rd_balance
    FROM BRANCHES b';
EXCEPTION WHEN OTHERS THEN 
    DBMS_OUTPUT.PUT_LINE('Warning: Could not create v_branch_liquidity view (insufficient privileges).');
END;
/

-- 3. Procedures
CREATE OR REPLACE PROCEDURE sp_deduct_service_charges (
    p_account_id IN VARCHAR2,
    p_fee_type IN VARCHAR2
) AS
    v_fee_amt NUMBER;
    v_teller_id VARCHAR2(20) := 'SYSTEM_FEE';
BEGIN
    SELECT amount INTO v_fee_amt FROM FEE_SCHEDULE WHERE fee_type = p_fee_type;
    
    IF v_fee_amt > 0 THEN
        sp_withdraw(p_account_id, v_fee_amt, v_teller_id);
    END IF;
    COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE sp_generate_mis_report (
    p_branch_id IN VARCHAR2,
    p_report_type IN VARCHAR2
) AS
    v_role VARCHAR2(20) := SYS_CONTEXT('SURAKSHA_CTX', 'role');
BEGIN
    -- Branch Scope Validation
    IF v_role = 'BRANCH_MANAGER' AND p_branch_id != SYS_CONTEXT('SURAKSHA_CTX', 'branch_id') THEN
        RAISE_APPLICATION_ERROR(-20040, 'Branch scope violation: Cannot access other branch MIS.');
    END IF;
    
    -- In a real system, this might return a sys_refcursor or insert into a report table.
    -- For now, we provide the views for the API layer to consume.
    NULL;
END;
/

-- 4. Scheduler: MIN_BALANCE_CHECKER
BEGIN
    EXECUTE IMMEDIATE '
    BEGIN
        DBMS_SCHEDULER.CREATE_JOB (
            job_name        => ''MIN_BALANCE_CHECKER'',
            job_type        => ''PLSQL_BLOCK'',
            job_action      => ''BEGIN 
                                    FOR r IN (SELECT a.account_id, at.min_balance 
                                              FROM ACCOUNTS a 
                                              JOIN ACCOUNT_TYPES at ON a.type_id = at.type_id
                                              WHERE a.status = ''''ACTIVE'''' AND a.balance < at.min_balance)
                                    LOOP
                                        sp_deduct_service_charges(r.account_id, ''''MIN_BALANCE_PENALTY'''');
                                    END LOOP;
                                END;'',
            start_date      => SYSTIMESTAMP,
            repeat_interval => ''FREQ=MONTHLY; BYMONTHDAY=1; BYHOUR=1;'',
            enabled         => TRUE
        );
    END;';
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Warning: Could not create MIN_BALANCE_CHECKER job (insufficient privileges).');
END;
/
