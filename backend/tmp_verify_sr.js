const oracledb = require('oracledb');
require('dotenv').config();

// We'll simulate the backend logic or just make an API call. For simplicity, we'll write a small node script that calls the API directly to test the flow end-to-end to ensure `processPendingNotifications` actually inserts / triggers the emails correctly.

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('1. Finding a test customer...');
        const custRes = await connection.execute(
            `SELECT c.customer_id, c.user_id, c.email, u.username, u.session_token
             FROM CUSTOMERS c JOIN USERS u ON c.user_id = u.user_id
             WHERE c.email IS NOT NULL AND ROWNUM = 1`
        );
        const cust = custRes.rows[0];
        console.log('Using customer:', cust[2]);

        console.log('\n2. Creating a service request via DB procedure directly (to test procedure)...');
        await connection.execute(
            `BEGIN sp_create_service_request(:cust_id, 'OTHER', 'This is a test request from node script.'); END;`,
            { cust_id: cust[0] },
            { autoCommit: true }
        );

        console.log('\n3. Waiting 2s for trigger...');
        await new Promise(r => setTimeout(r, 2000));

        console.log('\n4. Checking NOTIFICATION_LOG for SR_CREATED...');
        let notifs = await connection.execute(
            `SELECT notif_id, trigger_event, status FROM NOTIFICATION_LOG WHERE customer_id = :cust_id ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
            { cust_id: cust[0] }
        );
        console.log('Latest customer notification:', notifs.rows[0]);

        console.log('\n5. Finding a teller to resolve it...');
        const tellerRes = await connection.execute(
            `SELECT employee_id FROM EMPLOYEES WHERE role IN ('TELLER', 'BRANCH_MANAGER') AND ROWNUM = 1`
        );
        const tellerId = tellerRes.rows[0][0];

        const srRes = await connection.execute(
            `SELECT sr_id FROM SERVICE_REQUESTS WHERE customer_id = :cust_id ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
            { cust_id: cust[0] }
        );
        const srId = srRes.rows[0][0];
        console.log('Resolving SR_ID:', srId, 'by Teller:', tellerId);

        await connection.execute(
            `BEGIN sp_resolve_service_request(:sr_id, 'RESOLVED', 'Resolved automatically by test script.', :teller); END;`,
            { sr_id: srId, teller: tellerId },
            { autoCommit: true }
        );

        console.log('\n6. Checking NOTIFICATION_LOG for SR_RESOLVED...');
        notifs = await connection.execute(
            `SELECT notif_id, trigger_event, status FROM NOTIFICATION_LOG WHERE customer_id = :cust_id ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
            { cust_id: cust[0] }
        );
        console.log('Latest customer notification:', notifs.rows[0]);

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch(e) { console.error(e); }
        }
    }
}

run();
