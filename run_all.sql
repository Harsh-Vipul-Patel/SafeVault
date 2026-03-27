-- Complete Setup Script for Suraksha Bank
-- Run this from SQL*Plus or SQLcl in the DBMS directory

PROMPT Starting Database Setup...

PROMPT 1. Creating Base Tables and Constraints...
@@db_setup.sql

PROMPT 2. Creating Triggers...
@@db_triggers.sql

PROMPT 3. Creating Core Stored Procedures (Part 1)...
@@db_procedures_1.sql

PROMPT 4. Creating Core Stored Procedures (Part 2)...
@@db_procedures_2.sql

PROMPT 5. Creating Loan Module Procedures...
@@db_loan_procedures.sql

PROMPT 6. Creating KYC Module Procedures...
@@db_kyc_setup.sql

PROMPT 7. Creating Cheque Module Procedures...
@@db_cheque_setup.sql

PROMPT 8. Creating Deposits Module Procedures...
@@db_deposits_setup.sql

PROMPT 9. Creating Standard Instructions Module...
@@db_instructions_setup.sql

PROMPT 10. Creating MIS & Dashboard Module...
@@db_mis_setup.sql

PROMPT 11. Creating Service Requests Module...
@@db_service_requests_setup.sql

PROMPT 12. Modifying Schemas for Resend Integration...
@@db_resend_setup.sql

PROMPT 13. Rebuilding OTP System Tables...
@@create_otps_table.sql

PROMPT 14. Applying Audit Logs & Settlement Patches...
@@fix_settlement_and_freeze.sql
@@fix_audit_logs.sql

PROMPT 15. Inserting Initial Seed Data...
@@db_seed.sql

PROMPT 16. Finalizing Seed Data...
@@db_final_seed.sql

PROMPT ====================================
PROMPT Complete Setup Finished Successfully!
PROMPT ====================================
EXIT;
