const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendVerificationEmail = async (email, token) => {
    try {
        const verificationUrl = `http://localhost:3000/api/v1/auth/verify-email?token=${token}`;
        
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Verify Your Email - MedCare',
            html: `
                <h1>Welcome to MedCare!</h1>
                <p>Please click the link below to verify your email address:</p>
                <a href="${verificationUrl}">${verificationUrl}</a>
                <p>This link will expire in 24 hours.</p>
                <p>If you did not create an account, please ignore this email.</p>
            `
        });

        console.log('Verification email sent successfully');
    } catch (error) {
        console.error('Send verification email error:', error);
        throw new Error('Error sending verification email');
    }
};

const sendPasswordResetEmail = async (email, token) => {
    try {
        const resetUrl = `http://localhost:3000/reset-password?token=${token}`;
        
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Reset Your Password - MedCare',
            html: `
                <h1>Password Reset Request</h1>
                <p>You requested to reset your password. Click the link below to proceed:</p>
                <a href="${resetUrl}">${resetUrl}</a>
                <p>This link will expire in 1 hour.</p>
                <p>If you did not request a password reset, please ignore this email.</p>
            `
        });

        console.log('Password reset email sent successfully');
    } catch (error) {
        console.error('Send password reset email error:', error);
        throw new Error('Error sending password reset email');
    }
};

const sendAppointmentConfirmation = async (appointment, patientEmail, doctorName, consultationType) => {
    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: patientEmail,
            subject: 'Appointment Confirmation - MedCare',
            html: `
                <h1>Appointment Confirmation</h1>
                <p>Your appointment has been scheduled successfully!</p>
                <h2>Appointment Details:</h2>
                <ul>
                    <li>Doctor: Dr. ${doctorName}</li>
                    <li>Date: ${appointment.appointment_date}</li>
                    <li>Consultation Type: ${consultationType}</li>
                </ul>
                <p>Please arrive 10 minutes before your scheduled time.</p>
            `
        });

        console.log('Appointment confirmation email sent successfully');
    } catch (error) {
        console.error('Send appointment confirmation email error:', error);
        throw new Error('Error sending appointment confirmation email');
    }
};

const sendAppointmentStatusUpdate = async (appointment, patientEmail, patientName, status) => {
    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: patientEmail,
            subject: 'Appointment Status Update - MedCare',
            html: `
                <h1>Appointment Status Update</h1>
                <p>Dear ${patientName},</p>
                <p>Your appointment status has been updated to: <strong>${status}</strong></p>
                <h2>Appointment Details:</h2>
                <ul>
                    <li>Date: ${appointment.appointment_date}</li>
                    <li>Status: ${status}</li>
                </ul>
            `
        });

        console.log('Appointment status update email sent successfully');
    } catch (error) {
        console.error('Send appointment status update email error:', error);
        throw new Error('Error sending appointment status update email');
    }
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendAppointmentConfirmation,
    sendAppointmentStatusUpdate
}; 