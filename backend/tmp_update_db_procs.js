const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('Updating SP_WITHDRAW...');
        await connection.execute(`
CREATE OR REPLACE PROCEDURE sp_withdraw (
    p_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_teller_id IN VARCHAR2
) AS
    v_balance NUMBER;
    v_min NUMBER;
    v_status VARCHAR2(10);
BEGIN
    EXECUTE IMMEDIATE 'SELECT balance, minimum_balance, status FROM ACCOUNTS WHERE account_id = :1 FOR UPDATE WAIT 5'
    INTO v_balance, v_min, v_status USING p_account_id;

    IF v_status != 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20003, 'Account is ' || v_status || '. Cannot withdraw.');
    END IF;

    IF v_balance - p_amount < v_min THEN
        RAISE_APPLICATION_ERROR(-20001, 'Insufficient funds. Minimum balance must be maintained.');
    END IF;

    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_account_id, 'DEBIT', p_amount, v_balance - p_amount, p_teller_id);

    DECLARE
        v_fee NUMBER;
    BEGIN
        v_fee := fn_calculate_fee('CASH_WTH', p_amount);
        IF v_fee > 0 THEN
            UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_account_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (p_account_id, 'FEE_DEBIT', v_fee, v_balance - p_amount - v_fee, 'SYSTEM', 'Cash Withdrawal Fee');
        END IF;
    END;

    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_acc_num VARCHAR2(18);
        v_user RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, a.account_number, c.user_id
        INTO v_cust_name, v_cust_id, v_acc_num, v_user
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_account_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'TXN_ALERT', 'EMAIL',
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'txn_type' VALUE 'DEBIT',
                'amount' VALUE p_amount,
                'balance_after' VALUE v_balance - p_amount,
                'txn_id' VALUE 'WTH-' || TO_CHAR(SYSTIMESTAMP, 'FF4'),
                'txn_timestamp' VALUE TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'account_number' VALUE v_acc_num,
                'method' VALUE 'Cash Withdrawal at Branch'
            )
        );
    END;

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;`);

        console.log('Updating SP_DEPOSIT...');
        await connection.execute(`
CREATE OR REPLACE PROCEDURE sp_deposit (
    p_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_teller_id IN VARCHAR2
) AS
    v_balance NUMBER;
    v_status VARCHAR2(10);
BEGIN
    SELECT balance, status INTO v_balance, v_status
    FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;

    IF v_status NOT IN ('ACTIVE', 'DORMANT') THEN
        RAISE_APPLICATION_ERROR(-20003, 'Account is ' || v_status || '. Cannot deposit.');
    END IF;

    UPDATE ACCOUNTS SET balance = balance + p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by)
    VALUES (p_account_id, 'CREDIT', p_amount, v_balance + p_amount, p_teller_id);

    DECLARE
        v_fee NUMBER;
    BEGIN
        v_fee := fn_calculate_fee('CASH_DEP', p_amount);
        IF v_fee > 0 THEN
            UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_account_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (p_account_id, 'FEE_DEBIT', v_fee, v_balance + p_amount - v_fee, 'SYSTEM', 'Cash Deposit Fee');
        END IF;
    END;

    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_acc_num VARCHAR2(18);
        v_user RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, a.account_number, c.user_id
        INTO v_cust_name, v_cust_id, v_acc_num, v_user
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_account_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'TXN_ALERT', 'EMAIL',
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'txn_type' VALUE 'CREDIT',
                'amount' VALUE p_amount,
                'balance_after' VALUE v_balance + p_amount,
                'txn_id' VALUE 'DEP-' || TO_CHAR(SYSTIMESTAMP, 'FF4'),
                'txn_timestamp' VALUE TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'account_number' VALUE v_acc_num,
                'method' VALUE 'Cash Deposit at Branch'
            )
        );
    END;

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;`);

        console.log('Updating SP_TRANSFER...');
        await connection.execute(`
CREATE OR REPLACE PROCEDURE sp_transfer (
    p_from_account_id IN VARCHAR2,
    p_to_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_initiated_by IN VARCHAR2
) AS
    v_from_bal NUMBER;
    v_from_min NUMBER;
    v_to_bal NUMBER;
    v_from_status VARCHAR2(10);
    v_to_status VARCHAR2(10);
    
    v_sender_acc_num VARCHAR2(18);
    v_receiver_acc_num VARCHAR2(18);
BEGIN
    SELECT balance, minimum_balance, status, account_number INTO v_from_bal, v_from_min, v_from_status, v_sender_acc_num
    FROM ACCOUNTS WHERE account_id = p_from_account_id FOR UPDATE;

    SELECT balance, status, account_number INTO v_to_bal, v_to_status, v_receiver_acc_num
    FROM ACCOUNTS WHERE account_id = p_to_account_id FOR UPDATE;

    IF v_from_status != 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20003, 'Source account is not ACTIVE.');
    END IF;
    IF v_to_status NOT IN ('ACTIVE', 'DORMANT') THEN
        RAISE_APPLICATION_ERROR(-20003, 'Destination account cannot receive funds.');
    END IF;

    IF v_from_bal - p_amount < v_from_min THEN
        RAISE_APPLICATION_ERROR(-20001, 'Insufficient funds for transfer.');
    END IF;

    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_from_account_id;
    UPDATE ACCOUNTS SET balance = balance + p_amount WHERE account_id = p_to_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, related_account_id, initiated_by)
    VALUES (p_from_account_id, 'TRANSFER_DEBIT', p_amount, v_from_bal - p_amount, p_to_account_id, p_initiated_by);

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, related_account_id, initiated_by)
    VALUES (p_to_account_id, 'TRANSFER_CREDIT', p_amount, v_to_bal + p_amount, p_from_account_id, p_initiated_by);

    DECLARE
        v_fee NUMBER;
    BEGIN
        v_fee := fn_calculate_fee('INT_TRF', p_amount);
        IF v_fee > 0 THEN
            UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_from_account_id;
            INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
            VALUES (p_from_account_id, 'FEE_DEBIT', v_fee, v_from_bal - p_amount - v_fee, 'SYSTEM', 'Internal Transfer Fee');
            v_from_bal := v_from_bal - v_fee; -- Adjust for later usage if needed
        END IF;
    END;

    DECLARE
        v_s_name VARCHAR2(100); v_s_user RAW(16); v_s_cust VARCHAR2(20);
        v_r_name VARCHAR2(100); v_r_user RAW(16); v_r_cust VARCHAR2(20);
        v_ts TIMESTAMP := SYSTIMESTAMP;
        v_ref VARCHAR2(30) := 'TRF-' || TO_CHAR(v_ts, 'FF4');
        v_ts_str VARCHAR2(100) := TO_CHAR(v_ts, 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    BEGIN
        SELECT c.full_name, c.user_id, c.customer_id INTO v_s_name, v_s_user, v_s_cust FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_from_account_id;
        SELECT c.full_name, c.user_id, c.customer_id INTO v_r_name, v_r_user, v_r_cust FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id WHERE a.account_id = p_to_account_id;

        -- Sender Email
        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_s_cust, v_s_user, 'TXN_ALERT', 'EMAIL', JSON_OBJECT(
            'customer_name' VALUE v_s_name, 'txn_type' VALUE 'DEBIT', 'amount' VALUE p_amount, 'balance_after' VALUE v_from_bal - p_amount, 'txn_id' VALUE v_ref, 'txn_timestamp' VALUE v_ts_str, 'account_number' VALUE v_sender_acc_num, 'method' VALUE 'Internal Transfer to ' || v_receiver_acc_num
        ));

        -- Receiver Email
        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_r_cust, v_r_user, 'TXN_ALERT', 'EMAIL', JSON_OBJECT(
            'customer_name' VALUE v_r_name, 'txn_type' VALUE 'CREDIT', 'amount' VALUE p_amount, 'balance_after' VALUE v_to_bal + p_amount, 'txn_id' VALUE v_ref, 'txn_timestamp' VALUE v_ts_str, 'account_number' VALUE v_receiver_acc_num, 'method' VALUE 'Internal Transfer from ' || v_sender_acc_num
        ));
    END;

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;`);

        console.log('Updating SP_INITIATE_EXTERNAL_TRANSFER...');
        await connection.execute(`
CREATE OR REPLACE PROCEDURE sp_initiate_external_transfer (
    p_account_id IN VARCHAR2,
    p_amount IN NUMBER,
    p_ifsc IN VARCHAR2,
    p_acc_no IN VARCHAR2,
    p_mode IN VARCHAR2,
    p_initiated_by IN VARCHAR2
) AS
    v_balance NUMBER;
    v_min NUMBER;
    v_status VARCHAR2(10);
    v_fee NUMBER;
BEGIN
    SELECT balance, minimum_balance, status INTO v_balance, v_min, v_status
    FROM ACCOUNTS WHERE account_id = p_account_id FOR UPDATE;

    IF v_status != 'ACTIVE' THEN
        RAISE_APPLICATION_ERROR(-20003, 'Account is not ACTIVE.');
    END IF;

    -- Calculate Fee First
    v_fee := fn_calculate_fee(p_mode, p_amount);

    -- Check balance including transfer amount and fee
    IF v_balance - p_amount - v_fee < v_min THEN
        RAISE_APPLICATION_ERROR(-20001, 'Insufficient funds (Amount + Fee: ' || (p_amount + v_fee) || ').');
    END IF;

    -- Escrow Funds (Deduct immediately)
    UPDATE ACCOUNTS SET balance = balance - p_amount WHERE account_id = p_account_id;

    INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, status)
    VALUES (p_account_id, 'EXTERNAL_DEBIT', p_amount, v_balance - p_amount, p_initiated_by, 'PENDING');

    -- Fee Deduction
    IF v_fee > 0 THEN
        UPDATE ACCOUNTS SET balance = balance - v_fee WHERE account_id = p_account_id;
        INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, description)
        VALUES (p_account_id, 'FEE_DEBIT', v_fee, v_balance - p_amount - v_fee, 'SYSTEM', p_mode || ' Transfer Fee');
    END IF;

    INSERT INTO PENDING_EXTERNAL_TRANSFERS (source_account_id, amount, destination_ifsc, destination_account, transfer_mode, initiated_by)
    VALUES (p_account_id, p_amount, p_ifsc, p_acc_no, p_mode, p_initiated_by);

    -- Notification
    DECLARE
        v_cust_name VARCHAR2(100);
        v_cust_id VARCHAR2(20);
        v_user RAW(16);
    BEGIN
        SELECT c.full_name, c.customer_id, c.user_id 
        INTO v_cust_name, v_cust_id, v_user
        FROM CUSTOMERS c JOIN ACCOUNTS a ON c.customer_id = a.customer_id 
        WHERE a.account_id = p_account_id;

        INSERT INTO NOTIFICATION_LOG (customer_id, user_id, trigger_event, channel, message_clob)
        VALUES (v_cust_id, v_user, 'EXT_TXN_INITIATED', 'EMAIL', 
            JSON_OBJECT(
                'customer_name' VALUE v_cust_name,
                'amount' VALUE p_amount,
                'dest_acc' VALUE p_acc_no,
                'status' VALUE 'PENDING',
                'method' VALUE p_mode || ' Transfer'
            )
        );
    END;

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;`);

        console.log('Database updates completed successfully.');
    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch(e) { console.error(e); }
        }
    }
}

run();
