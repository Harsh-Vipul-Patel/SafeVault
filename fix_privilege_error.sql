-- Fix for ORA-01031: Privilege Bypass using DBMS_APPLICATION_INFO

-- 1. Update the Account Status Audit Trigger to support CLIENT_INFO
CREATE OR REPLACE TRIGGER trg_audit_status_change
AFTER UPDATE OF status ON ACCOUNTS
FOR EACH ROW
WHEN (OLD.status <> NEW.status)
BEGIN
    INSERT INTO AUDIT_LOG (
        table_name, record_id, operation, changed_by, old_value_json, new_value_json, change_reason
    ) VALUES (
        'ACCOUNTS', 
        :NEW.account_id, 
        'UPDATE_STATUS', 
        NVL(SYS_CONTEXT('USERENV', 'CLIENT_IDENTIFIER'), 'SYSTEM'),
        '{"status": "' || :OLD.status || '"}',
        '{"status": "' || :NEW.status || '"}',
        COALESCE(SYS_CONTEXT('USERENV', 'CLIENT_INFO'), SYS_CONTEXT('SURAKSHA_CTX', 'change_reason'))
    );
END;
/

-- 2. Update sp_set_account_status to use standard connection CLIENT_INFO
CREATE OR REPLACE PROCEDURE sp_set_account_status (
    p_account_id IN VARCHAR2,
    p_new_status IN VARCHAR2,
    p_manager_id IN VARCHAR2,
    p_reason IN VARCHAR2
) AS
BEGIN
    -- Use DBMS_APPLICATION_INFO to safely pass the reason to the trigger without needing a DBA Context
    DBMS_APPLICATION_INFO.SET_CLIENT_INFO(p_reason);
    
    UPDATE ACCOUNTS SET status = p_new_status WHERE account_id = p_account_id;
    
    -- Clear the client info after update
    DBMS_APPLICATION_INFO.SET_CLIENT_INFO(NULL);
    COMMIT;
END;
/
