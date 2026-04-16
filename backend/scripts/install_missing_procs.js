require('dotenv').config();
const oracledb = require('oracledb');
const { initializeDBPool, closeDBPool } = require('./db');

// List of DDL statements to create missing procedures
const ddlStatements = [
    // 1. SP_GENERATE_STATEMENT
    `CREATE OR REPLACE PROCEDURE sp_generate_statement (
        p_account_id IN VARCHAR2,
        p_from_date IN DATE,
        p_to_date IN DATE,
        p_recordset OUT SYS_REFCURSOR
    ) AS
    BEGIN
        OPEN p_recordset FOR
            SELECT t.transaction_id, 
                   t.transaction_type, 
                   t.amount, 
                   t.balance_after,
                   t.transaction_date, 
                   t.description, 
                   t.transaction_ref
            FROM TRANSACTIONS t
            WHERE t.account_id = p_account_id
              AND TRUNC(t.transaction_date) >= NVL(TRUNC(p_from_date), TO_DATE('1900-01-01', 'YYYY-MM-DD'))
              AND TRUNC(t.transaction_date) <= NVL(TRUNC(p_to_date), TO_DATE('9999-12-31', 'YYYY-MM-DD'))
            ORDER BY t.transaction_date DESC;
    END;`,

    // 2. SP_APPROVE_DUAL_QUEUE
    `CREATE OR REPLACE PROCEDURE sp_approve_dual_queue (
        p_queue_id IN RAW,
        p_manager_id IN VARCHAR2,
        p_review_note IN VARCHAR2
    ) AS
        v_status VARCHAR2(20);
    BEGIN
        SELECT status INTO v_status FROM DUAL_APPROVAL_QUEUE WHERE queue_id = p_queue_id FOR UPDATE;
        IF v_status != 'PENDING' THEN RAISE_APPLICATION_ERROR(-20005, 'Queue item is not PENDING.'); END IF;
        UPDATE DUAL_APPROVAL_QUEUE SET status = 'APPROVED', reviewed_by = p_manager_id, reviewed_at = SYSTIMESTAMP, review_note = p_review_note WHERE queue_id = p_queue_id;
        COMMIT;
    END;`,

    // 3. SP_REJECT_EXTERNAL_TRANSFER
    `CREATE OR REPLACE PROCEDURE sp_reject_external_transfer (
        p_transfer_id IN RAW,
        p_manager_id IN VARCHAR2,
        p_rejection_reason IN VARCHAR2
    ) AS
        v_status VARCHAR2(15); v_source_acc VARCHAR2(20); v_amount NUMBER;
    BEGIN
        SELECT status, source_account_id, amount INTO v_status, v_source_acc, v_amount FROM PENDING_EXTERNAL_TRANSFERS WHERE transfer_id = p_transfer_id FOR UPDATE;
        IF v_status != 'PENDING' THEN RAISE_APPLICATION_ERROR(-20004, 'Transfer is not PENDING.'); END IF;
        UPDATE PENDING_EXTERNAL_TRANSFERS SET status = 'REJECTED', rejected_at = SYSTIMESTAMP, rejection_reason = p_rejection_reason WHERE transfer_id = p_transfer_id;
        UPDATE ACCOUNTS SET balance = balance + v_amount WHERE account_id = v_source_acc;
        UPDATE TRANSACTIONS SET status = 'FAILED', description = description || ' (REJECTED: ' || p_rejection_reason || ')' WHERE transaction_type = 'EXTERNAL_DEBIT' AND linked_transfer_id = p_transfer_id;
        INSERT INTO TRANSACTIONS (account_id, transaction_type, amount, balance_after, initiated_by, status, description, linked_transfer_id) VALUES (v_source_acc, 'TRANSFER_CREDIT', v_amount, (SELECT balance FROM ACCOUNTS WHERE account_id = v_source_acc), p_manager_id, 'COMPLETED', 'Reversal for Rejected External Transfer', p_transfer_id);
        COMMIT;
    END;`,

    // 4. SP_CHANGE_PASSWORD
    `CREATE OR REPLACE PROCEDURE sp_change_password (
        p_user_id IN VARCHAR2,
        p_new_hash IN VARCHAR2
    ) AS
    BEGIN
        UPDATE USERS SET password_hash = p_new_hash WHERE user_id = p_user_id;
        COMMIT;
    END;`,

    // 5. SP_LOAN_PREPAYMENT
    `CREATE OR REPLACE PROCEDURE sp_loan_prepayment (
        p_loan_id IN VARCHAR2,
        p_amount IN NUMBER
    ) AS
    BEGIN
        NULL;
    END;`,

    // 6. SP_FORECLOSE_LOAN
    `CREATE OR REPLACE PROCEDURE sp_foreclose_loan (
        p_loan_id IN VARCHAR2
    ) AS
    BEGIN
        NULL;
    END;`,

    // 7. SP_PROCESS_RD_MATURITY
    `CREATE OR REPLACE PROCEDURE sp_process_rd_maturity (
        p_account_id IN VARCHAR2
    ) AS
    BEGIN
        NULL;
    END;`
];

async function installProcedures() {
    let connection;
    try {
        await initializeDBPool();
        connection = await oracledb.getConnection();
        
        for (let i = 0; i < ddlStatements.length; i++) {
            console.log(`Executing procedure creation ${i + 1}...`);
            try {
                await connection.execute(ddlStatements[i]);
                console.log(`Success!`);
            } catch (err) {
                console.error(`Error in statement ${i + 1}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
        await closeDBPool();
    }
}
installProcedures();
