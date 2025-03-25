const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({
                status: 'error',
                message: 'No authorization header provided'
            });
        }

        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                status: 'error',
                message: 'No token provided'
            });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;

            // Check if user exists
            const result = await pool.query(
                'SELECT * FROM users WHERE id = $1',
                [decoded.id]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    status: 'error',
                    message: 'User not found'
                });
            }

            next();
        } catch (jwtError) {
            console.error('JWT verification error:', jwtError);
            return res.status(401).json({
                status: 'error',
                message: 'Invalid token',
                details: jwtError.message
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Error verifying token',
            details: error.message
        });
    }
};

const isAdmin = async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT role FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows[0].role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied. Admin role required.'
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: 'Error checking admin role',
            details: error.message
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
    const { email } = req.body;
    
    // Allow all email domains for now
    next();
    
    // If you want to restrict to specific domains later, uncomment and modify this:
    /*
    const allowedDomains = ['gmail.com', 'yahoo.com', 'example.com'];
    const domain = email.split('@')[1];
    
    if (!allowedDomains.includes(domain)) {
        return res.status(400).json({
            status: 'error',
            message: 'Registration is only allowed for specific email domains'
        });
    }
    
    next();
    */
};

module.exports = {
    verifyToken,
    isAdmin,
    checkRole,
    validateEmailDomain
}; 