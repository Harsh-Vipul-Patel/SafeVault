-- Add session_token to USERS table to support single active session
ALTER TABLE USERS ADD (session_token VARCHAR2(255));
COMMIT;
