-- Suraksha Bank — Beneficiaries and Standing Instructions (Oracle 21c)

-- 1. SAVED_BENEFICIARIES Table
CREATE TABLE SAVED_BENEFICIARIES (
  beneficiary_id    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id       VARCHAR2(20) NOT NULL REFERENCES CUSTOMERS(customer_id),
  account_number    VARCHAR2(20) NOT NULL,
  ifsc_code         VARCHAR2(15) NOT NULL,
  bank_name         VARCHAR2(80),
  beneficiary_name  VARCHAR2(150) NOT NULL,
  nickname          VARCHAR2(60),
  activation_status VARCHAR2(10) DEFAULT 'PENDING' NOT NULL
                    CHECK (activation_status IN ('PENDING','ACTIVE','DELETED')),
  activation_date   TIMESTAMP WITH TIME ZONE,
  added_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT uq_cust_bene UNIQUE (customer_id, account_number, ifsc_code)
);

CREATE INDEX idx_bene_customer ON SAVED_BENEFICIARIES(customer_id);

-- 2. STANDING_INSTRUCTIONS Table
CREATE TABLE STANDING_INSTRUCTIONS (
  instruction_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id         VARCHAR2(20) NOT NULL REFERENCES CUSTOMERS(customer_id),
  debit_account_id    VARCHAR2(20) NOT NULL REFERENCES ACCOUNTS(account_id),
  credit_reference    VARCHAR2(40) NOT NULL,  -- account_number or beneficiary_id
  instruction_type    VARCHAR2(20) NOT NULL
                      CHECK (instruction_type IN (
                        'INTERNAL_TRANSFER','EXTERNAL_TRANSFER',
                        'RD_INSTALMENT','UTILITY_PAYMENT')),
  amount              NUMBER(15,2) NOT NULL CHECK (amount > 0),
  frequency           VARCHAR2(12) NOT NULL
                      CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY')),
  start_date          DATE NOT NULL,
  end_date            DATE,
  max_executions      NUMBER(4),
  executions_done     NUMBER(4) DEFAULT 0 NOT NULL,
  next_execution_date DATE,
  status              VARCHAR2(10) DEFAULT 'ACTIVE' NOT NULL
                      CHECK (status IN ('ACTIVE','PAUSED','EXPIRED','FAILED')),
  failure_count       NUMBER(2) DEFAULT 0 NOT NULL,
  created_by          RAW(16) REFERENCES USERS(user_id),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE STANDING_INSTRUCTION_LOG (
  log_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  instruction_id  NUMBER NOT NULL REFERENCES STANDING_INSTRUCTIONS(instruction_id),
  execution_date  DATE NOT NULL,
  status          VARCHAR2(10) NOT NULL CHECK (status IN ('SUCCESS','FAILED','SKIPPED')),
  txn_id          NUMBER REFERENCES TRANSACTIONS(transaction_id),
  error_message   VARCHAR2(400),
  executed_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

-- 3. Procedures for Beneficiaries
CREATE OR REPLACE PROCEDURE sp_add_beneficiary (
    p_customer_id IN VARCHAR2,
    p_account_number IN VARCHAR2,
    p_ifsc IN VARCHAR2,
    p_bank_name IN VARCHAR2,
    p_name IN VARCHAR2,
    p_nickname IN VARCHAR2
) AS
BEGIN
    INSERT INTO SAVED_BENEFICIARIES (
        customer_id, account_number, ifsc_code, bank_name, beneficiary_name, nickname,
        activation_status, activation_date
    ) VALUES (
        p_customer_id, p_account_number, p_ifsc, p_bank_name, p_name, p_nickname,
        'PENDING', SYSTIMESTAMP + INTERVAL '24' HOUR
    );
    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_user RAW(16);
    BEGIN
        SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = p_customer_id;
        
        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (p_customer_id, v_user, 'BENE_ADDED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'beneficiary_name' VALUE p_name,
                'account_number' VALUE p_account_number,
                'ifsc_code' VALUE p_ifsc,
                'activation_time' VALUE '24 hours'
            )
        );
    END;
    COMMIT;
EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
        RAISE_APPLICATION_ERROR(-20060, 'Beneficiary already exists.');
END;
/

CREATE OR REPLACE PROCEDURE sp_activate_beneficiary (
    p_beneficiary_id IN NUMBER,
    p_customer_id IN VARCHAR2
) AS
    v_act_date TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT activation_date INTO v_act_date
    FROM SAVED_BENEFICIARIES
    WHERE beneficiary_id = p_beneficiary_id AND customer_id = p_customer_id FOR UPDATE;

    IF v_act_date > SYSTIMESTAMP THEN
        RAISE_APPLICATION_ERROR(-20061, 'Cooling period not elapsed.');
    END IF;

    UPDATE SAVED_BENEFICIARIES SET activation_status = 'ACTIVE' 
    WHERE beneficiary_id = p_beneficiary_id;

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_bene_name VARCHAR2(150);
        v_user RAW(16);
    BEGIN
        SELECT c.full_name, b.beneficiary_name, c.user_id 
        INTO v_cust_name, v_bene_name, v_user
        FROM CUSTOMERS c JOIN SAVED_BENEFICIARIES b ON c.customer_id = b.customer_id 
        WHERE b.beneficiary_id = p_beneficiary_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (p_customer_id, v_user, 'BENE_ACTIVE', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'beneficiary_name' VALUE v_bene_name
            )
        );
    END;

    COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE sp_delete_beneficiary (
    p_beneficiary_id IN NUMBER,
    p_customer_id IN VARCHAR2
) AS
BEGIN
    UPDATE SAVED_BENEFICIARIES 
    SET activation_status = 'DELETED'
    WHERE beneficiary_id = p_beneficiary_id AND customer_id = p_customer_id;
    
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20062, 'Beneficiary not owned by this customer.');
    END IF;
    COMMIT;
END;
/

-- 4. Procedures for Standing Instructions
CREATE OR REPLACE PROCEDURE sp_create_standing_instruction (
    p_customer_id IN VARCHAR2,
    p_debit_account_id IN VARCHAR2,
    p_credit_reference IN VARCHAR2,
    p_instruction_type IN VARCHAR2,
    p_amount IN NUMBER,
    p_frequency IN VARCHAR2,
    p_start_date IN DATE,
    p_end_date IN DATE,
    p_max_executions IN NUMBER,
    p_created_by IN RAW
) AS
    v_status VARCHAR2(10);
    v_bene_status VARCHAR2(10);
BEGIN
    -- Validate Debit Account
    SELECT status INTO v_status FROM ACCOUNTS WHERE account_id = p_debit_account_id;
    IF v_status != 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20030, 'Debit account is not ACTIVE.');
    END IF;

    -- Validate Beneficiary for External Transfer
    IF p_instruction_type = 'EXTERNAL_TRANSFER' THEN
        BEGIN
            SELECT activation_status INTO v_bene_status 
            FROM SAVED_BENEFICIARIES 
            WHERE beneficiary_id = TO_NUMBER(p_credit_reference) AND customer_id = p_customer_id;
            
            IF v_bene_status != 'ACTIVE' THEN
                RAISE_APPLICATION_ERROR(-20063, 'Beneficiary not active.');
            END IF;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20062, 'Beneficiary not found.');
            WHEN VALUE_ERROR THEN
                RAISE_APPLICATION_ERROR(-20062, 'Invalid beneficiary ID reference.');
        END;
    END IF;

    INSERT INTO STANDING_INSTRUCTIONS (
        customer_id, debit_account_id, credit_reference, instruction_type,
        amount, frequency, start_date, end_date, max_executions,
        next_execution_date, created_by
    ) VALUES (
        p_customer_id, p_debit_account_id, p_credit_reference, p_instruction_type,
        p_amount, p_frequency, p_start_date, p_end_date, p_max_executions,
        p_start_date, p_created_by
    );
    COMMIT;
END;
/

-- 5. Execute Standing Instruction (Internal)
CREATE OR REPLACE PROCEDURE sp_execute_standing_instruction (
    p_instruction_id IN NUMBER
) AS
    v_instr STANDING_INSTRUCTIONS%ROWTYPE;
    v_next_date DATE;
    v_max_fails NUMBER := 3; -- Default
    v_txn_id NUMBER;
BEGIN
    SELECT * INTO v_instr FROM STANDING_INSTRUCTIONS WHERE instruction_id = p_instruction_id FOR UPDATE;
    
    IF v_instr.status != 'ACTIVE' THEN RETURN; END IF;

    BEGIN
        SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
        
        IF v_instr.instruction_type = 'INTERNAL_TRANSFER' THEN
            -- We'll assume sp_internal_transfer handles its own commit/rollback
            -- But for SI, we want to capture the status
            sp_internal_transfer(v_instr.debit_account_id, v_instr.credit_reference, v_instr.amount, 'SYSTEM_SI');
            -- Fetch latest txn_id for log (simplified)
            SELECT MAX(transaction_id) INTO v_txn_id FROM TRANSACTIONS WHERE account_id = v_instr.debit_account_id;
            
        ELSIF v_instr.instruction_type = 'EXTERNAL_TRANSFER' THEN
            -- Fetch beneficiary details
            DECLARE
                v_bene SAVED_BENEFICIARIES%ROWTYPE;
            BEGIN
                SELECT * INTO v_bene FROM SAVED_BENEFICIARIES WHERE beneficiary_id = TO_NUMBER(v_instr.credit_reference);
                sp_initiate_external_transfer(v_instr.debit_account_id, v_instr.amount, v_bene.ifsc_code, v_bene.account_number, 'NEFT', 'SYSTEM_SI');
            END;
        END IF;

        -- Success Logging
        INSERT INTO STANDING_INSTRUCTION_LOG (instruction_id, execution_date, status, txn_id)
        VALUES (p_instruction_id, TRUNC(SYSDATE), 'SUCCESS', v_txn_id);

        -- Update SI state
        v_next_date := CASE v_instr.frequency
            WHEN 'DAILY'   THEN v_instr.next_execution_date + 1
            WHEN 'WEEKLY'  THEN v_instr.next_execution_date + 7
            WHEN 'MONTHLY' THEN ADD_MONTHS(v_instr.next_execution_date, 1)
            WHEN 'QUARTERLY' THEN ADD_MONTHS(v_instr.next_execution_date, 3)
        END;

        UPDATE STANDING_INSTRUCTIONS 
        SET executions_done = executions_done + 1,
            next_execution_date = v_next_date,
            failure_count = 0,
            status = CASE 
                WHEN (max_executions IS NOT NULL AND executions_done + 1 >= max_executions) 
                     OR (end_date IS NOT NULL AND v_next_date > end_date) THEN 'EXPIRED'
                ELSE 'ACTIVE' 
            END
        WHERE instruction_id = p_instruction_id;

        -- Success Notification
        DECLARE
            v_cust_name VARCHAR2(100);
            v_user RAW(16);
        BEGIN
            SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = v_instr.customer_id;

            INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
            VALUES (v_instr.customer_id, v_user, 'SI_EXECUTED', 'EMAIL', 
                JSON_OBJECT(
                    'customer_name' VALUE v_cust_name,
                    'instruction_id' VALUE p_instruction_id,
                    'amount' VALUE v_instr.amount,
                    'txn_id' VALUE v_txn_id,
                    'next_execution' VALUE TO_CHAR(v_next_date, 'YYYY-MM-DD')
                )
            );
        END;

        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            INSERT INTO STANDING_INSTRUCTION_LOG (instruction_id, execution_date, status, error_message)
            VALUES (p_instruction_id, TRUNC(SYSDATE), 'FAILED', SQLERRM);
            
            UPDATE STANDING_INSTRUCTIONS 
            SET failure_count = failure_count + 1,
                status = CASE WHEN failure_count + 1 >= v_max_fails THEN 'FAILED' ELSE 'ACTIVE' END
            WHERE instruction_id = p_instruction_id;
            -- Failure Notification
            DECLARE
                v_cust_name VARCHAR2(100);
                v_user RAW(16);
            BEGIN
                SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = v_instr.customer_id;

                INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
                VALUES (v_instr.customer_id, v_user, 'SI_FAILED', 'EMAIL', 
                    JSON_OBJECT(
                        'customer_name' VALUE v_cust_name,
                        'instruction_id' VALUE p_instruction_id,
                        'error' VALUE SQLERRM
                    )
                );
            END;

            COMMIT;
    END;
END;
/

-- 6. Scheduler Job
BEGIN
    EXECUTE IMMEDIATE '
    BEGIN
        DBMS_SCHEDULER.CREATE_JOB (
            job_name        => ''SI_EXECUTOR'',
            job_type        => ''PLSQL_BLOCK'',
            job_action      => ''BEGIN 
                                    FOR r IN (SELECT instruction_id FROM STANDING_INSTRUCTIONS 
                                              WHERE status = ''''ACTIVE'''' AND next_execution_date <= TRUNC(SYSDATE))
                                    LOOP
                                        sp_execute_standing_instruction(r.instruction_id);
                                    END LOOP;
                                END;'',
            start_date      => SYSTIMESTAMP,
            repeat_interval => ''FREQ=DAILY; BYHOUR=0;'',
            enabled         => TRUE
        );
    END;';
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Warning: Could not create SI_EXECUTOR job (insufficient privileges).');
END;
/
