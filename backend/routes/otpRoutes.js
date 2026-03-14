const express = require('express');
const router = express.Router();
const { query } = require('../db');
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

    try {
        const { targetCustomerId, targetAccountId } = req.body;

        let sql, binds;

        if (req.user.role === 'TELLER' || req.user.role === 'BRANCH_MANAGER') {
            // Teller/Manager can generate OTP for a customer
            if (targetCustomerId) {
                sql = `SELECT u.user_id, c.email, c.full_name FROM USERS u 
                       JOIN CUSTOMERS c ON c.user_id = u.user_id 
                       WHERE c.customer_id = $1`;
                binds = [targetCustomerId];
            } else if (targetAccountId) {
                sql = `SELECT u.user_id, c.email, c.full_name FROM USERS u 
                       JOIN CUSTOMERS c ON c.user_id = u.user_id 
                       JOIN ACCOUNTS a ON a.customer_id = c.customer_id
                       WHERE a.account_id = $1`;
                binds = [targetAccountId];
            } else {
                return res.status(400).json({ message: 'targetCustomerId or targetAccountId required for Teller-initiated OTP.' });
            }
        } else {
            // Customer generating for themselves
            sql = `SELECT u.user_id, c.email, c.full_name FROM USERS u 
                   JOIN CUSTOMERS c ON c.user_id = u.user_id 
                   WHERE c.customer_id = $1`;
            binds = [req.user.id];
        }

        const userCheck = await query(sql, binds);

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Target Customer profile not found.' });
        }

        const row = userCheck.rows[0];
        const realUserId = row.user_id;
        const email = row.email;
        const fullName = row.full_name || 'Customer';

        if (!email) {
            return res.status(400).json({ message: 'No email address associated with the target profile.' });
        }

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);

        // Expire in 1 minute
        await query(
            `INSERT INTO OTPS (user_id, transaction_id, otp_hash, purpose, expires_at, status)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '1 minute', 'PENDING')`,
            [realUserId, transactionId || null, otpHash, purpose]
        );

        // Send HTML Email using Template
        const emailHtml = templates.otp(fullName, otpCode);
        try {
            await sendEmail(email, 'Suraksha Bank - Security OTP', emailHtml, [], true);
        } catch (emailErr) {
            console.error('\n=============================================');
            console.error(`📧 EMAIL FAILED TO SEND. Your OTP is: ${otpCode}`);
            console.error('=============================================\n');
        }
        res.json({ message: 'OTP sent successfully to your registered email.' });
    } catch (err) {
        console.error('OTP Generation Error:', err);
        res.status(500).json({ message: 'Failed to generate OTP.' });
    }
});

module.exports = router;
