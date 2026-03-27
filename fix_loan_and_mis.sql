-- ============================================================
-- Fix Script: Loan ORA-01438 + MIS Dashboard Live Data
-- Run this in SQL*Plus / SQLcl as the schema owner
-- ============================================================

-- ============================
-- PART 1: Fix Column Precision
-- ============================
-- annual_rate NUMBER(5,4) only allows 1 digit before decimal (max 9.9999)
-- Changing to NUMBER(5,2) allows up to 999.99 — sufficient for percentage rates

ALTER TABLE LOAN_APPLICATIONS MODIFY (annual_rate NUMBER(5,2));

ALTER TABLE ACCOUNT_TYPES MODIFY (interest_rate NUMBER(5,2));

ALTER TABLE INTEREST_ACCRUAL_LOG MODIFY (rate_applied NUMBER(5,2));

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

-- 2b. v_fd_interest_expense — Projects interest liability from FD + RD
CREATE OR REPLACE VIEW v_fd_interest_expense AS
SELECT 
    branch_id,
    TRUNC(SYSDATE) AS report_date,
    SUM(projected) AS projected_interest_liability
FROM (
    SELECT branch_id, 
           (principal_amount * (locked_rate/100) * (tenure_months/12)) AS projected
    FROM FD_ACCOUNTS WHERE status = 'ACTIVE'
    UNION ALL
    SELECT branch_id, 
           ((monthly_instalment * tenure_months) * (rate/100) * (tenure_months/12) / 2) AS projected
    FROM RD_ACCOUNTS WHERE status = 'ACTIVE'
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
PROMPT - Column precision fixed (annual_rate, interest_rate, rate_applied)
PROMPT - MIS views rebuilt (v_loan_interest_income, v_fd_interest_expense, v_branch_liquidity)  
PROMPT - sp_generate_branch_mis rebuilt
PROMPT ====================================
