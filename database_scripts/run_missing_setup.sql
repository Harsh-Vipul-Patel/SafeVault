SET DEFINE OFF
SET SERVEROUTPUT ON
-- ============================================================
-- Suraksha Bank — Run Missing SQL Setup Scripts (Resilient Version)
-- This script handles dependencies and "soft-fails" on privilege issues.
-- ============================================================

PROMPT ============================================================
PROMPT Running missing SQL setup scripts in dependency order...
PROMPT ============================================================

PROMPT 1. Setting up Notification Log Table...
@@db_resend_setup.sql

PROMPT 2. Setting up Service Requests...
@@db_service_requests_setup.sql

PROMPT 3. Setting up Beneficiaries and Standing Instructions...
@@db_instructions_setup.sql

PROMPT 4. Setting up Deposits (FD/RD) tables and procedures...
@@db_deposits_setup.sql

PROMPT 5. Setting up MIS Views and Dashboard...
@@db_mis_setup.sql

PROMPT 6. Re-compiling Notification SPs (to validate against new views)...
ALTER PROCEDURE sp_generate_branch_mis COMPILE;

PROMPT 7. Setting up Cheque Management...
@@db_cheque_setup.sql

PROMPT 8. Setting up KYC...
@@db_kyc_setup.sql

PROMPT ============================================================
PROMPT All missing setup scripts executed!
PROMPT ============================================================
PROMPT Note: If you saw "Warning: Could not create ... job", it means
PROMPT you lack CREATE JOB privileges. The core banking features 
PROMPT will still work, but automated scans/tasks will be disabled.
PROMPT ============================================================
