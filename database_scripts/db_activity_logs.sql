-- Suraksha Bank — System Activity Logs (Oracle 21c)
-- Secure table to store all frontend visits, logins, and oracle procedures

BEGIN
    EXECUTE IMMEDIATE 'CREATE TABLE SYSTEM_ACTIVITY_LOG (
        log_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id         RAW(16),  -- Can be NULL for unauthenticated visits
        username        VARCHAR2(50),
        user_role       VARCHAR2(50),
        action_type     VARCHAR2(50) NOT NULL, -- e.g., PAGE_VISIT, LOGIN, ORACLE_PROCEDURE
        description     VARCHAR2(500) NOT NULL,
        endpoint        VARCHAR2(200),
        ip_address      VARCHAR2(45),
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
    )';
EXCEPTION WHEN OTHERS THEN 
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

-- Add foreign key if USERS table exists and user_id is provided
ALTER TABLE SYSTEM_ACTIVITY_LOG 
ADD CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES USERS(user_id) ON DELETE SET NULL;

COMMIT;
