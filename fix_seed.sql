INSERT INTO USERS (username, password_hash, user_type) VALUES ('a.krishnan', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'EMPLOYEE');
COMMIT;

INSERT INTO EMPLOYEES (employee_id, branch_id, full_name, role, hire_date, is_active, user_id)
SELECT 'EMP-MUM-LOAN-01', 'BRN-MUM-003', 'A. Krishnan', 'LOAN_MANAGER', DATE '2021-03-10', '1', user_id
FROM USERS WHERE username = 'a.krishnan';
COMMIT;

SELECT username FROM USERS WHERE username = 'a.krishnan';
EXIT;
