SET PAGESIZE 100
SET LINESIZE 200
COLUMN username FORMAT A20
COLUMN full_name FORMAT A20
COLUMN role FORMAT A20
COLUMN is_active FORMAT A10

PROMPT --- USERS ---
SELECT user_id, username, user_type, is_locked, session_token FROM USERS;

PROMPT --- EMPLOYEES ---
SELECT employee_id, user_id, full_name, role, is_active FROM EMPLOYEES;

PROMPT --- STAFF ---
-- Checking if STAFF table exists as it was used in tellerRoutes
SELECT * FROM USER_TABLES WHERE table_name = 'STAFF';
