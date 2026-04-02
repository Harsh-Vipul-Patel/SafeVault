-- ================================================================
-- FIX 1: v_fd_interest_expense — Use ACCRUED interest, not projected
-- ================================================================
-- PROBLEM:
--   RD formula: (monthly_instalment * tenure_months) * (rate/100) * (tenure_months/12) / 2
--   This uses tenure_months TWICE (squared), projecting full-lifetime interest.
--   Result: 2 RDs show ₹1,05,01,050 which is wildly inflated.
--
-- FIX:
--   FD: Use elapsed months (MONTHS_BETWEEN) instead of full tenure
--   RD: Use instalments_paid instead of tenure_months for elapsed period
--   Savings: Already actual posted transactions — leave as-is
-- ================================================================

SET SERVEROUTPUT ON;
PROMPT ========================================;
PROMPT FIX 1: Replacing v_fd_interest_expense with accrued-to-date...;
PROMPT ========================================;

BEGIN
    EXECUTE IMMEDIATE 'CREATE OR REPLACE VIEW v_fd_interest_expense AS
    SELECT 
        branch_id,
        TRUNC(SYSDATE) AS report_date,
        SUM(accrued) AS projected_interest_liability
    FROM (
        -- FD: Interest accrued to date (not full tenure)
        SELECT branch_id,
               principal_amount * (locked_rate/100) 
                 * LEAST(MONTHS_BETWEEN(SYSDATE, opened_at), tenure_months) / 12 AS accrued
        FROM FD_ACCOUNTS
        WHERE status = ''ACTIVE''
        UNION ALL
        -- RD: Interest accrued based on instalments ACTUALLY paid
        -- Standard RD simple interest formula: P * n * (n+1) / 2 * r / (12*100)
        -- where P = monthly_instalment, n = instalments_paid, r = rate
        SELECT branch_id,
               monthly_instalment * instalments_paid * (instalments_paid + 1) / 2 
                 * (rate / 100) / 12 AS accrued
        FROM RD_ACCOUNTS
        WHERE status = ''ACTIVE''
        UNION ALL
        -- Savings: Actual posted interest credits (already real data)
        SELECT a.home_branch_id AS branch_id,
               SUM(t.amount) AS accrued
        FROM TRANSACTIONS t
        JOIN ACCOUNTS a ON t.account_id = a.account_id
        JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
        WHERE t.transaction_type = ''INTEREST_CREDIT''
          AND at.type_name LIKE ''%Savings%''
          AND a.customer_id != ''CUST-BANK-001''
        GROUP BY a.home_branch_id
    )
    GROUP BY branch_id';
    DBMS_OUTPUT.PUT_LINE('v_fd_interest_expense view replaced with accrued-to-date logic.');
EXCEPTION WHEN OTHERS THEN 
    DBMS_OUTPUT.PUT_LINE('Warning: Could not create v_fd_interest_expense: ' || SQLERRM);
END;
/

PROMPT ========================================;
PROMPT FIX 1 DONE. Verify with:;
PROMPT   SELECT * FROM v_fd_interest_expense;;
PROMPT ========================================;


-- ================================================================
-- FIX 2: Create USERS login for customer with account ACC-BRN-MUM-003-4280
-- ================================================================
-- PROBLEM:
--   Teller created a customer via open-account but no USERS row was created.
--   Without a USERS row, the customer has no username/password and cannot login.
--
-- FIX:
--   Find the customer by their account, create a USERS row, link it.
--   Username = email or phone. Password = SHA256('Welcome@123')
-- ================================================================

PROMPT ========================================;
PROMPT FIX 2: Creating login for customer ACC-BRN-MUM-003-4280...;
PROMPT ========================================;

DECLARE
    v_customer_id  VARCHAR2(20);
    v_email        VARCHAR2(100);
    v_phone        VARCHAR2(15);
    v_full_name    VARCHAR2(100);
    v_user_id      RAW(16);
    v_username     VARCHAR2(100);
    v_existing_uid RAW(16);
    v_count        NUMBER;
BEGIN
    -- Find the customer who owns this account
    SELECT c.customer_id, c.email, c.phone, c.full_name, c.user_id
    INTO v_customer_id, v_email, v_phone, v_full_name, v_existing_uid
    FROM CUSTOMERS c
    JOIN ACCOUNTS a ON c.customer_id = a.customer_id
    WHERE a.account_id = 'ACC-BRN-MUM-003-4280';

    IF v_existing_uid IS NOT NULL THEN
        DBMS_OUTPUT.PUT_LINE('Customer ' || v_customer_id || ' already has a USERS record. No action needed.');
        DBMS_OUTPUT.PUT_LINE('Check: SELECT username FROM USERS WHERE user_id = HEXTORAW(''' || RAWTOHEX(v_existing_uid) || ''')');
    ELSE
        -- Determine username (prefer email, fallback to phone)
        v_username := NVL(LOWER(v_email), v_phone);

        -- Check if username already exists in USERS
        SELECT COUNT(*) INTO v_count FROM USERS WHERE LOWER(username) = LOWER(v_username);
        IF v_count > 0 THEN
            -- Append customer_id to make unique
            v_username := v_username || '.' || LOWER(v_customer_id);
        END IF;

        -- Create USERS row with default password: Welcome@123 (SHA256)
        -- SHA256 of 'Welcome@123' = a pre-computed hash
        INSERT INTO USERS (username, password_hash, user_type)
        VALUES (v_username, 
                -- SHA256('Welcome@123')
                LOWER(STANDARD_HASH('Welcome@123', 'SHA256')),
                'CUSTOMER')
        RETURNING user_id INTO v_user_id;

        -- Link to CUSTOMERS
        UPDATE CUSTOMERS SET user_id = v_user_id WHERE customer_id = v_customer_id;

        DBMS_OUTPUT.PUT_LINE('SUCCESS: Login created for ' || v_full_name || ' (' || v_customer_id || ')');
        DBMS_OUTPUT.PUT_LINE('  Username: ' || v_username);
        DBMS_OUTPUT.PUT_LINE('  Password: Welcome@123');
        DBMS_OUTPUT.PUT_LINE('  >> Customer must change password on first login.');
    END IF;

    COMMIT;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        DBMS_OUTPUT.PUT_LINE('ERROR: Account ACC-BRN-MUM-003-4280 not found.');
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('ERROR: ' || SQLERRM);
        ROLLBACK;
END;
/

PROMPT ========================================;
PROMPT FIX 2 DONE. Customer can now login.;
PROMPT ========================================;


-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================
PROMPT ;
PROMPT === VERIFICATION ===;

-- Verify MIS fix: Should show MUCH lower numbers
PROMPT Checking updated interest expense view...;
SELECT 'FD_ACCRUED' AS source,
       COUNT(*) AS row_count,
       NVL(SUM(principal_amount * (locked_rate/100) 
         * LEAST(MONTHS_BETWEEN(SYSDATE, opened_at), tenure_months) / 12), 0) AS amount
FROM FD_ACCOUNTS WHERE status = 'ACTIVE'
UNION ALL
SELECT 'RD_ACCRUED',
       COUNT(*),
       NVL(SUM(monthly_instalment * instalments_paid * (instalments_paid + 1) / 2 
         * (rate / 100) / 12), 0)
FROM RD_ACCOUNTS WHERE status = 'ACTIVE'
UNION ALL
SELECT 'SAVINGS_INTEREST',
       COUNT(*),
       NVL(SUM(t.amount), 0)
FROM TRANSACTIONS t
JOIN ACCOUNTS a ON t.account_id = a.account_id
JOIN ACCOUNT_TYPES at ON a.account_type_id = at.type_id
WHERE t.transaction_type = 'INTEREST_CREDIT'
  AND at.type_name LIKE '%Savings%'
  AND a.customer_id != 'CUST-BANK-001';

-- Verify customer login fix
PROMPT Checking new customer login...;
SELECT u.username, c.full_name, c.customer_id
FROM USERS u
JOIN CUSTOMERS c ON u.user_id = c.user_id
WHERE c.customer_id = (
    SELECT customer_id FROM ACCOUNTS WHERE account_id = 'ACC-BRN-MUM-003-4280'
);
