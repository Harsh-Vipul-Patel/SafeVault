SET PAGESIZE 100
SET LINESIZE 200

PROMPT -- USERS --
SELECT user_id, username, user_type FROM USERS ORDER BY username;

PROMPT -- CUSTOMERS --
SELECT customer_id, full_name, user_id FROM CUSTOMERS ORDER BY customer_id;

PROMPT -- ACCOUNTS --
SELECT account_id, account_number, customer_id, account_type_id, status FROM ACCOUNTS ORDER BY account_id;

EXIT;
