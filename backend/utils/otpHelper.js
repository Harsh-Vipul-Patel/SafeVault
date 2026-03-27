const oracledb = require('oracledb');
const bcrypt = require('bcryptjs');

/**
 * Shared utility to verify OTP
 * @param {oracledb.Connection} connection - Active database connection
 * @param {String} userId - The customer_id (e.g., 'CUST-001')
 * @param {String} otpCode - The 6-digit OTP code provided by the user
 * @param {String} purpose - The purpose of the OTP (e.g., 'TRANSACTION', 'PROFILE_UPDATE')
 * @returns {Promise<Object>} - Validation result: { valid: Boolean, reason: String, attemptsLeft: Number, email: String }
 */
const verifyOtp = async (connection, userId, otpCode, purpose) => {
    // Get the user's email first for notifications
    const userCheck = await connection.execute(
        `SELECT u.user_id, c.email FROM USERS u JOIN CUSTOMERS c ON u.user_id = c.user_id WHERE c.customer_id = :cust_id`,
        { cust_id: userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // In our routes, we already verified the user exists, but we'll fetch the latest OTP directly
    const result = await connection.execute(
        `SELECT o.otp_id, o.otp_hash, o.expires_at, o.attempts, o.status, c.email 
         FROM OTPS o
         JOIN CUSTOMERS c ON o.user_id = c.user_id
         WHERE c.customer_id = :cust_id 
         AND o.purpose = :purpose 
         ORDER BY o.created_at DESC FETCH FIRST 1 ROWS ONLY`,
        { cust_id: userId, purpose: purpose },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) return { valid: false, reason: 'No OTP found.', email: null };

    const otpData = result.rows[0];
    const userEmail = otpData.EMAIL;

    if (otpData.STATUS !== 'PENDING') {
        return { valid: false, reason: 'OTP has already been processed or expired.', email: userEmail };
    }

    if (new Date() > new Date(otpData.EXPIRES_AT)) {
        await connection.execute(`UPDATE OTPS SET status = 'FAILED' WHERE otp_id = :1`, [otpData.OTP_ID], { autoCommit: true });
        return { valid: false, reason: 'OTP Expired', email: userEmail };
    }

    if (otpData.ATTEMPTS >= 3) {
        await connection.execute(`UPDATE OTPS SET status = 'FAILED' WHERE otp_id = :1`, [otpData.OTP_ID], { autoCommit: true });
        return { valid: false, reason: 'Maximum OTP attempts reached.', email: userEmail };
    }

    const isMatch = await bcrypt.compare(otpCode, otpData.OTP_HASH);

    if (!isMatch) {
        const newAttempts = otpData.ATTEMPTS + 1;
        let newStatus = 'PENDING';
        if (newAttempts >= 3) newStatus = 'FAILED';

        await connection.execute(
            `UPDATE OTPS SET attempts = :attempts, status = :st WHERE otp_id = :otp_id`,
            { attempts: newAttempts, st: newStatus, otp_id: otpData.OTP_ID },
            { autoCommit: true }
        );
        return { valid: false, reason: 'Incorrect OTP', attemptsLeft: 3 - newAttempts, email: userEmail };
    }

    // Match success
    await connection.execute(
        `UPDATE OTPS SET status = 'SUCCESS' WHERE otp_id = :otp_id`,
        { otp_id: otpData.OTP_ID },
        { autoCommit: true }
    );
    return { valid: true, email: userEmail };
};

const verifyManagerOtp = async (connection, userUuid, otpCode, purpose) => {
    const result = await connection.execute(
        `SELECT o.otp_id, o.otp_hash, o.expires_at, o.attempts, o.status, e.email 
         FROM OTPS o
         JOIN EMPLOYEES e ON o.user_id = e.user_id
         WHERE e.employee_id = :param_uid 
         AND o.purpose = :param_purpose 
         ORDER BY o.created_at DESC FETCH FIRST 1 ROWS ONLY`,
        { param_uid: userUuid, param_purpose: purpose },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) return { valid: false, reason: 'No OTP found.', email: null };

    const otpData = result.rows[0];
    const userEmail = otpData.EMAIL;

    if (otpData.STATUS !== 'PENDING') {
        return { valid: false, reason: 'OTP has already been processed or expired.', email: userEmail };
    }

    if (new Date() > new Date(otpData.EXPIRES_AT)) {
        await connection.execute(`UPDATE OTPS SET status = 'FAILED' WHERE otp_id = :1`, [otpData.OTP_ID], { autoCommit: true });
        return { valid: false, reason: 'OTP Expired', email: userEmail };
    }

    if (otpData.ATTEMPTS >= 3) {
        await connection.execute(`UPDATE OTPS SET status = 'FAILED' WHERE otp_id = :1`, [otpData.OTP_ID], { autoCommit: true });
        return { valid: false, reason: 'Maximum OTP attempts reached.', email: userEmail };
    }

    const isMatch = await bcrypt.compare(otpCode, otpData.OTP_HASH);

    if (!isMatch) {
        const newAttempts = otpData.ATTEMPTS + 1;
        let newStatus = 'PENDING';
        if (newAttempts >= 3) newStatus = 'FAILED';

        await connection.execute(
            `UPDATE OTPS SET attempts = :attempts, status = :st WHERE otp_id = :otp_id`,
            { attempts: newAttempts, st: newStatus, otp_id: otpData.OTP_ID },
            { autoCommit: true }
        );
        return { valid: false, reason: 'Incorrect OTP', attemptsLeft: 3 - newAttempts, email: userEmail };
    }

    // Match success
    await connection.execute(
        `UPDATE OTPS SET status = 'SUCCESS' WHERE otp_id = :otp_id`,
        { otp_id: otpData.OTP_ID },
        { autoCommit: true }
    );
    return { valid: true, email: userEmail };
};

module.exports = {
    verifyOtp,
    verifyManagerOtp
};
