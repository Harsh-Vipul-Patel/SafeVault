const jwt = require('jsonwebtoken');
const oracledb = require('oracledb');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_here_change_in_production';

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) {
        return res.status(401).json({ message: 'Invalid token format' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, role, username, session_token }

        if (!decoded.username || !decoded.session_token) {
            return res.status(401).json({ message: 'Invalid token payload' });
        }

        // Verify session_token in database
        let connection;
        try {
            connection = await oracledb.getConnection();
            const result = await connection.execute(
                `SELECT session_token FROM USERS WHERE LOWER(username) = LOWER(:uname)`,
                { uname: decoded.username },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'User deleted or not found' });
            }

            const activeSessionToken = result.rows[0].SESSION_TOKEN;
            if (activeSessionToken !== decoded.session_token) {
                // Session was invalidated by another login
                return res.status(401).json({ message: 'Session expired. Logged in from another device.' });
            }
        } catch (dbErr) {
            console.error('Session Token DB Error:', dbErr);
            return res.status(500).json({ message: 'Internal server error validating session' });
        } finally {
            if (connection) await connection.close();
        }

        next();
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized / Token Expired' });
    }
};

// Middleware for Role-Based Access Control (RBAC)
const requireRole = (allowedRoles) => {
    return async (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ message: 'Unauthorized: No role specified' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: `Forbidden: Requires one of [${allowedRoles.join(', ')}]` });
        }

        const isCustomerWriteRequest =
            req.user.role === 'CUSTOMER' &&
            ['POST', 'PUT', 'PATCH', 'DELETE'].includes((req.method || '').toUpperCase());

        if (isCustomerWriteRequest) {
            let connection;
            try {
                connection = await oracledb.getConnection();
                const result = await connection.execute(
                    `SELECT kyc_status FROM CUSTOMERS WHERE customer_id = :cid`,
                    { cid: req.user.id },
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({ message: 'Customer profile not found for KYC validation.' });
                }

                const kycStatus = (result.rows[0].KYC_STATUS || 'PENDING').toUpperCase();
                if (kycStatus !== 'VERIFIED') {
                    return res.status(403).json({
                        message: 'KYC verification is required for create/update/delete operations. Read-only access is allowed until KYC is VERIFIED.',
                        kycStatus,
                        allowedOperations: 'READ_ONLY'
                    });
                }
            } catch (err) {
                console.error('KYC role-check error:', err);
                return res.status(500).json({ message: 'Could not validate KYC status for access control.' });
            } finally {
                if (connection) await connection.close();
            }
        }

        next();
    };
};

module.exports = {
    verifyToken,
    requireRole,
    JWT_SECRET
};
