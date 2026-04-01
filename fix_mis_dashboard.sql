-- Fixes for Manager Dashboard MIS Views and Procedures - Revision 2

-- 1. Fix v_fd_interest_expense
-- Includes FD/RD projections plus posted savings interest (excluding bank pool accounts).
CREATE OR REPLACE VIEW v_fd_interest_expense AS
SELECT 
    branch_id,
    TRUNC(SYSTIMESTAMP) AS report_date,
    SUM(projected) AS projected_interest_liability
FROM (
    SELECT branch_id, (principal_amount * (locked_rate/100) * (tenure_months/12)) AS projected
    FROM FD_ACCOUNTS
    WHERE status = 'ACTIVE'
    UNION ALL
    SELECT branch_id, ((monthly_instalment * tenure_months) * (rate/100) * (tenure_months/12) / 2) AS projected
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
) GROUP BY branch_id;
/

-- 2. Fix v_loan_interest_income
-- Projects accrued interest based on active loans. Corrected the rate column for LOAN_APPLICATIONS.
CREATE OR REPLACE VIEW v_loan_interest_income AS
SELECT 
    la.branch_id,
    TRUNC(SYSTIMESTAMP) AS report_date,
    SUM(la_acc.outstanding_principal * (la.annual_rate/100)) AS total_interest_income
FROM LOAN_ACCOUNTS la_acc
JOIN LOAN_APPLICATIONS la ON la_acc.loan_app_id = la.loan_app_id
WHERE la_acc.status = 'ACTIVE'
GROUP BY la.branch_id;
/

-- 3. Fix sp_generate_branch_mis
-- Allow p_branch_id = 'GLOBAL' to sum across all branches dynamically.
-- Removed date filters on the projected numbers because they are snapshot calculations.
CREATE OR REPLACE PROCEDURE sp_generate_branch_mis (
    p_branch_id IN VARCHAR2,
    p_from_date IN DATE,
    p_to_date IN DATE,
    p_cursor OUT SYS_REFCURSOR
) AS
    v_role VARCHAR2(20) := SYS_CONTEXT('SURAKSHA_CTX', 'role');
BEGIN
    IF v_role = 'BRANCH_MANAGER' AND p_branch_id != 'GLOBAL' AND p_branch_id != SYS_CONTEXT('SURAKSHA_CTX', 'branch_id') THEN
        RAISE_APPLICATION_ERROR(-20040, 'Branch scope violation: Cannot access other branch MIS.');
    END IF;

    OPEN p_cursor FOR
    SELECT 
        (SELECT NVL(SUM(total_interest_income), 0) FROM v_loan_interest_income 
         WHERE (branch_id = p_branch_id OR p_branch_id = 'GLOBAL')) as interest_income,
           
        (SELECT NVL(SUM(projected_interest_liability), 0) FROM v_fd_interest_expense 
         WHERE (branch_id = p_branch_id OR p_branch_id = 'GLOBAL')) as interest_expense,
           
        (SELECT NVL(SUM(amount), 0) FROM TRANSACTIONS t 
         JOIN ACCOUNTS a ON t.account_id = a.account_id 
         WHERE (a.home_branch_id = p_branch_id OR p_branch_id = 'GLOBAL') AND t.transaction_type = 'FEE_DEBIT'
         AND t.transaction_date BETWEEN p_from_date AND p_to_date) as fee_income
    FROM DUAL;
END;
/
