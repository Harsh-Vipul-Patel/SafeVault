-- Check Users
SELECT user_id, username, user_type FROM USERS ORDER BY username;

-- Check Customers
SELECT customer_id, full_name, user_id FROM CUSTOMERS ORDER BY customer_id;

-- Check Accounts
SELECT account_id, account_number, customer_id, account_type_id, balance FROM ACCOUNTS ORDER BY account_id;

EXIT;
