-- ================================================================
-- FIX: EMI Schedule Generation for All Disbursed Loans
-- Fixes two bugs:
--   1. sp_generate_emi_schedule receives rate as % (e.g. 10 for 10%)
--      but divides by 12 directly → gives monthly rate of 0.833 (83%!)
--      Must divide by 1200 to get correct 0.00833 (0.833%)
--   2. Existing disbursed loans (LN-5310, LN-1000 etc.) have no EMI schedule
-- ================================================================

-- STEP 1: Recreate sp_generate_emi_schedule with correct rate handling
CREATE OR REPLACE PROCEDURE sp_generate_emi_schedule (
    p_loan_account_id IN VARCHAR2,
    p_principal       IN NUMBER,
    p_annual_rate     IN NUMBER,   -- percentage value e.g. 10 for 10%
    p_tenure_months   IN NUMBER
) AS
    v_monthly_rate     NUMBER;
    v_emi_amount       NUMBER;
    v_balance          NUMBER;
    v_interest_comp    NUMBER;
    v_principal_comp   NUMBER;
    v_due_date         DATE;
BEGIN
    -- Correct formula: divide % rate by 1200 (= /100 to decimal, then /12 for monthly)
    v_monthly_rate := p_annual_rate / 1200;

    IF v_monthly_rate > 0 THEN
        v_emi_amount := ROUND(
            p_principal * v_monthly_rate * POWER(1 + v_monthly_rate, p_tenure_months)
            / (POWER(1 + v_monthly_rate, p_tenure_months) - 1),
            2
        );
    ELSE
        v_emi_amount := ROUND(p_principal / p_tenure_months, 2);
    END IF;

    v_balance := p_principal;

    FOR i IN 1..p_tenure_months LOOP
        v_interest_comp  := ROUND(v_balance * v_monthly_rate, 2);
        v_principal_comp := v_emi_amount - v_interest_comp;
        v_balance        := v_balance - v_principal_comp;

        -- Adjust last instalment for rounding residual
        IF i = p_tenure_months THEN
            v_principal_comp := v_principal_comp + v_balance;
            v_balance        := 0;
            v_emi_amount     := v_principal_comp + v_interest_comp;
        END IF;

        v_due_date := ADD_MONTHS(TRUNC(SYSDATE), i);

        INSERT INTO EMI_SCHEDULE (
            loan_account_id, emi_number, due_date, emi_amount,
            principal_component, interest_component, closing_balance, status
        ) VALUES (
            p_loan_account_id, i, v_due_date, v_emi_amount,
            v_principal_comp, v_interest_comp, v_balance, 'PENDING'
        );
    END LOOP;

    COMMIT;
END;
/
PROMPT sp_generate_emi_schedule recreated with correct rate handling (/ 1200).


-- STEP 2: Recreate sp_disburse_loan with auto EMI generation
CREATE OR REPLACE PROCEDURE sp_disburse_loan (
    p_loan_app_id IN RAW,
    p_loan_mgr_id IN VARCHAR2
) AS
    v_status           VARCHAR2(20);
    v_linked_account   VARCHAR2(20);
    v_requested_amount NUMBER;
    v_annual_rate      NUMBER;
    v_tenure_months    NUMBER;
    v_limit            NUMBER;
    v_loan_account_id  VARCHAR2(40);
    v_user_id          RAW(16);
BEGIN
    SELECT status, linked_account_id, requested_amount, annual_rate, tenure_months
    INTO v_status, v_linked_account, v_requested_amount, v_annual_rate, v_tenure_months
    FROM LOAN_APPLICATIONS WHERE loan_app_id = p_loan_app_id FOR UPDATE;

    IF v_status != 'APPROVED' THEN
        RAISE_APPLICATION_ERROR(-20011, 'Loan is not in APPROVED state.');
    END IF;

    BEGIN
        SELECT TO_NUMBER(config_value) INTO v_limit
        FROM SYSTEM_CONFIG WHERE config_key = 'LOAN_AUTO_DISBURSE_LIMIT';
    EXCEPTION WHEN NO_DATA_FOUND THEN v_limit := 500000;
    END;

    IF v_requested_amount > v_limit THEN
        SELECT user_id INTO v_user_id FROM EMPLOYEES WHERE employee_id = p_loan_mgr_id;
        INSERT INTO DUAL_APPROVAL_QUEUE (requested_by, operation_type, payload_json, status)
        VALUES (v_user_id, 'LOAN_DISBURSEMENT',
            '{"loan_app_id":"' || RAWTOHEX(p_loan_app_id) || '","amount":' || v_requested_amount || '}',
            'PENDING');
    ELSE
        v_loan_account_id := 'LN-' || TO_CHAR(SYSTIMESTAMP, 'FF4');

        INSERT INTO LOAN_ACCOUNTS (loan_account_id, loan_app_id, disbursed_amount, outstanding_principal, disbursed_at, status)
        VALUES (v_loan_account_id, p_loan_app_id, v_requested_amount, v_requested_amount, SYSTIMESTAMP, 'ACTIVE');

        UPDATE LOAN_APPLICATIONS SET status = 'DISBURSED' WHERE loan_app_id = p_loan_app_id;

        -- Credit disbursement amount to linked account
        sp_deposit(v_linked_account, v_requested_amount, p_loan_mgr_id);

        -- AUTO-GENERATE EMI SCHEDULE (rate stored as % e.g. 10 for 10%)
        sp_generate_emi_schedule(v_loan_account_id, v_requested_amount, v_annual_rate, v_tenure_months);

        -- Notification
        DECLARE
            v_cust_name VARCHAR2(100);
            v_cust_id   VARCHAR2(20);
            v_user      RAW(16);
        BEGIN
            SELECT c.full_name, c.customer_id, c.user_id INTO v_cust_name, v_cust_id, v_user
            FROM CUSTOMERS c JOIN LOAN_APPLICATIONS la ON c.customer_id = la.customer_id
            WHERE la.loan_app_id = p_loan_app_id;

            INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
            VALUES (v_cust_id, v_user, 'LOAN_DISBURSED', 'EMAIL',
                JSON_OBJECT('customer_name' VALUE v_cust_name,
                            'loan_account_id' VALUE v_loan_account_id,
                            'amount' VALUE v_requested_amount));
        END;
    END IF;
    COMMIT;
END;
/
PROMPT sp_disburse_loan recreated with auto EMI generation.


-- STEP 3: Patch all existing disbursed loans that have no EMI schedule
DECLARE
    v_count   NUMBER;
    v_principal NUMBER;
    v_rate    NUMBER;
    v_tenure  NUMBER;
BEGIN
    FOR lac IN (
        SELECT lac.loan_account_id, la.requested_amount, la.annual_rate, la.tenure_months
        FROM LOAN_ACCOUNTS lac
        JOIN LOAN_APPLICATIONS la ON lac.loan_app_id = la.loan_app_id
        WHERE lac.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM EMI_SCHEDULE es WHERE es.loan_account_id = lac.loan_account_id)
    ) LOOP
        BEGIN
            sp_generate_emi_schedule(
                lac.loan_account_id,
                lac.requested_amount,
                lac.annual_rate,       -- passed as % e.g. 10
                lac.tenure_months
            );
            DBMS_OUTPUT.PUT_LINE('Patched EMI for: ' || lac.loan_account_id);
        EXCEPTION WHEN OTHERS THEN
            DBMS_OUTPUT.PUT_LINE('FAILED for: ' || lac.loan_account_id || ' — ' || SQLERRM);
        END;
    END LOOP;
END;
/

COMMIT;
PROMPT ========================================
PROMPT All disbursed loans patched.
PROMPT Verify: SELECT loan_account_id, COUNT(*) FROM EMI_SCHEDULE GROUP BY loan_account_id;
PROMPT ========================================
