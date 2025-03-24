const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

const signup = async (req, res) => {
    try {
        const { email, password, name, role } = req.body;

        const userCheck = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (userCheck.rows.length > 0) {
            return res.status(409).json({
                status: 'error',
                message: 'Email already exists'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const result = await pool.query(
            `INSERT INTO users (
                email, password, name, role,
                email_verified
            ) VALUES ($1, $2, $3, $4, true)
            RETURNING id, email, name, role`,
            [email, hashedPassword, name, role]
        );

        const user = result.rows[0];

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
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
        console.error('Signup error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error creating user'
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

        const user = result.rows[0];

        if (!user.email_verified) {
            return res.status(401).json({
                status: 'error',
                message: 'Please verify your email before logging in'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

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
            message: 'Error logging in'
        });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({
                status: 'error',
                message: 'Verification token is required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await pool.query(
            `UPDATE users 
             SET email_verified = true,
                 verification_token = NULL,
                 verification_token_expires = NULL
             WHERE email = $1
             RETURNING *`,
            [decoded.email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid verification token'
            });
        }

        res.json({
            status: 'success',
            message: 'Email verified successfully'
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({
                status: 'error',
                message: 'Verification token has expired'
            });
        }
        console.error('Email verification error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error verifying email'
        });
    }
};

const resendVerification = async (req, res) => {
    try {
        const { email } = req.body;

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        const user = result.rows[0];

        if (user.email_verified) {
            return res.status(400).json({
                status: 'error',
                message: 'Email is already verified'
            });
        }

        const verificationToken = jwt.sign(
            { email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        await pool.query(
            `UPDATE users 
             SET verification_token = $1,
                 verification_token_expires = NOW() + INTERVAL '24 hours'
             WHERE email = $2`,
            [verificationToken, email]
        );

        await sendVerificationEmail(email, verificationToken);

        res.json({
            status: 'success',
            message: 'Verification email sent successfully'
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error resending verification email'
        });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        const user = result.rows[0];

        const resetToken = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        await pool.query(
            `UPDATE users 
             SET reset_token = $1,
                 reset_token_expires = NOW() + INTERVAL '1 hour'
             WHERE email = $2`,
            [resetToken, email]
        );

        await sendPasswordResetEmail(email, resetToken);

        res.json({
            status: 'success',
            message: 'Password reset email sent successfully'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error sending password reset email'
        });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await pool.query(
            `SELECT * FROM users 
             WHERE id = $1 
             AND reset_token = $2 
             AND reset_token_expires > NOW()`,
            [decoded.id, token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired reset token'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await pool.query(
            `UPDATE users 
             SET password = $1,
                 reset_token = NULL,
                 reset_token_expires = NULL
             WHERE id = $2`,
            [hashedPassword, decoded.id]
        );

        res.json({
            status: 'success',
            message: 'Password reset successfully'
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({
                status: 'error',
                message: 'Reset token has expired'
            });
        }
        console.error('Reset password error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error resetting password'
        });
    }
};

const getProfile = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, name, role FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        res.json({
            status: 'success',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching profile'
        });
    }
};

const changePassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        const result = await pool.query(
            'SELECT password FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        const isMatch = await bcrypt.compare(current_password, result.rows[0].password);
        if (!isMatch) {
            return res.status(400).json({
                status: 'error',
                message: 'Current password is incorrect'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(new_password, salt);

        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, req.user.id]
        );

        res.json({
            status: 'success',
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error changing password'
        });
    }
};

module.exports = {
    signup,
    login,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    getProfile,
    changePassword
}; 