-- Fix for ORA-01031: insufficient privileges when setting SURAKSHA_CTX

-- 1. Create a trusted package to handle session contexts securely
CREATE OR REPLACE PACKAGE pkg_suraksha_ctx AS
    PROCEDURE set_ctx(p_name IN VARCHAR2, p_value IN VARCHAR2);
END;
/

CREATE OR REPLACE PACKAGE BODY pkg_suraksha_ctx AS
    PROCEDURE set_ctx(p_name IN VARCHAR2, p_value IN VARCHAR2) IS
    BEGIN
        DBMS_SESSION.SET_CONTEXT('SURAKSHA_CTX', p_name, p_value);
    END;
END;
/

-- 2. Create/Replace the context and map it to the trusted package
-- NOTE: If this command fails with insufficient privileges, run this script as SYSTEM or SYSDBA!
CREATE OR REPLACE CONTEXT SURAKSHA_CTX USING pkg_suraksha_ctx;

-- 3. Update sp_set_account_status to use the new trusted package instead of DBMS_SESSION directly
CREATE OR REPLACE PROCEDURE sp_set_account_status (
    p_account_id IN VARCHAR2,
    p_new_status IN VARCHAR2,
    p_manager_id IN VARCHAR2,
    p_reason IN VARCHAR2
) AS
BEGIN
    -- Authorization check should be at app layer, but setting context here enables triggers to log reason
    pkg_suraksha_ctx.set_ctx('change_reason', p_reason);
    
    UPDATE ACCOUNTS SET status = p_new_status WHERE account_id = p_account_id;
    COMMIT;
END;
/
