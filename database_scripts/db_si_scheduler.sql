-- Suraksha Bank — Standing Instruction Daily Scheduler (Oracle 21c)
-- This script creates a wrapper procedure and a DBMS_SCHEDULER job
-- to automatically execute all due standing instructions daily at 07:00.

-- 1. Wrapper procedure: loops through all due ACTIVE standing instructions
CREATE OR REPLACE PROCEDURE sp_execute_all_standing_instructions AS
    CURSOR c_due_instructions IS
        SELECT instruction_id
        FROM STANDING_INSTRUCTIONS
        WHERE status = 'ACTIVE'
          AND next_execution_date <= TRUNC(SYSDATE);
BEGIN
    FOR rec IN c_due_instructions LOOP
        BEGIN
            sp_execute_standing_instruction(rec.instruction_id);
        EXCEPTION
            WHEN OTHERS THEN
                -- Log error but continue processing remaining instructions
                DBMS_OUTPUT.PUT_LINE('SI Error for ID ' || rec.instruction_id || ': ' || SQLERRM);
        END;
    END LOOP;
    COMMIT;
END;
/

-- 2. DBMS_SCHEDULER job: runs the wrapper daily at 07:00
BEGIN
    BEGIN
        DBMS_SCHEDULER.DROP_JOB(job_name => 'SI_DAILY_EXECUTOR', force => TRUE);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_SCHEDULER.CREATE_JOB (
        job_name        => 'SI_DAILY_EXECUTOR',
        job_type        => 'PLSQL_BLOCK',
        job_action      => 'BEGIN sp_execute_all_standing_instructions; END;',
        start_date      => SYSTIMESTAMP,
        repeat_interval => 'FREQ=HOURLY; BYMINUTE=0; BYSECOND=0;',
        enabled         => TRUE,
        comments        => 'Hourly executor for due standing instructions (resilient to offline periods)'
    );
    
    DBMS_OUTPUT.PUT_LINE('SUCCESS: SI_DAILY_EXECUTOR job created and enabled (Hourly sweep).');
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('WARNING: Could not create SI_DAILY_EXECUTOR job — ' || SQLERRM);
        DBMS_OUTPUT.PUT_LINE('The procedure sp_execute_all_standing_instructions is still available for manual execution.');
END;
/

-- Verification query (run after executing this script):
-- SELECT job_name, state, repeat_interval FROM USER_SCHEDULER_JOBS WHERE job_name = 'SI_DAILY_EXECUTOR';
