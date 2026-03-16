-- Suraksha Bank — Beneficiaries and Standing Instructions (Oracle 21c)

-- 1. SAVED_BENEFICIARIES Table
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE SAVED_BENEFICIARIES (
      beneficiary_id    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      customer_id       VARCHAR2(20) NOT NULL REFERENCES CUSTOMERS(customer_id),
      account_number    VARCHAR2(20) NOT NULL,
      ifsc_code         VARCHAR2(15) NOT NULL,
      bank_name         VARCHAR2(80),
      beneficiary_name  VARCHAR2(150) NOT NULL,
      nickname          VARCHAR2(60),
      activation_status VARCHAR2(10) DEFAULT ''PENDING'' NOT NULL
                        CHECK (activation_status IN (''PENDING'',''ACTIVE'',''DELETED'')),
      activation_date   TIMESTAMP WITH TIME ZONE,
      added_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_cust_bene UNIQUE (customer_id, account_number, ifsc_code)
    )';
EXCEPTION WHEN OTHERS THEN 
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- 2. STANDING_INSTRUCTIONS Table
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE STANDING_INSTRUCTIONS (
      instruction_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      customer_id         VARCHAR2(20) NOT NULL REFERENCES CUSTOMERS(customer_id),
      debit_account_id    VARCHAR2(20) NOT NULL REFERENCES ACCOUNTS(account_id),
      credit_reference    VARCHAR2(40) NOT NULL,
      instruction_type    VARCHAR2(20) NOT NULL
                          CHECK (instruction_type IN (
                            ''INTERNAL_TRANSFER'',''EXTERNAL_TRANSFER'',
                            ''RD_INSTALMENT'',''UTILITY_PAYMENT'')),
      amount              NUMBER(15,2) NOT NULL CHECK (amount > 0),
      frequency           VARCHAR2(12) NOT NULL
                          CHECK (frequency IN (''DAILY'',''WEEKLY'',''MONTHLY'',''QUARTERLY'')),
      start_date          DATE NOT NULL,
      end_date            DATE,
      max_executions      NUMBER(4),
      executions_done     NUMBER(4) DEFAULT 0 NOT NULL,
      next_execution_date DATE,
      status              VARCHAR2(10) DEFAULT ''ACTIVE'' NOT NULL
                          CHECK (status IN (''ACTIVE'',''PAUSED'',''EXPIRED'',''FAILED'')),
      failure_count       NUMBER(2) DEFAULT 0 NOT NULL,
      created_by          RAW(16) REFERENCES USERS(user_id),
      created_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
    )';
EXCEPTION WHEN OTHERS THEN 
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE STANDING_INSTRUCTION_LOG (
      log_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      instruction_id  NUMBER NOT NULL REFERENCES STANDING_INSTRUCTIONS(instruction_id),
      execution_date  DATE NOT NULL,
      status          VARCHAR2(10) NOT NULL CHECK (status IN (''SUCCESS'',''FAILED'',''SKIPPED'')),
      txn_id          NUMBER REFERENCES TRANSACTIONS(transaction_id),
      error_message   VARCHAR2(400),
      executed_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
    )';
EXCEPTION WHEN OTHERS THEN 
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- 3. Procedures for Beneficiaries
CREATE OR REPLACE PROCEDURE sp_add_beneficiary (
    p_customer_id IN VARCHAR2,
    p_account_number IN VARCHAR2,
    p_ifsc IN VARCHAR2,
    p_bank_name IN VARCHAR2,
    p_name IN VARCHAR2,
    p_nickname IN VARCHAR2
) AS
    v_cust_name VARCHAR2(100);
    v_user RAW(16);
    v_json CLOB;
BEGIN
    INSERT INTO SAVED_BENEFICIARIES (
        customer_id, account_number, ifsc_code, bank_name, beneficiary_name, nickname,
        activation_status, activation_date
    ) VALUES (
        p_customer_id, p_account_number, p_ifsc, p_bank_name, p_name, p_nickname,
        'PENDING', SYSTIMESTAMP + INTERVAL '24' HOUR
    );

    SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = p_customer_id;
    
    v_json := '{"customer_name":"' || v_cust_name || '", "beneficiary_name":"' || p_name || '", "account":"' || p_account_number || '"}';
    
    INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
    SELECT p_customer_id, v_user, 'BENE_ADDED', 'EMAIL', v_json FROM DUAL;

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
    v_cust_name VARCHAR2(100);
    v_bene_name VARCHAR2(150);
    v_user RAW(16);
    v_json CLOB;
BEGIN
    SELECT activation_date INTO v_act_date
    FROM SAVED_BENEFICIARIES
    WHERE beneficiary_id = p_beneficiary_id AND customer_id = p_customer_id FOR UPDATE;

    IF v_act_date > SYSTIMESTAMP THEN
        RAISE_APPLICATION_ERROR(-20061, 'Cooling period not elapsed.');
    END IF;

    UPDATE SAVED_BENEFICIARIES SET activation_status = 'ACTIVE' 
    WHERE beneficiary_id = p_beneficiary_id;

    SELECT c.full_name, b.beneficiary_name, c.user_id 
    INTO v_cust_name, v_bene_name, v_user
    FROM CUSTOMERS c JOIN SAVED_BENEFICIARIES b ON c.customer_id = b.customer_id 
    WHERE b.beneficiary_id = p_beneficiary_id;

    v_json := '{"customer_name":"' || v_cust_name || '", "beneficiary_name":"' || v_bene_name || '"}';

    INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
    SELECT p_customer_id, v_user, 'BENE_ACTIVE', 'EMAIL', v_json FROM DUAL;

    COMMIT;
END;
/

-- 3b. Create Standing Instruction
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
    p_created_by IN VARCHAR2
) AS
    v_next_date DATE;
    v_user RAW(16);
BEGIN
    v_next_date := p_start_date;

    IF p_created_by IS NOT NULL THEN
        BEGIN
            SELECT user_id INTO v_user FROM USERS WHERE session_token = p_created_by;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            v_user := NULL;
        END;
    END IF;

    INSERT INTO STANDING_INSTRUCTIONS (
        customer_id, debit_account_id, credit_reference, instruction_type,
        amount, frequency, start_date, end_date, max_executions,
        next_execution_date, created_by
    ) VALUES (
        p_customer_id, p_debit_account_id, p_credit_reference, p_instruction_type,
        p_amount, p_frequency, p_start_date, p_end_date, p_max_executions,
        v_next_date, v_user
    );
    COMMIT;
END;
/

-- 4. Execute Standing Instruction
CREATE OR REPLACE PROCEDURE sp_execute_standing_instruction (
    p_instruction_id IN NUMBER
) AS
    v_instr STANDING_INSTRUCTIONS%ROWTYPE;
    v_next_date DATE;
    v_max_fails NUMBER := 3;
    v_txn_id NUMBER;
    v_json CLOB;
    v_cust_name VARCHAR2(100);
    v_user RAW(16);
    v_err VARCHAR2(400);
BEGIN
    SELECT * INTO v_instr FROM STANDING_INSTRUCTIONS WHERE instruction_id = p_instruction_id FOR UPDATE;
    IF v_instr.status != 'ACTIVE' THEN RETURN; END IF;

    BEGIN
        IF v_instr.instruction_type = 'INTERNAL_TRANSFER' THEN
            sp_internal_transfer(v_instr.debit_account_id, v_instr.credit_reference, v_instr.amount, 'SYSTEM_SI');
            SELECT MAX(transaction_id) INTO v_txn_id FROM TRANSACTIONS WHERE account_id = v_instr.debit_account_id;
        ELSIF v_instr.instruction_type = 'EXTERNAL_TRANSFER' THEN
            DECLARE
                v_bene SAVED_BENEFICIARIES%ROWTYPE;
            BEGIN
                SELECT * INTO v_bene FROM SAVED_BENEFICIARIES WHERE beneficiary_id = TO_NUMBER(v_instr.credit_reference);
                sp_initiate_external_transfer(v_instr.debit_account_id, v_instr.amount, v_bene.ifsc_code, v_bene.account_number, 'NEFT', 'SYSTEM_SI');
            END;
        END IF;

        INSERT INTO STANDING_INSTRUCTION_LOG (instruction_id, execution_date, status, txn_id)
        SELECT p_instruction_id, TRUNC(SYSDATE), 'SUCCESS', v_txn_id FROM DUAL;

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

        SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = v_instr.customer_id;
        v_json := '{"customer_name":"' || v_cust_name || '", "amount":' || v_instr.amount || ', "next_date":"' || TO_CHAR(v_next_date, 'YYYY-MM-DD') || '"}';

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        SELECT v_instr.customer_id, v_user, 'SI_EXECUTED', 'EMAIL', v_json FROM DUAL;

        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            v_err := SUBSTR(SQLERRM, 1, 400);
            ROLLBACK;
            INSERT INTO STANDING_INSTRUCTION_LOG (instruction_id, execution_date, status, error_message)
            SELECT p_instruction_id, TRUNC(SYSDATE), 'FAILED', v_err FROM DUAL;
            
            UPDATE STANDING_INSTRUCTIONS 
            SET failure_count = failure_count + 1,
                status = CASE WHEN failure_count + 1 >= v_max_fails THEN 'FAILED' ELSE 'ACTIVE' END
            WHERE instruction_id = p_instruction_id;
            
            BEGIN
                SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = v_instr.customer_id;
                v_json := '{"customer_name":"' || v_cust_name || '", "error":"' || SUBSTR(v_err, 1, 100) || '"}';
                INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
                SELECT v_instr.customer_id, v_user, 'SI_FAILED', 'EMAIL', v_json FROM DUAL;
            EXCEPTION WHEN OTHERS THEN NULL; END;
            COMMIT;
    END;
END;
/
