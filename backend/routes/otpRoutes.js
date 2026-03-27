const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');
const { verifyToken } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');
const templates = require('../utils/emailTemplates');

// Generate and send an OTP
router.post('/generate', verifyToken, async (req, res) => {
    const { purpose, transactionId, amount, toAccountId } = req.body;

    if (!purpose) {
        return res.status(400).json({ message: 'Purpose is required (e.g., TRANSACTION, PROFILE_UPDATE).' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection();
        const { targetCustomerId, targetAccountId } = req.body;

        let query, binds;

        if (req.body.forManager) {
            // Manager is generating an OTP for themselves to authorize a high-risk action
            query = `SELECT u.user_id, e.email, e.full_name FROM USERS u 
                     JOIN EMPLOYEES e ON u.user_id = e.user_id 
                     WHERE e.employee_id = :req_id`;
            binds = { req_id: req.user.id };
        } else if (req.user.role === 'TELLER' || req.user.role === 'BRANCH_MANAGER') {
            // Teller/Manager can generate OTP for a customer
            if (targetCustomerId) {
                query = `SELECT u.user_id, c.email, c.full_name FROM USERS u 
                         JOIN CUSTOMERS c ON c.user_id = u.user_id 
                         WHERE c.customer_id = :id`;
                binds = { id: targetCustomerId };
            } else if (targetAccountId) {
                query = `SELECT u.user_id, c.email, c.full_name FROM USERS u 
                         JOIN CUSTOMERS c ON c.user_id = u.user_id 
                         JOIN ACCOUNTS a ON a.customer_id = c.customer_id
                         WHERE a.account_id = :id`;
                binds = { id: targetAccountId };
            } else {
                return res.status(400).json({ message: 'targetCustomerId or targetAccountId required for Teller-initiated OTP.' });
            }
        } else {
            // Customer generating for themselves
            query = `SELECT u.user_id, c.email, c.full_name FROM USERS u 
                     JOIN CUSTOMERS c ON c.user_id = u.user_id 
                     WHERE c.customer_id = :req_id`;
            binds = { req_id: req.user.id };
        }

        const userCheck = await connection.execute(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: req.body.forManager ? 'Manager profile not found.' : 'Target Customer profile not found.' });
        }

        const row = userCheck.rows[0];
        const realUserId = row.USER_ID;
        const email = row.EMAIL;
        const fullName = row.FULL_NAME || 'User';

        if (!email) {
            return res.status(400).json({ message: 'No email address associated with the target profile.' });
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

        // Send HTML Email using Template
        const emailHtml = templates.otp(fullName, otpCode);
        await sendEmail(email, 'Suraksha Bank - Security OTP', emailHtml, [], true);

        res.json({ message: 'OTP sent successfully to your registered email.' });
    } catch (err) {
        console.error('OTP Generation Error:', err);
        res.status(500).json({ message: 'Failed to generate OTP.' });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;
