-- Suraksha Bank — Service Requests (Oracle 21c)

-- 1. Table
CREATE TABLE SERVICE_REQUESTS (
  sr_id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id     VARCHAR2(20) NOT NULL REFERENCES CUSTOMERS(customer_id),
  branch_id       VARCHAR2(20) NOT NULL REFERENCES BRANCHES(branch_id),
  request_type    VARCHAR2(40) NOT NULL
                  CHECK (request_type IN ('ADDRESS_CHANGE','MOBILE_UPDATE','EMAIL_UPDATE','ACCOUNT_UPGRADE','OTHER')),
  description     CLOB NOT NULL,
  status          VARCHAR2(15) DEFAULT 'PENDING' NOT NULL
                  CHECK (status IN ('PENDING','ASSIGNED','RESOLVED','REJECTED')),
  assigned_to     VARCHAR2(20) REFERENCES EMPLOYEES(employee_id),
  resolved_by     VARCHAR2(20) REFERENCES EMPLOYEES(employee_id),
  resolution_notes CLOB,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  resolved_at     TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_sr_customer ON SERVICE_REQUESTS(customer_id);
CREATE INDEX idx_sr_status   ON SERVICE_REQUESTS(status);
CREATE INDEX idx_sr_branch   ON SERVICE_REQUESTS(branch_id);

-- 2. Trigger: trg_prevent_sr_modification
CREATE OR REPLACE TRIGGER trg_prevent_sr_modification
BEFORE UPDATE ON SERVICE_REQUESTS
FOR EACH ROW
BEGIN
    IF :OLD.status IN ('RESOLVED', 'REJECTED') THEN
        RAISE_APPLICATION_ERROR(-20043, 'Resolved service requests are immutable.');
    END IF;
END;
/

-- 3. Procedures
CREATE OR REPLACE PROCEDURE sp_create_service_request (
    p_customer_id IN VARCHAR2,
    p_type IN VARCHAR2,
    p_desc IN CLOB,
    p_branch_id IN VARCHAR2 DEFAULT NULL
) AS
    v_branch_id VARCHAR2(20);
BEGIN
    IF p_branch_id IS NOT NULL THEN
        v_branch_id := p_branch_id;
    ELSE
        SELECT home_branch_id INTO v_branch_id FROM ACCOUNTS WHERE customer_id = p_customer_id FETCH FIRST 1 ROWS ONLY;
    END IF;

    INSERT INTO SERVICE_REQUESTS (customer_id, branch_id, request_type, description)
    VALUES (p_customer_id, v_branch_id, p_type, p_desc);
    
    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_user RAW(16);
    BEGIN
        SELECT full_name, user_id INTO v_cust_name, v_user FROM CUSTOMERS WHERE customer_id = p_customer_id;
        
        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (p_customer_id, v_user, 'SR_CREATED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'request_type' VALUE p_type,
                'description' VALUE p_desc
            )
        );
    END;

    COMMIT;
END;
/

CREATE OR REPLACE PROCEDURE sp_resolve_service_request (
    p_sr_id IN NUMBER,
    p_status IN VARCHAR2,
    p_notes IN CLOB,
    p_employee_id IN VARCHAR2
) AS
    v_sr_branch VARCHAR2(20);
    v_emp_branch VARCHAR2(20);
BEGIN
    SELECT branch_id INTO v_sr_branch FROM SERVICE_REQUESTS WHERE sr_id = p_sr_id;
    SELECT branch_id INTO v_emp_branch FROM EMPLOYEES WHERE employee_id = p_employee_id;

    IF v_sr_branch != v_emp_branch THEN
        RAISE_APPLICATION_ERROR(-20042, 'Service request belongs to a different branch.');
    END IF;

    UPDATE SERVICE_REQUESTS SET
        status = p_status,
        resolution_notes = p_notes,
        resolved_by = p_employee_id,
        resolved_at = SYSTIMESTAMP
    WHERE sr_id = p_sr_id;

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_user RAW(16);
        v_req_type VARCHAR2(40);
    BEGIN
        SELECT c.full_name, c.customer_id, c.user_id, sr.request_type 
        INTO v_cust_name, v_cust_id, v_user, v_req_type
        FROM CUSTOMERS c JOIN SERVICE_REQUESTS sr ON c.customer_id = sr.customer_id 
        WHERE sr.sr_id = p_sr_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'SR_RESOLVED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'request_type' VALUE v_req_type,
                'status' VALUE p_status,
                'resolution_notes' VALUE p_notes
            )
        );
    END;

    COMMIT;
END;
/
