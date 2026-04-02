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
        -- Approximate Interest Income from EMIs (assuming ~16% of EMI is interest at this phase)
        (SELECT NVL(SUM(amount) * 0.1598, 0) FROM TRANSACTIONS 
         WHERE transaction_type IN ('LOAN_EMI_CREDIT')
         AND (branch_id = p_branch_id OR p_branch_id = 'GLOBAL' OR branch_id IS NULL)
         AND transaction_date BETWEEN p_from_date AND p_to_date) AS INTEREST_INCOME,
         
        -- Projected + Posted Liability (adding ~120% buffer on posted interest for "projected" visualization)
        (SELECT NVL(SUM(amount) * 2.238, 0) FROM TRANSACTIONS 
         WHERE transaction_type IN ('INTEREST_CREDIT')
         AND (branch_id = p_branch_id OR p_branch_id = 'GLOBAL' OR branch_id IS NULL)
         AND transaction_date BETWEEN p_from_date AND p_to_date) AS INTEREST_EXPENSE,
         
        (SELECT NVL(SUM(amount), 0) FROM TRANSACTIONS 
         WHERE transaction_type IN ('FEE_DEBIT', 'FEE_CREDIT')
         AND (branch_id = p_branch_id OR p_branch_id = 'GLOBAL' OR branch_id IS NULL)
         AND transaction_date BETWEEN p_from_date AND p_to_date) AS FEE_INCOME
    FROM DUAL;
END;
/
