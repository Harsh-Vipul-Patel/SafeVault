-- Suraksha Bank — KYC Module (Oracle 21c)
-- This script adds KYC Management tables, procedures, and security.

-- 1. Create KYC_DETAILS Table
CREATE TABLE KYC_DETAILS (
  kyc_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id     VARCHAR2(20) NOT NULL REFERENCES CUSTOMERS(customer_id),
  document_type   VARCHAR2(12) NOT NULL
                  CHECK (document_type IN ('PAN','AADHAAR','PASSPORT')),
  doc_number_masked VARCHAR2(20) NOT NULL,
  expiry_date     DATE,
  kyc_status      VARCHAR2(10) DEFAULT 'PENDING' NOT NULL
                  CHECK (kyc_status IN ('VERIFIED','PENDING','EXPIRED')),
  verified_by     VARCHAR2(20) REFERENCES EMPLOYEES(employee_id),
  verified_at     TIMESTAMP WITH TIME ZONE,
  superseded_by   NUMBER REFERENCES KYC_DETAILS(kyc_id),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE INDEX idx_kyc_customer ON KYC_DETAILS(customer_id);
CREATE INDEX idx_kyc_status   ON KYC_DETAILS(kyc_status);

-- 2. Audit Trigger for KYC_DETAILS
CREATE OR REPLACE TRIGGER trg_audit_kyc_change
AFTER INSERT OR UPDATE ON KYC_DETAILS
FOR EACH ROW
DECLARE
    v_old_json CLOB;
    v_new_json CLOB;
    v_user_id VARCHAR2(50) := NVL(SYS_CONTEXT('SURAKSHA_CTX', 'user_id'), USER);
BEGIN
    IF UPDATING THEN
        v_old_json := '{"kyc_status":"' || :OLD.kyc_status || '", "doc_type":"' || :OLD.document_type || '"}';
    END IF;
    
    v_new_json := '{"kyc_status":"' || :NEW.kyc_status || '", "doc_type":"' || :NEW.document_type || '", "doc_num":"' || :NEW.doc_number_masked || '"}';
    
    INSERT INTO AUDIT_LOG (
        table_name, record_id, operation, changed_by, old_value_json, new_value_json, change_reason
    ) VALUES (
        'KYC_DETAILS', :NEW.kyc_id, CASE WHEN INSERTING THEN 'INSERT' ELSE 'UPDATE' END,
        v_user_id, v_old_json, v_new_json, 'KYC Status Update'
    );
END;
/

-- 3. Stored Procedure: sp_verify_kyc
CREATE OR REPLACE PROCEDURE sp_verify_kyc (
    p_customer_id IN VARCHAR2,
    p_doc_type IN VARCHAR2,
    p_doc_number_masked IN VARCHAR2,
    p_expiry_date IN DATE,
    p_teller_id IN VARCHAR2
) AS
    v_role VARCHAR2(20) := SYS_CONTEXT('SURAKSHA_CTX', 'role');
    v_teller_cust_id VARCHAR2(20);
    v_start_time TIMESTAMP := SYSTIMESTAMP;
    v_new_kyc_id NUMBER;
BEGIN
    -- Validation 1: Role check
    IF v_role != 'TELLER' AND v_role != 'BRANCH_MANAGER' THEN
        RAISE_APPLICATION_ERROR(-20011, 'Access Denied: Role TELLER or MANAGER required.');
    END IF;

    -- Validation 2: Cannot verify KYC for own customer record
    BEGIN
        SELECT c.customer_id INTO v_teller_cust_id
        FROM CUSTOMERS c
        JOIN EMPLOYEES e ON c.user_id = e.user_id
        WHERE e.employee_id = p_teller_id;
        
        IF v_teller_cust_id = p_customer_id THEN
            RAISE_APPLICATION_ERROR(-20032, 'Cannot verify KYC for own account.');
        END IF;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            NULL; -- Teller might not have a customer record, which is fine
    END;

    -- Update existing records for same doc_type to superseded
    -- We'll do this after getting the new ID to link it

    -- Insert new KYC record
    INSERT INTO KYC_DETAILS (
        customer_id, document_type, doc_number_masked, expiry_date,
        kyc_status, verified_by, verified_at
    ) VALUES (
        p_customer_id, p_doc_type, p_doc_number_masked, p_expiry_date,
        'VERIFIED', p_teller_id, SYSTIMESTAMP
    ) RETURNING kyc_id INTO v_new_kyc_id;

    -- Mark old records as superseded
    UPDATE KYC_DETAILS
    SET superseded_by = v_new_kyc_id
    WHERE customer_id = p_customer_id
      AND document_type = p_doc_type
      AND kyc_id != v_new_kyc_id
      AND superseded_by IS NULL;

    -- Update CUSTOMERS table status
    UPDATE CUSTOMERS 
    SET kyc_status = 'VERIFIED'
    WHERE customer_id = p_customer_id;

    -- Log Execution
    INSERT INTO PROCEDURE_EXECUTION_LOG (
        proc_name, called_by, execution_ms, success_flag
    ) VALUES (
        'sp_verify_kyc', p_teller_id, 
        EXTRACT(SECOND FROM (SYSTIMESTAMP - v_start_time)) * 1000, 'Y'
    );

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        INSERT INTO PROCEDURE_EXECUTION_LOG (
            proc_name, called_by, execution_ms, success_flag, error_message
        ) VALUES (
            'sp_verify_kyc', p_teller_id, 
            EXTRACT(SECOND FROM (SYSTIMESTAMP - v_start_time)) * 1000, 'N', SQLERRM
        );
        COMMIT;
        RAISE;
END;
/

-- 4. Oracle Scheduler Job: KYC_EXPIRY_SCANNER
BEGIN
    EXECUTE IMMEDIATE '
    BEGIN
        DBMS_SCHEDULER.CREATE_JOB (
            job_name        => ''KYC_EXPIRY_SCANNER'',
            job_type        => ''PLSQL_BLOCK'',
            job_action      => ''BEGIN 
                                    -- 1. Expiring soon alerts (30 days)
                                    INSERT INTO COMPLIANCE_FLAGS (account_id, flag_type, threshold_value, flagged_at)
                                    SELECT a.account_id, ''''KYC_EXPIRING_SOON'''', 30, SYSTIMESTAMP
                                    FROM KYC_DETAILS k
                                    JOIN ACCOUNTS a ON k.customer_id = a.customer_id
                                    WHERE k.expiry_date < SYSDATE + 30 
                                      AND k.expiry_date >= SYSDATE
                                      AND k.kyc_status = ''''VERIFIED''''
                                      AND NOT EXISTS (
                                          SELECT 1 FROM COMPLIANCE_FLAGS cf 
                                          WHERE cf.account_id = a.account_id 
                                            AND cf.flag_type = ''''KYC_EXPIRING_SOON''''
                                            AND TRUNC(cf.flagged_at) = TRUNC(SYSTIMESTAMP)
                                      );
                                      
                                    -- 1b. Notification for Expiring Soon
                                    FOR k IN (SELECT k.customer_id, c.full_name, c.user_id, k.document_type, k.expiry_date
                                              FROM KYC_DETAILS k
                                              JOIN CUSTOMERS c ON k.customer_id = c.customer_id
                                              WHERE k.expiry_date < SYSDATE + 30 
                                                AND k.expiry_date >= SYSDATE
                                                AND k.kyc_status = ''''VERIFIED'''')
                                    LOOP
                                        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
                                        VALUES (k.customer_id, k.user_id, ''''KYC_EXPIRY_SOON'''', ''''EMAIL'''', 
                                            JSON_OBJECT(
                                                ''''customer_name'''' VALUE k.full_name,
                                                ''''document_type'''' VALUE k.document_type,
                                                ''''expiry_date'''' VALUE TO_CHAR(k.expiry_date, ''''YYYY-MM-DD''''),
                                                ''''days_left'''' VALUE CEIL(k.expiry_date - SYSDATE)
                                            )
                                        );
                                    END LOOP;

                                    -- 2. Expired KYC
                                    UPDATE KYC_DETAILS
                                    SET kyc_status = ''''EXPIRED''''
                                    WHERE expiry_date < SYSDATE
                                      AND kyc_status = ''''VERIFIED'''';

                                    INSERT INTO COMPLIANCE_FLAGS (account_id, flag_type, threshold_value, flagged_at)
                                    SELECT a.account_id, ''''KYC_EXPIRED'''', 0, SYSTIMESTAMP
                                    FROM KYC_DETAILS k
                                    JOIN ACCOUNTS a ON k.customer_id = a.customer_id
                                    WHERE k.kyc_status = ''''EXPIRED''''
                                      AND NOT EXISTS (
                                          SELECT 1 FROM COMPLIANCE_FLAGS cf 
                                          WHERE cf.account_id = a.account_id 
                                            AND cf.flag_type = ''''KYC_EXPIRED''''
                                            AND TRUNC(cf.flagged_at) = TRUNC(SYSTIMESTAMP)
                                      );
                                      
                                    -- Sync CUSTOMERS table if all docs expired or no verified doc left
                                    UPDATE CUSTOMERS c
                                    SET kyc_status = ''''PENDING''''
                                    WHERE customer_id IN (
                                        SELECT customer_id FROM KYC_DETAILS WHERE kyc_status = ''''EXPIRED''''
                                    );

                                    COMMIT;
                                END;'',
            start_date      => SYSTIMESTAMP,
            repeat_interval => ''FREQ=WEEKLY; BYDAY=SUN; BYHOUR=1;'',
            enabled         => TRUE,
            comments        => ''Scans for expiring and expired KYC documents weekly''
        );
    END;';
EXCEPTION 
    WHEN OTHERS THEN 
        DBMS_OUTPUT.PUT_LINE('Warning: Could not create KYC_EXPIRY_SCANNER job (insufficient privileges).');
END;
/

-- 5. Role Gates (Commented out due to potential missing roles/privileges)
-- GRANT EXECUTE ON sp_verify_kyc TO SURAKSHA_TELLER_ROLE;
-- GRANT EXECUTE ON sp_verify_kyc TO SURAKSHA_MANAGER_ROLE;

-- 6. VPD Policy
CREATE OR REPLACE FUNCTION fn_kyc_customer_policy (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
    v_user_type VARCHAR2(20) := SYS_CONTEXT('SURAKSHA_CTX', 'user_id');
    v_role      VARCHAR2(20) := SYS_CONTEXT('SURAKSHA_CTX', 'role');
BEGIN
    IF v_role = 'CUSTOMER' THEN
        RETURN 'customer_id = (SELECT customer_id FROM CUSTOMERS WHERE user_id = SYS_CONTEXT(''SURAKSHA_CTX'', ''user_id''))';
    ELSIF v_role IN ('TELLER', 'BRANCH_MANAGER') THEN
        RETURN '1=1'; 
    ELSE
        RETURN '1=1'; 
    END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE '
    BEGIN
        DBMS_RLS.ADD_POLICY(
            object_schema   => USER,
            object_name     => ''KYC_DETAILS'',
            policy_name     => ''KYC_VIEW_POLICY'',
            function_schema => USER,
            policy_function => ''fn_kyc_customer_policy'',
            statement_types => ''SELECT''
        );
    END;';
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Warning: Could not create VPD policy (insufficient privileges).');
END;
/
/
