-- Complete Setup Script for Suraksha Bank
-- Run this from SQL*Plus or SQLcl in the DBMS directory

PROMPT Starting Database Setup...

PROMPT 1. Creating Tables and Constraints...
@@db_setup.sql

PROMPT 2. Creating Triggers...
@@db_triggers.sql

PROMPT 3. Creating Stored Procedures (Part 1)...
@@db_procedures_1.sql

PROMPT 4. Creating Stored Procedures (Part 2)...
@@db_procedures_2.sql

PROMPT 5. Creating Stored Procedures (Loan Module)...
@@db_loan_procedures.sql

PROMPT 6. Inserting Seed Data...
@@db_seed.sql

PROMPT Complete Setup Finished.
EXIT;
