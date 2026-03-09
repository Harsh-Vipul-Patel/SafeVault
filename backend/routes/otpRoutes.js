const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
const { verifyToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');

// Generate and send an OTP
router.post('/generate', verifyToken, async (req, res) => {
    const { purpose, transactionId, amount, toAccountId } = req.body;

    if (!purpose) {
        return res.status(400).json({ message: 'Purpose is required (e.g., TRANSACTION, PROFILE_UPDATE).' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();

        // Fetch user email by joining against CUSTOMERS with customer_id (req.user.id usually holds string like 'CUST-XXX' for customers)
        const userCheck = await connection.execute(
            `SELECT u.user_id, u.username, c.email FROM USERS u
             JOIN CUSTOMERS c ON c.user_id = u.user_id
             WHERE c.customer_id = :req_id`,
            { req_id: req.user.id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: 'User/Customer profile not found.' });
        }

        const realUserId = userCheck.rows[0].USER_ID;
        const email = userCheck.rows[0].EMAIL;
        if (!email) {
            return res.status(400).json({ message: 'No email address associated with your profile.' });
        }

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);

        // Expire in 1 minute
        await connection.execute(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES (:user_id, :tx_id, :otp_hash, :purpose, CURRENT_TIMESTAMP + INTERVAL '1' MINUTE, 'PENDING')`,
            {
                user_id: realUserId,
                tx_id: transactionId || null,
                otp_hash: otpHash,
                purpose: purpose
            },
            { autoCommit: true }
        );

        // Send Email
        let details = '';
        if (amount && toAccountId) {
            details = `You are initiating a transfer of $${amount} to account ${toAccountId}.\n`;
        }

        const emailBody = `
Hello,

${details}Your Secure One Time Password (OTP) for ${purpose} is:
${otpCode}

WARNING: This code will strictly expire in 1 minute and is limited to 3 attempts.
Do not share this code with anyone.

Regards,
Suraksha Bank Support
`;
        await sendEmail(email, 'Suraksha Bank - Action Required (OTP)', emailBody);

        res.json({ message: 'OTP sent successfully to your registered email.' });
    } catch (err) {
        console.error('OTP Generation Error:', err);
        res.status(500).json({ message: 'Failed to generate OTP.' });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
