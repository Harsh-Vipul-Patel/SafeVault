-- MIS Views for Branch Manager
-- Run this after db_setup.sql

CREATE OR REPLACE VIEW v_loan_interest_income AS
SELECT 
    la.branch_id,
    TRUNC(lp.paid_at) AS report_date,
    SUM(lp.amount_paid - lp.penalty_paid) AS total_interest_income,
    COUNT(*) AS repayment_count
FROM LOAN_PAYMENTS lp
JOIN LOAN_ACCOUNTS acc ON lp.loan_account_id = acc.loan_account_id
JOIN LOAN_APPLICATIONS la ON acc.loan_app_id = la.loan_app_id
GROUP BY la.branch_id, TRUNC(lp.paid_at);
/

CREATE OR REPLACE VIEW v_fd_interest_expense AS
SELECT 
    a.home_branch_id AS branch_id,
    SUM(a.balance * (at.interest_rate / 100)) AS projected_interest_liability
FROM ACCOUNTS a
JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
WHERE at.type_name LIKE '%Fixed%' OR at.type_name LIKE '%Savings%'
GROUP BY a.home_branch_id;
/

CREATE OR REPLACE VIEW v_branch_liquidity AS
SELECT 
    b.branch_id,
    b.branch_name,
    NVL(SUM(a.balance), 0) AS total_deposits,
    (SELECT NVL(SUM(outstanding_principal), 0) 
     FROM LOAN_ACCOUNTS la_acc 
     JOIN LOAN_APPLICATIONS la ON la_acc.loan_app_id = la.loan_app_id 
     WHERE la.branch_id = b.branch_id) AS total_loans_outstanding
FROM BRANCHES b
LEFT JOIN ACCOUNTS a ON b.branch_id = a.home_branch_id
GROUP BY b.branch_id, b.branch_name;
/
