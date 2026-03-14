-- Master Reset and Seed Script for Suraksha Bank
-- Run this as C##meet to completely reset and populate the database

PROMPT Dropping and Recreating Tables...
@@db_setup.sql

PROMPT Creating Triggers...
@@db_triggers.sql

PROMPT Creating Procedures...
@@db_procedures_1.sql
@@db_procedures_2.sql
@@db_loan_procedures.sql

PROMPT Seeding Data...
@@db_seed.sql
@@db_seed_fix.sql
@@add_customers.sql
@@db_final_seed.sql

PROMPT Database Setup and Seeding Complete.
EXIT;
