SET PAGESIZE 50
SET LINESIZE 200
COL OPERATION_TYPE FOR A20
COL STATUS FOR A15
SELECT queue_id, requested_by, operation_type, status FROM DUAL_APPROVAL_QUEUE;
SELECT transaction_id, account_id, transaction_type, amount FROM TRANSACTIONS ORDER BY transaction_date DESC FETCH FIRST 5 ROWS ONLY;
EXIT;
