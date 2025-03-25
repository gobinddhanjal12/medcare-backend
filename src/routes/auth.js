const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const {
    signup,
    login,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    getProfile,
    changePassword
} = require('../controllers/authController');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { validateEmailDomain } = require('../middleware/auth');

const validateSignup = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().notEmpty(),
    body('role').isIn(['patient', 'doctor', 'admin'])
];

const validateLogin = [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
];

const validatePasswordReset = [
    body('email').isEmail().normalizeEmail()
];

const validateNewPassword = [
    body('password').isLength({ min: 6 }),
    body('confirm_password').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match');
        }
        return true;
    })
];

// Admin signup (protected by admin secret key)
router.post('/admin/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        const adminSecretKey = req.headers['x-admin-secret'];

        // Verify admin secret key
        if (adminSecretKey !== process.env.ADMIN_SECRET_KEY) {
            return res.status(403).json({
                status: 'error',
                message: 'Invalid admin secret key'
            });
        }

        // Check if email already exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Email already registered'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create admin user
        const result = await pool.query(
            `INSERT INTO users (email, password, name, role)
             VALUES ($1, $2, $3, 'admin')
             RETURNING id, email, name, role`,
            [email, hashedPassword, name]
        );

        // Generate JWT token
        const token = jwt.sign(
            { id: result.rows[0].id, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            status: 'success',
            data: {
                token,
                user: result.rows[0]
            }
        });
    } catch (error) {
        console.error('Admin signup error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error creating admin account',
            details: error.message
        });
    }
});

// Check user status
router.get('/check-status/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const result = await pool.query(
            'SELECT id, email, name, role FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.json({
                status: 'success',
                data: {
                    exists: false,
                    message: 'Email is available for registration'
                }
            });
        }

        res.json({
            status: 'success',
            data: {
                exists: true,
                user: result.rows[0],
                message: 'Account exists'
            }
        });
    } catch (error) {
        console.error('Check user status error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error checking user status',
            details: error.message
        });
    }
});

// Regular user signup
router.post('/signup', validateEmailDomain, async (req, res) => {
    try {
        const { email, password, name, role = 'patient' } = req.body;

        // Check if email already exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Email already registered. Please login instead.'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const result = await pool.query(
            `INSERT INTO users (email, password, name, role)
             VALUES ($1, $2, $3, $4)
             RETURNING id, email, name, role`,
            [email, hashedPassword, name, role]
        );

        // Generate JWT token
        const token = jwt.sign(
            { id: result.rows[0].id, role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            status: 'success',
            data: {
                token,
                user: result.rows[0]
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error creating account',
            details: error.message
        });
    }
});

// Admin login
router.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND role = $2',
            [email, 'admin']
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials or not an admin account'
            });
        }

        const user = result.rows[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            status: 'success',
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                }
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error logging in as admin',
            details: error.message
        });
    }
});

// Regular user login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND role != $2',
            [email, 'admin']
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

        const user = result.rows[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            status: 'success',
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                }
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error logging in',
            details: error.message
        });
    }
});

router.get('/verify-email', verifyEmail);
router.post('/resend-verification', [body('email').isEmail().normalizeEmail()], resendVerification);
router.post('/forgot-password', validatePasswordReset, forgotPassword);
router.post('/reset-password', validateNewPassword, resetPassword);
router.get('/profile', verifyToken, getProfile);
router.post('/change-password', [verifyToken, validateNewPassword], changePassword);

module.exports = router; 