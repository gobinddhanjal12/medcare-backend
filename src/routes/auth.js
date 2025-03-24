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

router.post('/signup', validateSignup, signup);
router.post('/login', validateLogin, login);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', [body('email').isEmail().normalizeEmail()], resendVerification);
router.post('/forgot-password', validatePasswordReset, forgotPassword);
router.post('/reset-password', validateNewPassword, resetPassword);
router.get('/profile', verifyToken, getProfile);
router.post('/change-password', [verifyToken, validateNewPassword], changePassword);

module.exports = router; 