-- Suraksha Bank — KYC Module (Oracle 21c)
-- This script adds KYC Management tables, procedures, and security.

-- 1. Create KYC_DETAILS Table
BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE KYC_DETAILS (
      kyc_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      customer_id     VARCHAR2(20) NOT NULL REFERENCES CUSTOMERS(customer_id),
      document_type   VARCHAR2(12) NOT NULL CHECK (document_type IN (''PAN'',''AADHAAR'',''PASSPORT'')),
      doc_number_masked VARCHAR2(20) NOT NULL,
      expiry_date     DATE,
      kyc_status      VARCHAR2(10) DEFAULT ''PENDING'' NOT NULL CHECK (kyc_status IN (''VERIFIED'',''PENDING'',''EXPIRED'')),
      verified_by     VARCHAR2(20) REFERENCES EMPLOYEES(employee_id),
      verified_at     TIMESTAMP WITH TIME ZONE,
      superseded_by   NUMBER REFERENCES KYC_DETAILS(kyc_id),
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
    )';
EXCEPTION WHEN OTHERS THEN 
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- 2. Audit Trigger for KYC_DETAILS
CREATE OR REPLACE TRIGGER trg_audit_kyc_change
AFTER INSERT OR UPDATE ON KYC_DETAILS
FOR EACH ROW
DECLARE
    v_old_json CLOB;
    v_new_json CLOB;
    v_op VARCHAR2(10);
BEGIN
    v_op := CASE WHEN INSERTING THEN 'INSERT' ELSE 'UPDATE' END;
    
    IF UPDATING THEN
        v_old_json := '{"status":"' || :OLD.kyc_status || '"}';
    END IF;
    
    v_new_json := '{"status":"' || :NEW.kyc_status || '", "type":"' || :NEW.document_type || '"}';
    
    INSERT INTO AUDIT_LOG (
        table_name, record_id, operation, changed_by, old_value_json, new_value_json, change_reason
    ) SELECT 
        'KYC_DETAILS', TO_CHAR(:NEW.kyc_id), v_op,
        USER, v_old_json, v_new_json, 'KYC Status Update'
    FROM DUAL;
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
    v_ms NUMBER;
    v_err_msg VARCHAR2(1000);
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
            NULL; 
    END;

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

    -- Log Success
    v_ms := (CAST(SYSTIMESTAMP AS DATE) - CAST(v_start_time AS DATE)) * 86400000;
    INSERT INTO PROCEDURE_EXECUTION_LOG (
        proc_name, called_by, execution_ms, success_flag
    ) SELECT 
        'sp_verify_kyc', p_teller_id, v_ms, 'Y'
    FROM DUAL;

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        v_ms := (CAST(SYSTIMESTAMP AS DATE) - CAST(v_start_time AS DATE)) * 86400000;
        v_err_msg := SUBSTR(SQLERRM, 1, 1000);
        INSERT INTO PROCEDURE_EXECUTION_LOG (
            proc_name, called_by, execution_ms, success_flag, error_message
        ) SELECT 
            'sp_verify_kyc', p_teller_id, v_ms, 'N', v_err_msg
        FROM DUAL;
        COMMIT;
        RAISE;
END;
/
