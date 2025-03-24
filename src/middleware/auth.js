const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(403).json({
            status: 'error',
            message: 'No token provided'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            status: 'error',
            message: 'Invalid token'
        });
    }
};

const checkRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied'
            });
        }
        next();
    };
};

const validateEmailDomain = (req, res, next) => {
    const email = req.body.email;
    const allowedDomains = process.env.ALLOWED_DOMAINS.split(',');
    const domain = email.split('@')[1];

    if (!allowedDomains.includes(domain)) {
        return res.status(400).json({
            status: 'error',
            message: 'Registration is only allowed for specific email domains'
        });
    }

    next();
};

module.exports = {
    verifyToken,
    checkRole,
    validateEmailDomain
}; 