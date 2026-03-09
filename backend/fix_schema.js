const oracledb = require('oracledb');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

async function fixSchema() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING
        });

        console.log('--- FIXING SCHEMA ---');

        const createNotifLog = `
            CREATE TABLE NOTIFICATION_LOG (
                notif_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                customer_id VARCHAR2(20),
                user_id RAW(16),
                trigger_event VARCHAR2(50),
                channel VARCHAR2(20),
                message_clob CLOB,
                status VARCHAR2(20) DEFAULT 'PENDING',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
            )
        `;

        const createServiceQueue = `
            CREATE TABLE SERVICE_QUEUE (
                queue_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                token_number VARCHAR2(10) UNIQUE,
                customer_name VARCHAR2(100),
                service_type VARCHAR2(50),
                priority NUMBER DEFAULT 2,
                status VARCHAR2(20) DEFAULT 'WAITING',
                served_by VARCHAR2(20),
                served_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
            )
        `;

        const tables = await conn.execute(`SELECT table_name FROM user_tables`);
        const tableList = tables.rows.map(r => r[0]);

        if (!tableList.includes('NOTIFICATION_LOG')) {
            console.log('Creating NOTIFICATION_LOG...');
            await conn.execute(createNotifLog);
        }

        if (!tableList.includes('SERVICE_QUEUE')) {
            console.log('Creating SERVICE_QUEUE...');
            await conn.execute(createServiceQueue);
        }

        // Also check for OTPS table structure (seen in get_schema)
        // It seems OK in get_schema output.

        console.log('Schema fix complete.');
    } catch (err) {
        console.error('Error fixing schema:', err);
    } finally {
        if (conn) await conn.close();
    }
}

fixSchema();
