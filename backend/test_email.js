require('dotenv').config();
const oracledb = require('oracledb');
const { sendEmail } = require('./utils/emailService');

async function testEmailDelivery() {
    let connection;
    try {
        console.log('1. Checking DB Manager Email...');
        connection = await oracledb.getConnection({
            user: process.env.DB_USER || 'C##HARSHUERSR',
            password: process.env.DB_PASSWORD || 'password123',
            connectionString: process.env.DB_CONNECTION_STRING || 'localhost:1521/XEPDB1'
        });

        const res = await connection.execute(`SELECT employee_id, email, full_name, role FROM EMPLOYEES WHERE role = 'BRANCH_MANAGER'`);
        const employees = res.rows;
        console.log('Managers found in DB:');
        employees.forEach(e => console.log(`- ${e[0]}: ${e[1]} (${e[2]})`));

        console.log('\n2. Testing Email Delivery to harsh2712006@gmail.com...');
        await sendEmail('harsh2712006@gmail.com', 'Suraksha Bank - OTP Test', '<p>This is a test OTP: <b>123456</b></p>');
        console.log('✅ Email sent successfully!');
    } catch (err) {
        console.error('❌ Error testing email delivery:', err);
    } finally {
        if (connection) await connection.close();
    }
}

testEmailDelivery();
