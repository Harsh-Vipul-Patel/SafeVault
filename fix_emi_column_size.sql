-- Fix: ORA-12899 — LOAN_ACCOUNT_ID column too small for hex values (32 chars vs 20 max)
-- The EMI generate route passes 32-char hex strings but the columns are VARCHAR2(20).
-- This widens LOAN_ACCOUNT_ID across all 3 loan tables and fixes annual_rate precision.

-- Step 1: Drop FK constraints pointing to LOAN_ACCOUNTS.loan_account_id
BEGIN
  FOR c IN (
    SELECT constraint_name, table_name 
    FROM user_constraints 
    WHERE constraint_type = 'R'
      AND r_constraint_name IN (
        SELECT constraint_name FROM user_constraints 
        WHERE table_name = 'LOAN_ACCOUNTS' AND constraint_type = 'P'
      )
  ) LOOP
    EXECUTE IMMEDIATE 'ALTER TABLE ' || c.table_name || ' DROP CONSTRAINT ' || c.constraint_name;
    DBMS_OUTPUT.PUT_LINE('Dropped FK: ' || c.table_name || '.' || c.constraint_name);
  END LOOP;
END;
/

-- Step 2: Widen all LOAN_ACCOUNT_ID columns to VARCHAR2(40)
ALTER TABLE LOAN_ACCOUNTS MODIFY (loan_account_id VARCHAR2(40));
ALTER TABLE EMI_SCHEDULE MODIFY (loan_account_id VARCHAR2(40));
ALTER TABLE LOAN_PAYMENTS MODIFY (loan_account_id VARCHAR2(40));

-- Step 3: Re-add the FK constraints
ALTER TABLE EMI_SCHEDULE ADD CONSTRAINT fk_emi_loan_account 
    FOREIGN KEY (loan_account_id) REFERENCES LOAN_ACCOUNTS(loan_account_id);

ALTER TABLE LOAN_PAYMENTS ADD CONSTRAINT fk_payment_loan_account 
    FOREIGN KEY (loan_account_id) REFERENCES LOAN_ACCOUNTS(loan_account_id);

-- Step 4: Fix annual_rate precision for rates > 9.9999% (e.g. 10.5)
BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE LOAN_APPLICATIONS MODIFY (annual_rate NUMBER(7,4))';
    DBMS_OUTPUT.PUT_LINE('SUCCESS: annual_rate widened to NUMBER(7,4)');
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('annual_rate note: ' || SQLERRM);
END;
/

-- Step 5: Allow PENDING status in LOAN_ACCOUNTS (for EMI pre-generation)
BEGIN
  FOR c IN (
    SELECT constraint_name FROM user_constraints 
    WHERE table_name = 'LOAN_ACCOUNTS' AND constraint_type = 'C'
      AND search_condition_vc LIKE '%ACTIVE%CLOSED%DEFAULTED%'
  ) LOOP
    EXECUTE IMMEDIATE 'ALTER TABLE LOAN_ACCOUNTS DROP CONSTRAINT ' || c.constraint_name;
    DBMS_OUTPUT.PUT_LINE('Dropped old status check: ' || c.constraint_name);
  END LOOP;
END;
/

ALTER TABLE LOAN_ACCOUNTS ADD CONSTRAINT chk_loan_acct_status 
    CHECK (status IN ('ACTIVE','CLOSED','DEFAULTED','PENDING'));

COMMIT;

PROMPT ========================================
PROMPT Fix applied successfully!
PROMPT Verify with:
PROMPT   SELECT column_name, data_length FROM user_tab_columns 
PROMPT   WHERE table_name IN ('LOAN_ACCOUNTS','EMI_SCHEDULE','LOAN_PAYMENTS') 
PROMPT   AND column_name = 'LOAN_ACCOUNT_ID';
PROMPT ========================================
