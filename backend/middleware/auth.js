const jwt = require('jsonwebtoken');
const { query } = require('../db');

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
        try {
            const result = await query(
                `SELECT session_token FROM USERS WHERE LOWER(username) = LOWER($1)`,
                [decoded.username]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'User deleted or not found' });
            }

            const activeSessionToken = result.rows[0].session_token;
            if (activeSessionToken !== decoded.session_token) {
                // Session was invalidated by another login
                return res.status(401).json({ message: 'Session expired. Logged in from another device.' });
            }
        } catch (dbErr) {
            console.error('Session Token DB Error:', dbErr);
            return res.status(500).json({ message: 'Internal server error validating session' });
        }

        next();
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized / Token Expired' });
    }
};

// Middleware for Role-Based Access Control (RBAC)
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ message: 'Unauthorized: No role specified' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: `Forbidden: Requires one of [${allowedRoles.join(', ')}]` });
        }

        next();
    };
};

module.exports = {
    verifyToken,
    requireRole,
    JWT_SECRET
};
