-- Complete Setup Script for Suraksha Bank (SafeVault)
-- Run this from SQL*Plus or SQLcl in the DBMS/ directory
-- Usage: sqlplus C##YOURUSER/yourpass@localhost:1521/XEPDB1 @run_all.sql

PROMPT ====================================
PROMPT Suraksha Bank — Full Database Setup
PROMPT ====================================

PROMPT 1. Creating Base Tables and Constraints...
@@db_setup.sql

PROMPT 2. Creating Triggers...
@@db_triggers.sql

PROMPT 3. Creating Core Stored Procedures (Part 1)...
@@db_procedures_1.sql

PROMPT 4. Creating Core Stored Procedures (Part 2)...
@@db_procedures_2.sql

PROMPT 5. Creating Missing Procedures (External Transfer, Freeze, etc.)...
@@db_missing_procedures.sql

PROMPT 6. Creating Loan Module Procedures...
@@db_loan_procedures.sql

PROMPT 7. Creating KYC Module Procedures...
@@db_kyc_setup.sql

PROMPT 8. Creating Cheque Module Procedures...
@@db_cheque_setup.sql

PROMPT 9. Creating Deposits Module (FD/RD) Procedures...
@@db_deposits_setup.sql

PROMPT 10. Creating Standing Instructions Module...
@@db_instructions_setup.sql

PROMPT 11. Creating MIS & Dashboard Module...
@@db_mis_setup.sql

PROMPT 12. Creating Service Requests Module...
@@db_service_requests_setup.sql

PROMPT 13. Modifying Schemas for Resend Integration (Email)...
@@db_resend_setup.sql

PROMPT 14. Rebuilding OTP System Tables...
@@create_otps_table.sql

PROMPT 15. Applying Audit Logs & Settlement Patches...
@@fix_settlement_and_freeze.sql
@@fix_audit_logs.sql

PROMPT 16. Inserting Initial Seed Data (Branches, Account Types, Config)...
@@db_seed.sql

PROMPT 17. Finalizing Seed Data (Customers, Accounts)...
@@db_final_seed.sql

PROMPT 18. Fixing EMI Column Sizes (VARCHAR2 20 -> 40)...
@@fix_emi_column_size.sql

PROMPT 19. Fixing Loan Disbursement & EMI Auto-Generation...
@@fix_disburse_emi.sql

PROMPT 20. Creating Standing Instruction Scheduler Job...
@@db_si_scheduler.sql

PROMPT 21. Applying Loan & MIS Fixes...
@@fix_loan_and_mis.sql

PROMPT ====================================
PROMPT Complete Setup Finished Successfully!
PROMPT ====================================

COMMIT;
