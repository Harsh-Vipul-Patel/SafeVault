-- Suraksha Bank — SERVICE_QUEUE Table
-- Run this in your Oracle DB after db_setup.sql

-- Drop if exists
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE SERVICE_QUEUE CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

CREATE TABLE SERVICE_QUEUE (
    queue_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_number VARCHAR2(20) NOT NULL,
    customer_name VARCHAR2(100) NOT NULL,
    service_type VARCHAR2(50) NOT NULL,
    priority NUMBER(1) DEFAULT 2 CHECK (priority IN (1, 2, 3)),
    status VARCHAR2(15) DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'SERVING', 'SERVED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
    served_by VARCHAR2(50),
    served_at TIMESTAMP WITH TIME ZONE,
    notes CLOB
);

-- Seed some initial queue entries for demo
INSERT INTO SERVICE_QUEUE (token_number, customer_name, service_type, priority, status)
VALUES ('A-047', 'Amit Kumar', 'Cash Withdrawal', 1, 'WAITING');

INSERT INTO SERVICE_QUEUE (token_number, customer_name, service_type, priority, status)
VALUES ('A-048', 'Sunita Rao', 'Open New Account', 2, 'WAITING');

INSERT INTO SERVICE_QUEUE (token_number, customer_name, service_type, priority, status)
VALUES ('A-049', 'Vikram Mehta', 'RTGS Transfer', 1, 'WAITING');

COMMIT;

PROMPT =============================================
PROMPT SERVICE_QUEUE table created and seeded.
PROMPT   3 WAITING entries added.
PROMPT =============================================
