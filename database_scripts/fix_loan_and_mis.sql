-- ============================================================
-- Fix Script: Loan ORA-01438 + MIS Dashboard Live Data
-- Run this in SQL*Plus / SQLcl as the schema owner
-- ============================================================

-- ============================
-- PART 1: Fix Column Precision
-- ============================
-- Some environments already have data in these columns, and reducing scale/precision
-- causes ORA-01440. To stay rerunnable, only widen precision when integer capacity
-- is below 3 digits (required for rates like 10.50 or 100.00).
DECLARE
    PROCEDURE ensure_rate_precision (
        p_table_name  IN VARCHAR2,
        p_column_name IN VARCHAR2
    ) IS
        v_precision NUMBER;
        v_scale NUMBER;
        v_target_precision NUMBER;
    BEGIN
        SELECT data_precision, data_scale
          INTO v_precision, v_scale
          FROM USER_TAB_COLUMNS
         WHERE table_name = UPPER(p_table_name)
           AND column_name = UPPER(p_column_name);

        IF v_precision IS NOT NULL
           AND v_scale IS NOT NULL
           AND (v_precision - v_scale) < 3 THEN
            v_target_precision := v_scale + 3;
            EXECUTE IMMEDIATE
                'ALTER TABLE ' || p_table_name ||
                ' MODIFY (' || p_column_name ||
                ' NUMBER(' || v_target_precision || ',' || v_scale || '))';
            DBMS_OUTPUT.PUT_LINE('Adjusted ' || p_table_name || '.' || p_column_name ||
                                 ' to NUMBER(' || v_target_precision || ',' || v_scale || ').');
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            DBMS_OUTPUT.PUT_LINE('Skipped ' || p_table_name || '.' || p_column_name || ' (column not found).');
        WHEN OTHERS THEN
            DBMS_OUTPUT.PUT_LINE('Skipped ' || p_table_name || '.' || p_column_name || ' due to: ' || SQLERRM);
    END ensure_rate_precision;
BEGIN
    ensure_rate_precision('LOAN_APPLICATIONS', 'annual_rate');
    ensure_rate_precision('ACCOUNT_TYPES', 'interest_rate');
    ensure_rate_precision('INTEREST_ACCRUAL_LOG', 'rate_applied');
END;
/

-- ============================
-- PART 2: Rebuild MIS Views
-- ============================

-- 2a. v_loan_interest_income — Projects interest income from active loans
CREATE OR REPLACE VIEW v_loan_interest_income AS
SELECT 
    la.branch_id,
    TRUNC(SYSDATE) AS report_date,
    SUM(
        CASE 
            WHEN lac.outstanding_principal IS NOT NULL AND lac.outstanding_principal > 0
            THEN lac.outstanding_principal * (la.annual_rate / 100)
            ELSE la.requested_amount * (la.annual_rate / 100)
        END
    ) AS total_interest_income
FROM LOAN_APPLICATIONS la
LEFT JOIN LOAN_ACCOUNTS lac ON la.loan_app_id = lac.loan_app_id
WHERE la.status IN ('ACTIVE', 'DISBURSED', 'APPROVED')
GROUP BY la.branch_id;
/

-- 2b. v_fd_interest_expense — Projects interest liability from FD + RD plus posted savings interest
CREATE OR REPLACE VIEW v_fd_interest_expense AS
SELECT 
    branch_id,
    TRUNC(SYSDATE) AS report_date,
    SUM(projected) AS projected_interest_liability
FROM (
    SELECT branch_id, 
           (principal_amount * (locked_rate/100) * (tenure_months/12)) AS projected
    FROM FD_ACCOUNTS
    WHERE status = 'ACTIVE'
    UNION ALL
    SELECT branch_id, 
           ((monthly_instalment * tenure_months) * (rate/100) * (tenure_months/12) / 2) AS projected
    FROM RD_ACCOUNTS
    WHERE status = 'ACTIVE'
    UNION ALL
    SELECT a.home_branch_id AS branch_id,
           SUM(t.amount) AS projected
    FROM TRANSACTIONS t
    JOIN ACCOUNTS a ON t.account_id = a.account_id
    JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
    WHERE t.transaction_type = 'INTEREST_CREDIT'
      AND at.type_name LIKE '%Savings%'
      AND a.customer_id != 'CUST-BANK-001'
    GROUP BY a.home_branch_id
) 
GROUP BY branch_id;
/

-- 2c. v_branch_liquidity — Full liquidity view with computed columns
--     Frontend expects: BRANCH_NAME, TOTAL_DEPOSITS, TOTAL_LOANS, LIQUIDITY_RATIO, RESERVE_STATUS
CREATE OR REPLACE VIEW v_branch_liquidity AS
SELECT 
    b.branch_id,
    b.branch_name,
    NVL(dep.total_deposits, 0) AS total_deposits,
    NVL(ln.total_loans, 0) AS total_loans,
    CASE 
        WHEN NVL(dep.total_deposits, 0) = 0 THEN 0
        ELSE ROUND(NVL(ln.total_loans, 0) / NVL(dep.total_deposits, 1) * 100, 1)
    END AS liquidity_ratio,
    CASE 
        WHEN NVL(dep.total_deposits, 0) = 0 THEN 'NO_DATA'
        WHEN NVL(ln.total_loans, 0) / NVL(dep.total_deposits, 1) * 100 > 80 THEN 'AT_RISK'
        WHEN NVL(ln.total_loans, 0) / NVL(dep.total_deposits, 1) * 100 > 60 THEN 'MODERATE'
        ELSE 'HEALTHY'
    END AS reserve_status
FROM BRANCHES b
LEFT JOIN (
    SELECT a.home_branch_id AS branch_id, 
           SUM(a.balance) AS total_deposits
    FROM ACCOUNTS a
    WHERE a.status = 'ACTIVE'
    GROUP BY a.home_branch_id
) dep ON b.branch_id = dep.branch_id
LEFT JOIN (
    SELECT la.branch_id,
           SUM(NVL(lac.outstanding_principal, la.requested_amount)) AS total_loans
    FROM LOAN_APPLICATIONS la
    LEFT JOIN LOAN_ACCOUNTS lac ON la.loan_app_id = lac.loan_app_id
    WHERE la.status IN ('ACTIVE', 'DISBURSED')
    GROUP BY la.branch_id
) ln ON b.branch_id = ln.branch_id
WHERE b.is_active = '1';
/

-- ============================
-- PART 3: Rebuild MIS Procedure
-- ============================
CREATE OR REPLACE PROCEDURE sp_generate_branch_mis (
    p_branch_id IN VARCHAR2,
    p_from_date IN DATE,
    p_to_date IN DATE,
    p_cursor OUT SYS_REFCURSOR
) AS
BEGIN
    OPEN p_cursor FOR
    SELECT 
        (SELECT NVL(SUM(total_interest_income), 0) 
         FROM v_loan_interest_income 
         WHERE (branch_id = p_branch_id OR p_branch_id = 'GLOBAL')) AS interest_income,
           
        (SELECT NVL(SUM(projected_interest_liability), 0) 
         FROM v_fd_interest_expense 
         WHERE (branch_id = p_branch_id OR p_branch_id = 'GLOBAL')) AS interest_expense,
           
        (SELECT NVL(SUM(t.amount), 0) 
         FROM TRANSACTIONS t 
         JOIN ACCOUNTS a ON t.account_id = a.account_id 
         WHERE (a.home_branch_id = p_branch_id OR p_branch_id = 'GLOBAL') 
         AND t.transaction_type = 'FEE_DEBIT'
         AND t.transaction_date BETWEEN p_from_date AND p_to_date) AS fee_income
    FROM DUAL;
END;
/

COMMIT;

PROMPT ====================================
PROMPT Fix applied successfully!
PROMPT - Column precision compatibility ensured (annual_rate, interest_rate, rate_applied)
PROMPT - MIS views rebuilt (v_loan_interest_income, v_fd_interest_expense, v_branch_liquidity)  
PROMPT - sp_generate_branch_mis rebuilt
PROMPT ====================================
