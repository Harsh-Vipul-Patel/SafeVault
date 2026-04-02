-- Suraksha Bank — MIS Dashboard & Fee Engine (Oracle 21c)

-- 1. Additional Fee Seeds
MERGE INTO FEE_SCHEDULE f
USING (
    SELECT 'MIN_BALANCE_PENALTY' AS fee_id, 500.0 AS fee_amount, '0' AS is_percentage, 'Penalty for falling below minimum balance' AS description FROM DUAL
    UNION ALL
    SELECT 'CHEQUE_BOOK_ISSUE', 100.0, '0', 'Fee for issuing a new 25-leaf cheque book' FROM DUAL
    UNION ALL
    SELECT 'IMPS', 5.0, '0', 'Fixed fee for IMPS transfer' FROM DUAL
    UNION ALL
    SELECT 'NEFT', 2.5, '0', 'Fixed fee for NEFT transfer' FROM DUAL
    UNION ALL
    SELECT 'RTGS', 0.0, '0', 'Fixed fee for RTGS transfer' FROM DUAL
    UNION ALL
    SELECT 'CASH_DEP', 10.0, '0', 'Cash deposit fee' FROM DUAL
    UNION ALL
    SELECT 'CASH_WTH', 10.0, '0', 'Cash withdrawal fee' FROM DUAL
) src
ON (f.fee_id = src.fee_id)
WHEN MATCHED THEN
    UPDATE SET
        f.fee_amount = src.fee_amount,
        f.is_percentage = src.is_percentage,
        f.description = src.description,
        f.updated_at = SYSTIMESTAMP
WHEN NOT MATCHED THEN
    INSERT (fee_id, fee_amount, is_percentage, description)
    VALUES (src.fee_id, src.fee_amount, src.is_percentage, src.description);

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
        TRUNC(SYSDATE) AS report_date,
        SUM(projected) AS projected_interest_liability
    FROM (
        SELECT branch_id,
               (principal_amount * (locked_rate/100) * (tenure_months/12)) AS projected
        FROM FD_ACCOUNTS
        WHERE status = ''ACTIVE''
        UNION ALL
        SELECT branch_id,
               ((monthly_instalment * tenure_months) * (rate/100) * (tenure_months/12) / 2) AS projected
        FROM RD_ACCOUNTS
        WHERE status = ''ACTIVE''
        UNION ALL
        SELECT a.home_branch_id AS branch_id,
               SUM(t.amount) AS projected
        FROM TRANSACTIONS t
        JOIN ACCOUNTS a ON t.account_id = a.account_id
        JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
        WHERE t.transaction_type = ''INTEREST_CREDIT''
          AND at.type_name LIKE ''%Savings%''
          AND a.customer_id != ''CUST-BANK-001''
        GROUP BY a.home_branch_id
    )
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
    SELECT fee_amount INTO v_fee_amt FROM FEE_SCHEDULE WHERE fee_id = p_fee_type;
    
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
    BEGIN
        DBMS_SCHEDULER.DROP_JOB(
            job_name => 'MIN_BALANCE_CHECKER',
            force => TRUE
        );
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLCODE != -27475 THEN
                RAISE;
            END IF;
    END;

    DBMS_SCHEDULER.CREATE_JOB (
        job_name        => 'MIN_BALANCE_CHECKER',
        job_type        => 'PLSQL_BLOCK',
        job_action      => q'[
            BEGIN
                FOR r IN (
                    SELECT a.account_id, at.min_balance
                    FROM ACCOUNTS a
                    JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
                    WHERE a.status = 'ACTIVE'
                      AND a.balance < at.min_balance
                ) LOOP
                    sp_deduct_service_charges(r.account_id, 'MIN_BALANCE_PENALTY');
                END LOOP;
            END;
        ]',
        start_date      => SYSTIMESTAMP,
        repeat_interval => 'FREQ=MONTHLY; BYMONTHDAY=1; BYHOUR=1;',
        enabled         => TRUE
    );

    DBMS_OUTPUT.PUT_LINE('MIN_BALANCE_CHECKER job created/enabled.');
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Warning: Could not create MIN_BALANCE_CHECKER job: ' || SQLERRM);
END;
/
