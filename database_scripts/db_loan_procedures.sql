-- Suraksha Bank Safe Vault System
-- Loan Operations Procedures (Oracle 21c)

-- 1. Generate EMI Schedule
CREATE OR REPLACE PROCEDURE sp_generate_emi_schedule (
    p_loan_account_id IN VARCHAR2,
    p_principal IN NUMBER,
    p_annual_rate IN NUMBER,
    p_tenure_months IN NUMBER
) AS
    v_monthly_rate NUMBER;
    v_emi_amount NUMBER;
    v_balance NUMBER;
    v_interest_comp NUMBER;
    v_principal_comp NUMBER;
    v_due_date DATE := SYSDATE;
BEGIN
    v_monthly_rate := p_annual_rate / 12;
    -- Round up or down gracefully
    IF v_monthly_rate > 0 THEN
        v_emi_amount := ROUND(p_principal * v_monthly_rate * POWER(1 + v_monthly_rate, p_tenure_months) / (POWER(1 + v_monthly_rate, p_tenure_months) - 1), 2);
    ELSE
        v_emi_amount := ROUND(p_principal / p_tenure_months, 2);
    END IF;
    
    v_balance := p_principal;
    
    FOR i IN 1..p_tenure_months LOOP
        v_interest_comp := ROUND(v_balance * v_monthly_rate, 2);
        v_principal_comp := v_emi_amount - v_interest_comp;
        v_balance := v_balance - v_principal_comp;
        
        IF i = p_tenure_months THEN
            v_principal_comp := v_principal_comp + v_balance; -- Adjust last month rounding
            v_balance := 0;
            v_emi_amount := v_principal_comp + v_interest_comp;
        END IF;
        
        v_due_date := ADD_MONTHS(SYSDATE, i);
        
        INSERT INTO EMI_SCHEDULE (loan_account_id, emi_number, due_date, emi_amount, principal_component, interest_component, closing_balance, status)
        VALUES (p_loan_account_id, i, v_due_date, v_emi_amount, v_principal_comp, v_interest_comp, v_balance, 'PENDING');
    END LOOP;
    
    COMMIT;
END;
/

-- 2. Disburse Loan
CREATE OR REPLACE PROCEDURE sp_disburse_loan (
    p_loan_app_id IN RAW,
    p_loan_mgr_id IN VARCHAR2
) AS
    v_status VARCHAR2(20);
    v_linked_account VARCHAR2(20);
    v_requested_amount NUMBER;
    v_limit NUMBER;
    v_loan_account_id VARCHAR2(20);
    v_user_id RAW(16);
BEGIN
    SELECT status, linked_account_id, requested_amount INTO v_status, v_linked_account, v_requested_amount
    FROM LOAN_APPLICATIONS WHERE loan_app_id = p_loan_app_id FOR UPDATE;
    
    IF v_status != 'APPROVED' THEN
        RAISE_APPLICATION_ERROR(-20011, 'Loan is not in APPROVED state.');
    END IF;
    
    BEGIN
        SELECT TO_NUMBER(config_value) INTO v_limit FROM SYSTEM_CONFIG WHERE config_key = 'LOAN_AUTO_DISBURSE_LIMIT';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN v_limit := 500000;
    END;
    
    IF v_requested_amount > v_limit THEN
        SELECT user_id INTO v_user_id FROM EMPLOYEES WHERE employee_id = p_loan_mgr_id;
        INSERT INTO DUAL_APPROVAL_QUEUE (requested_by, operation_type, payload_json, status)
        VALUES (v_user_id, 'LOAN_DISBURSEMENT', '{"loan_app_id":"' || RAWTOHEX(p_loan_app_id) || '", "amount":' || v_requested_amount || '}', 'PENDING');
    ELSE
        v_loan_account_id := 'LN-' || TO_CHAR(SYSTIMESTAMP, 'FF4');
        INSERT INTO LOAN_ACCOUNTS (loan_account_id, loan_app_id, disbursed_amount, outstanding_principal, disbursed_at, status)
        VALUES (v_loan_account_id, p_loan_app_id, v_requested_amount, v_requested_amount, SYSTIMESTAMP, 'ACTIVE');
        
        UPDATE LOAN_APPLICATIONS SET status = 'DISBURSED' WHERE loan_app_id = p_loan_app_id;
        
        -- Calls sp_deposit to credit the linked account internally
        sp_deposit(v_linked_account, v_requested_amount, p_loan_mgr_id);
    END IF;

    -- Notification (only if disbursed)
    IF v_status = 'APPROVED' AND v_requested_amount <= v_limit THEN
        DECLARE
            v_cust_name VARCHAR2(100);
            v_cust_id VARCHAR2(20);
            v_user RAW(16);
        BEGIN
            SELECT c.full_name, c.customer_id, c.user_id 
            INTO v_cust_name, v_cust_id, v_user
            FROM CUSTOMERS c JOIN LOAN_APPLICATIONS la ON c.customer_id = la.customer_id 
            WHERE la.loan_app_id = p_loan_app_id;

            INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
            VALUES (v_cust_id, v_user, 'LOAN_DISBURSED', 'EMAIL', 
                JSON_OBJECT(
                    'customer_name' VALUE v_cust_name,
                    'loan_account_id' VALUE v_loan_account_id,
                    'amount' VALUE v_requested_amount
                )
            );
        END;
    END IF;
    
    COMMIT;
END;
/

-- 3. Record EMI Payment
CREATE OR REPLACE PROCEDURE sp_record_emi_payment (
    p_emi_id IN NUMBER,
    p_loan_mgr_id IN VARCHAR2
) AS
    v_status VARCHAR2(10);
    v_due_date DATE;
    v_emi_amount NUMBER;
    v_loan_account_id VARCHAR2(20);
    v_principal_comp NUMBER;
    v_linked_account VARCHAR2(20);
    v_penalty NUMBER := 0;
BEGIN
    SELECT es.status, es.due_date, es.emi_amount, es.loan_account_id, es.principal_component, la.loan_app_id
    INTO v_status, v_due_date, v_emi_amount, v_loan_account_id, v_principal_comp, v_linked_account
    FROM EMI_SCHEDULE es JOIN LOAN_ACCOUNTS la ON es.loan_account_id = la.loan_account_id
    WHERE es.emi_id = p_emi_id FOR UPDATE;
    
    SELECT linked_account_id INTO v_linked_account FROM LOAN_APPLICATIONS 
    WHERE loan_app_id = (SELECT loan_app_id FROM LOAN_ACCOUNTS WHERE loan_account_id = v_loan_account_id);
    
    IF v_status != 'PENDING' AND v_status != 'OVERDUE' THEN
        RAISE_APPLICATION_ERROR(-20012, 'EMI is already paid.');
    END IF;
    
    IF SYSDATE > v_due_date THEN
        v_penalty := ROUND((SYSDATE - v_due_date) * 0.005 * v_emi_amount, 2); -- Penalty logic
    END IF;
    
    sp_withdraw(v_linked_account, v_emi_amount + v_penalty, p_loan_mgr_id);
    
    UPDATE EMI_SCHEDULE SET status = 'PAID', paid_at = SYSTIMESTAMP, penalty_amount = v_penalty WHERE emi_id = p_emi_id;
    UPDATE LOAN_ACCOUNTS SET outstanding_principal = outstanding_principal - v_principal_comp WHERE loan_account_id = v_loan_account_id;
    
    INSERT INTO LOAN_PAYMENTS (loan_account_id, emi_id, amount_paid, penalty_paid, paid_by_emp_id)
    VALUES (v_loan_account_id, p_emi_id, v_emi_amount, v_penalty, p_loan_mgr_id);
    
    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_user RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, c.user_id 
        INTO v_cust_name, v_cust_id, v_user
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id 
        WHERE a.account_id = v_linked_account;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'EMI_PAID', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'loan_account_id' VALUE v_loan_account_id,
                'emi_amount' VALUE v_emi_amount,
                'penalty' VALUE v_penalty
            )
        );
    END;

    COMMIT;
END;
/

-- 4. Close Loan
CREATE OR REPLACE PROCEDURE sp_close_loan (
    p_loan_account_id IN VARCHAR2,
    p_loan_mgr_id IN VARCHAR2
) AS
    v_unpaid_count NUMBER;
    v_outstanding NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_unpaid_count FROM EMI_SCHEDULE WHERE loan_account_id = p_loan_account_id AND status != 'PAID';
    SELECT outstanding_principal INTO v_outstanding FROM LOAN_ACCOUNTS WHERE loan_account_id = p_loan_account_id FOR UPDATE;
    
    IF v_unpaid_count > 0 OR v_outstanding > 0 THEN
        RAISE_APPLICATION_ERROR(-20010, 'Cannot close loan with unpaid EMIs or outstanding balance.');
    END IF;
    
    UPDATE LOAN_ACCOUNTS SET status = 'CLOSED' WHERE loan_account_id = p_loan_account_id;
    UPDATE LOAN_APPLICATIONS SET status = 'CLOSED' WHERE loan_app_id = (SELECT loan_app_id FROM LOAN_ACCOUNTS WHERE loan_account_id = p_loan_account_id);
    
    COMMIT;
END;
/

-- 5. Update Loan Status
CREATE OR REPLACE PROCEDURE sp_update_loan_status (
    p_loan_app_id IN RAW,
    p_new_status IN VARCHAR2,
    p_note IN VARCHAR2,
    p_loan_mgr_id IN VARCHAR2
) AS
    v_curr_status VARCHAR2(20);
BEGIN
    SELECT status INTO v_curr_status FROM LOAN_APPLICATIONS WHERE loan_app_id = p_loan_app_id FOR UPDATE;
    
    IF (v_curr_status = 'RECEIVED' AND p_new_status != 'UNDER_REVIEW') OR
       (v_curr_status = 'UNDER_REVIEW' AND p_new_status NOT IN ('APPROVED', 'REJECTED')) THEN
        RAISE_APPLICATION_ERROR(-20011, 'Invalid state transition from ' || v_curr_status || ' to ' || p_new_status);
    END IF;
    
    UPDATE LOAN_APPLICATIONS SET status = p_new_status, reviewed_by = p_loan_mgr_id WHERE loan_app_id = p_loan_app_id;
    
    COMMIT;
END;
/

-- 6. Mark Loan Overdue
CREATE OR REPLACE PROCEDURE sp_mark_loan_overdue AS
BEGIN
    FOR rec IN (SELECT emi_id, loan_account_id FROM EMI_SCHEDULE WHERE status = 'PENDING' AND due_date < TRUNC(SYSDATE)) LOOP
        UPDATE EMI_SCHEDULE SET status = 'OVERDUE' WHERE emi_id = rec.emi_id;
    END LOOP;
    COMMIT;
END;
/
