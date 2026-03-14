const bcrypt = require('bcryptjs');
const { query } = require('../db');

/**
 * Shared utility to verify OTP
 * @param {Object} connection - (Unused in PG refactor, using central query)
 * @param {String} userId - The customer_id (e.g., 'CUST-001')
 * @param {String} otpCode - The 6-digit OTP code provided by the user
 * @param {String} purpose - The purpose of the OTP (e.g., 'TRANSACTION', 'PROFILE_UPDATE')
 * @returns {Promise<Object>} - Validation result: { valid: Boolean, reason: String, attemptsLeft: Number, email: String }
 */
const verifyOtp = async (userId, otpCode, purpose) => {
    // userId is expected to be either customer_id (e.g. CUST-01) or user_id (UUID)
    // We check both to be safe during migration
    const result = await query(
        `SELECT o.otp_id, o.otp_hash, o.expires_at, o.attempts, o.status, c.email 
         FROM OTPS o
         JOIN CUSTOMERS c ON o.user_id = c.user_id
         WHERE (c.customer_id = $1 OR c.user_id::text = $1)
         AND o.purpose = $2 
         ORDER BY o.expires_at DESC LIMIT 1`,
        [userId, purpose]
    );

    if (result.rows.length === 0) return { valid: false, reason: 'No OTP found.', email: null };

    const otpData = result.rows[0];
    const userEmail = otpData.email;

    if (otpData.status !== 'PENDING') {
        return { valid: false, reason: 'OTP has already been processed or expired.', email: userEmail };
    }

    if (new Date() > new Date(otpData.expires_at)) {
        await query(`UPDATE OTPS SET status = 'FAILED' WHERE otp_id = $1`, [otpData.otp_id]);
        return { valid: false, reason: 'OTP Expired', email: userEmail };
    }

    if (otpData.attempts >= 3) {
        await query(`UPDATE OTPS SET status = 'FAILED' WHERE otp_id = $1`, [otpData.otp_id]);
        return { valid: false, reason: 'Maximum OTP attempts reached.', email: userEmail };
    }

    const isMatch = await bcrypt.compare(otpCode, otpData.otp_hash);

    if (!isMatch) {
        const newAttempts = Number(otpData.attempts || 0) + 1;
        let newStatus = 'PENDING';
        if (newAttempts >= 3) newStatus = 'FAILED';

        await query(
            `UPDATE OTPS SET attempts = $1, status = $2 WHERE otp_id = $3`,
            [newAttempts, newStatus, otpData.otp_id]
        );
        return { valid: false, reason: 'Incorrect OTP', attemptsLeft: 3 - newAttempts, email: userEmail };
    }

    // Match success
    await query(
        `UPDATE OTPS SET status = 'SUCCESS' WHERE otp_id = $1`,
        [otpData.otp_id]
    );
    return { valid: true, email: userEmail };
};

module.exports = {
    verifyOtp
};
