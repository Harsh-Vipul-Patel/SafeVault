set pagesize 100
set linesize 200
col username format a20
col role format a20

SELECT username, user_type, is_locked, failed_attempts FROM USERS;
SELECT employee_id, full_name, role FROM EMPLOYEES;

EXIT;
