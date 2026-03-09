SELECT 
    COUNT(CASE WHEN la.status = 'ACTIVE' THEN 1 END) as active_loans_count,
    SUM(CASE WHEN la.status = 'ACTIVE' THEN acc.outstanding_principal ELSE 0 END) as active_loans_value,
    COUNT(CASE WHEN la.status IN ('RECEIVED', 'UNDER_REVIEW') THEN 1 END) as pending_review_count
    FROM LOAN_APPLICATIONS la
    LEFT JOIN LOAN_ACCOUNTS acc ON la.loan_app_id = acc.loan_app_id;

SELECT RAWTOHEX(la.loan_app_id) as loan_app_id, 
        acc.loan_account_id, 
        c.full_name as customer_name,
        la.loan_type,
        NVL(acc.outstanding_principal, la.requested_amount) as outstanding_principal,
        acc.status as account_status,
        la.status as app_status
    FROM LOAN_APPLICATIONS la
    JOIN CUSTOMERS c ON la.customer_id = c.customer_id
    LEFT JOIN LOAN_ACCOUNTS acc ON la.loan_app_id = acc.loan_app_id
    ORDER BY la.applied_at DESC;

SELECT COUNT(*) as count, NVL(SUM(emi_amount), 0) as total
    FROM EMI_SCHEDULE
    WHERE status = 'PENDING' AND TRUNC(due_date) <= TRUNC(SYSDATE);

EXIT;
