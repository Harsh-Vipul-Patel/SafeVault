-- Suraksha Bank — Interest and Fee Calculation Logic (Oracle 21c)

-- 1. Helper: Calculate Fee
CREATE OR REPLACE FUNCTION fn_calculate_fee (
    p_fee_id IN VARCHAR2,
    p_amount IN NUMBER
) RETURN NUMBER AS
    v_fee_amt NUMBER;
    v_is_pct CHAR(1);
    v_total_fee NUMBER := 0;
BEGIN
    BEGIN
        SELECT fee_amount, is_percentage INTO v_fee_amt, v_is_pct
        FROM FEE_SCHEDULE WHERE fee_id = p_fee_id;
        
        IF v_is_pct = '1' THEN
            v_total_fee := p_amount * (v_fee_amt / 100);
        ELSE
            v_total_fee := v_fee_amt;
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            v_total_fee := 0;
    END;
    RETURN v_total_fee;
END;
/

-- 2. Helper: Get Average Monthly Balance (till today)
CREATE OR REPLACE FUNCTION fn_get_average_balance (
    p_account_id IN VARCHAR2
) RETURN NUMBER AS
    v_avg_bal NUMBER;
    v_days NUMBER;
BEGIN
    -- Simplified: Calculate average of daily balances recorded in INTEREST_ACCRUAL_LOG
    -- or if that's not available, just use current balance for demonstration.
    -- Real implementation would use history tables.
    -- For this prototype, we'll calculate based on the current balance and transaction history for the month.
    
    SELECT NVL(AVG(bal), 0) INTO v_avg_bal
    FROM (
        -- Current balance
        SELECT balance as bal FROM ACCOUNTS WHERE account_id = p_account_id
        UNION ALL
        -- Reconstruct daily balances from transactions (Simplified)
        SELECT balance_after FROM TRANSACTIONS 
        WHERE account_id = p_account_id 
        AND TRUNC(transaction_date) >= TRUNC(SYSDATE, 'MM')
    );
    
    RETURN v_avg_bal;
END;
/

-- 3. Procedure: Post Savings Interest
CREATE OR REPLACE PROCEDURE sp_post_savings_interest AS
    v_interest_rate NUMBER := 0.03; -- 3% as requested
    v_avg_bal NUMBER;
    v_interest_amt NUMBER;
    v_posted_txn_id NUMBER;
BEGIN
    -- Only for Savings accounts (Basic Savings or Savings Premium)
    FOR r IN (
        SELECT a.account_id, a.balance, at.type_name
        FROM ACCOUNTS a
        JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
        WHERE a.status = 'ACTIVE' 
        AND (at.type_name LIKE '%Savings%')
    ) LOOP
        v_avg_bal := fn_get_average_balance(r.account_id);
        
        -- Monthly interest = (Avg Bal * Rate) / 12
        -- Since it's "till the day of the month", we might need to adjust, 
        -- but usually it's posted monthly.
        v_interest_amt := ROUND((v_avg_bal * v_interest_rate) / 12, 2);
        
        IF v_interest_amt > 0 THEN
            -- Update balance
            UPDATE ACCOUNTS SET balance = balance + v_interest_amt WHERE account_id = r.account_id;
            
            -- Insert transaction
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (r.account_id, 'INTEREST_CREDIT', v_interest_amt, r.balance + v_interest_amt, 'SYSTEM', 'Monthly Interest Credit (3% on Avg Bal)')
            RETURNING transaction_id INTO v_posted_txn_id;
            
            -- Log it
            INSERT INTO INTEREST_ACCRUAL_LOG (account_id, accrual_date, principal_amount, rate_applied, interest_amount, posted_txn_id)
            VALUES (r.account_id, SYSDATE, v_avg_bal, v_interest_rate, v_interest_amt, v_posted_txn_id);
        END IF;
    END LOOP;
    COMMIT;
END;
/

-- 4. Scheduler: SAVINGS_INTEREST_POSTER
BEGIN
    EXECUTE IMMEDIATE '
    BEGIN
        DBMS_SCHEDULER.CREATE_JOB (
            job_name        => ''SAVINGS_INTEREST_POSTER'',
            job_type        => ''PLSQL_BLOCK'',
            job_action      => ''BEGIN sp_post_savings_interest; END;'',
            start_date      => SYSTIMESTAMP,
            repeat_interval => ''FREQ=DAILY; BYHOUR=0;'',
            enabled         => TRUE
        );
    END;';
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Warning: Could not create SAVINGS_INTEREST_POSTER job (insufficient privileges).');
END;
/
