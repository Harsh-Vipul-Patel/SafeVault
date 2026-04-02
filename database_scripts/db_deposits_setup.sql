-- Suraksha Bank — Fixed and Recurring Deposits (Oracle 21c)

-- 1. FEE_SCHEDULE Table (Module 7 base)
CREATE TABLE FEE_SCHEDULE (
  fee_id           VARCHAR2(40) PRIMARY KEY,
  fee_amount       NUMBER(15,2) DEFAULT 0,
  is_percentage    CHAR(1) DEFAULT '0' CHECK (is_percentage IN ('0','1')),
  min_balance_threshold NUMBER(15,2) DEFAULT 0,
  description      VARCHAR2(200),
  effective_from   DATE DEFAULT SYSDATE NOT NULL,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

-- Seed data for Deposits
INSERT INTO FEE_SCHEDULE (fee_id, fee_amount, is_percentage, description) 
VALUES ('FD_PREMATURE_CLOSURE', 1.0, '1', 'Penalty on FD principal for premature closure');

-- 2. Deposit Tables
CREATE TABLE FD_ACCOUNTS (
  fd_id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id         VARCHAR2(20) NOT NULL REFERENCES CUSTOMERS(customer_id),
  linked_account_id   VARCHAR2(20) NOT NULL REFERENCES ACCOUNTS(account_id),
  branch_id           VARCHAR2(20) NOT NULL REFERENCES BRANCHES(branch_id),
  principal_amount    NUMBER(15,2) NOT NULL CHECK (principal_amount > 0),
  tenure_months       NUMBER(3)    NOT NULL CHECK (tenure_months BETWEEN 1 AND 240),
  locked_rate         NUMBER(5,3)  NOT NULL,
  maturity_date       DATE         NOT NULL,
  auto_renewal_flag   CHAR(1)      DEFAULT 'N' NOT NULL
                      CHECK (auto_renewal_flag IN ('Y','N')),
  status              VARCHAR2(12) DEFAULT 'ACTIVE' NOT NULL
                      CHECK (status IN ('ACTIVE','MATURED','CLOSED','PREMATURE_CLOSED')),
  opened_by           VARCHAR2(20)       REFERENCES EMPLOYEES(employee_id),
  opened_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE RD_ACCOUNTS (
  rd_id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id         VARCHAR2(20) NOT NULL REFERENCES CUSTOMERS(customer_id),
  linked_account_id   VARCHAR2(20) NOT NULL REFERENCES ACCOUNTS(account_id),
  branch_id           VARCHAR2(20) NOT NULL REFERENCES BRANCHES(branch_id),
  monthly_instalment  NUMBER(15,2) NOT NULL CHECK (monthly_instalment > 0),
  tenure_months       NUMBER(3)    NOT NULL,
  instalments_paid    NUMBER(3)    DEFAULT 0 NOT NULL,
  rate                NUMBER(5,3)  NOT NULL,
  maturity_date       DATE         NOT NULL,
  standing_instr_id   NUMBER       REFERENCES STANDING_INSTRUCTIONS(instruction_id),
  status              VARCHAR2(12) DEFAULT 'ACTIVE' NOT NULL
                      CHECK (status IN ('ACTIVE','MATURED','CLOSED')),
  opened_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

-- 3. Audit Trigger for FD_ACCOUNTS
CREATE OR REPLACE TRIGGER trg_audit_fd_status
AFTER UPDATE OF status ON FD_ACCOUNTS
FOR EACH ROW
BEGIN
    INSERT INTO AUDIT_LOG (
        table_name, record_id, operation, changed_by, old_value_json, new_value_json, change_reason
    ) VALUES (
        'FD_ACCOUNTS', :NEW.fd_id, 'UPDATE', SYS_CONTEXT('USERENV', 'SESSION_USER'),
        '{"status":"' || :OLD.status || '"}', '{"status":"' || :NEW.status || '"}', 'FD Status Change'
    );
END;
/

-- 4. Procedures
CREATE OR REPLACE PROCEDURE sp_open_fd (
    p_customer_id IN VARCHAR2,
    p_linked_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_tenure_months IN NUMBER,
    p_rate_type IN VARCHAR2,
    p_teller_id IN VARCHAR2
) AS
    v_kyc_status VARCHAR2(20);
    v_acc_status VARCHAR2(10);
    v_rate NUMBER;
    v_fd_id NUMBER;
    v_branch_id VARCHAR2(20);
BEGIN
    -- Validation
    SELECT kyc_status INTO v_kyc_status FROM CUSTOMERS WHERE customer_id = p_customer_id;
    IF v_kyc_status != 'VERIFIED' THEN RAISE_APPLICATION_ERROR(-20050, 'Customer KYC not verified.'); END IF;

    SELECT status, home_branch_id INTO v_acc_status, v_branch_id FROM ACCOUNTS WHERE account_id = p_linked_account_id;
    IF v_acc_status != 'ACTIVE' THEN RAISE_APPLICATION_ERROR(-20030, 'Account not active.'); END IF;

    -- Fetch Rate
    BEGIN
        SELECT TO_NUMBER(config_value) INTO v_rate 
        FROM SYSTEM_CONFIG WHERE config_key = 'FD_RATE_' || p_rate_type;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN v_rate := 7.5; -- Default fallback
    END;

    -- Debit Savings
    sp_withdraw(p_linked_account_id, p_amount, p_teller_id);

    -- Create FD
    INSERT INTO FD_ACCOUNTS (
        customer_id, linked_account_id, branch_id, principal_amount,
        tenure_months, locked_rate, maturity_date, opened_by
    ) VALUES (
        p_customer_id, p_linked_account_id, v_branch_id, p_amount,
        p_tenure_months, v_rate, ADD_MONTHS(SYSDATE, p_tenure_months), p_teller_id
    ) RETURNING fd_id INTO v_fd_id;

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_user RAW(16);
    BEGIN
        SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = p_customer_id;
        
        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (p_customer_id, v_user, 'FD_OPENED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'fd_id' VALUE v_fd_id,
                'amount' VALUE p_amount,
                'tenure' VALUE p_tenure_months,
                'rate' VALUE v_rate,
                'maturity_date' VALUE TO_CHAR(ADD_MONTHS(SYSDATE, p_tenure_months), 'YYYY-MM-DD')
            )
        );
    END;

    COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE sp_open_rd (
    p_customer_id IN VARCHAR2,
    p_linked_account_id IN VARCHAR2,
    p_monthly_instalment IN NUMBER,
    p_tenure_months IN NUMBER,
    p_teller_id IN VARCHAR2
) AS
    v_kyc_status VARCHAR2(20);
    v_branch_id VARCHAR2(20);
    v_instr_id NUMBER;
    v_rate NUMBER := 7.0; -- Default RD rate
    v_rd_id NUMBER;
BEGIN
    SELECT kyc_status INTO v_kyc_status FROM CUSTOMERS WHERE customer_id = p_customer_id;
    IF v_kyc_status != 'VERIFIED' THEN RAISE_APPLICATION_ERROR(-20050, 'Customer KYC not verified.'); END IF;

    SELECT home_branch_id INTO v_branch_id FROM ACCOUNTS WHERE account_id = p_linked_account_id;

    -- Insert RD
    INSERT INTO RD_ACCOUNTS (
        customer_id, linked_account_id, branch_id, monthly_instalment,
        tenure_months, rate, maturity_date
    ) VALUES (
        p_customer_id, p_linked_account_id, v_branch_id, p_monthly_instalment,
        p_tenure_months, v_rate, ADD_MONTHS(SYSDATE, p_tenure_months)
    ) RETURNING rd_id INTO v_rd_id;

    -- Create SI
    INSERT INTO STANDING_INSTRUCTIONS (
        customer_id, debit_account_id, credit_reference, instruction_type,
        amount, frequency, start_date, end_date, next_execution_date
    ) VALUES (
        p_customer_id, p_linked_account_id, TO_CHAR(v_rd_id), 'RD_INSTALMENT',
        p_monthly_instalment, 'MONTHLY', ADD_MONTHS(SYSDATE, 1), 
        ADD_MONTHS(SYSDATE, p_tenure_months), ADD_MONTHS(SYSDATE, 1)
    ) RETURNING instruction_id INTO v_instr_id;

    UPDATE RD_ACCOUNTS SET standing_instr_id = v_instr_id WHERE rd_id = v_rd_id;

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_user RAW(16);
    BEGIN
        SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = p_customer_id;
        
        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (p_customer_id, v_user, 'RD_OPENED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'rd_id' VALUE v_rd_id,
                'monthly_instalment' VALUE p_monthly_instalment,
                'tenure' VALUE p_tenure_months,
                'rate' VALUE v_rate,
                'maturity_date' VALUE TO_CHAR(ADD_MONTHS(SYSDATE, p_tenure_months), 'YYYY-MM-DD')
            )
        );
    END;

    COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE sp_process_fd_maturity (
    p_fd_id IN NUMBER,
    p_manager_id IN VARCHAR2
) AS
    v_fd FD_ACCOUNTS%ROWTYPE;
    v_maturity_amt NUMBER;
BEGIN
    SELECT * INTO v_fd FROM FD_ACCOUNTS WHERE fd_id = p_fd_id FOR UPDATE;

    IF v_fd.maturity_date > SYSDATE THEN RAISE_APPLICATION_ERROR(-20041, 'FD not matured.'); END IF;
    IF v_fd.status != 'ACTIVE' THEN RAISE_APPLICATION_ERROR(-20042, 'FD already closed/matured.'); END IF;

    v_maturity_amt := v_fd.principal_amount * POWER(1 + v_fd.locked_rate/12/100, v_fd.tenure_months);

    sp_deposit(v_fd.linked_account_id, v_maturity_amt, 'SYSTEM_MATURITY');

    IF v_fd.auto_renewal_flag = 'Y' THEN
        -- Re-open FD logic (simplified)
        sp_open_fd(v_fd.customer_id, v_fd.linked_account_id, v_maturity_amt, v_fd.tenure_months, 'STANDARD', p_manager_id);
        UPDATE FD_ACCOUNTS SET status = 'MATURED' WHERE fd_id = p_fd_id;
    ELSE
        UPDATE FD_ACCOUNTS SET status = 'MATURED' WHERE fd_id = p_fd_id;
    END IF;

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_user RAW(16);
    BEGIN
        SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = v_fd.customer_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_fd.customer_id, v_user, 'FD_MATURED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'fd_id' VALUE p_fd_id,
                'maturity_amount' VALUE v_maturity_amt,
                'auto_renewed' VALUE v_fd.auto_renewal_flag
            )
        );
    END;

    COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE sp_premature_fd_closure (
    p_fd_id IN NUMBER,
    p_teller_id IN VARCHAR2
) AS
    v_fd FD_ACCOUNTS%ROWTYPE;
    v_penalty_rate NUMBER;
    v_payout NUMBER;
BEGIN
    SELECT * INTO v_fd FROM FD_ACCOUNTS WHERE fd_id = p_fd_id FOR UPDATE;
    
    SELECT fee_amount INTO v_penalty_rate 
    FROM FEE_SCHEDULE WHERE fee_id = 'FD_PREMATURE_CLOSURE';

    v_payout := v_fd.principal_amount * (1 - v_penalty_rate/100);

    sp_deposit(v_fd.linked_account_id, v_payout, p_teller_id);

    UPDATE FD_ACCOUNTS SET status = 'PREMATURE_CLOSED' WHERE fd_id = p_fd_id;

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_user RAW(16);
    BEGIN
        SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = v_fd.customer_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_fd.customer_id, v_user, 'FD_CLOSED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'fd_id' VALUE p_fd_id,
                'payout_amount' VALUE v_payout
            )
        );
    END;

    COMMIT;
END;
/

-- 5. Scheduler
BEGIN
    EXECUTE IMMEDIATE '
    BEGIN
        DBMS_SCHEDULER.CREATE_JOB (
            job_name        => ''FD_MATURITY_PROCESSOR'',
            job_type        => ''PLSQL_BLOCK'',
            job_action      => ''BEGIN 
                                    FOR r IN (SELECT fd_id FROM FD_ACCOUNTS WHERE status = ''''ACTIVE'''' AND maturity_date <= SYSDATE)
                                    LOOP
                                        sp_process_fd_maturity(r.fd_id, ''''SYSTEM'''');
                                    END LOOP;
                                END;'',
            start_date      => SYSTIMESTAMP,
            repeat_interval => ''FREQ=DAILY; BYHOUR=8;'',
            enabled         => TRUE
        );
    END;';
EXCEPTION 
    WHEN OTHERS THEN 
        DBMS_OUTPUT.PUT_LINE('Warning: Could not create FD_MATURITY_PROCESSOR job (insufficient privileges).');
END;
/
/
