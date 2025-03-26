const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');

// Create a review for an appointment
router.post('/', [verifyToken, checkRole(['patient'])], async (req, res) => {
    try {
        const { appointment_id, rating, comment } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!appointment_id || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid input. Rating must be between 1 and 5.'
            });
        }

        // Check if appointment exists and belongs to the patient
        const appointmentResult = await pool.query(
            'SELECT * FROM appointments WHERE id = $1 AND patient_id = $2 AND status = $3',
            [appointment_id, userId, 'approved']
        );

        if (appointmentResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Appointment not found or not approved'
            });
        }

        // Check if review already exists
        const existingReviewResult = await pool.query(
            'SELECT * FROM reviews WHERE appointment_id = $1',
            [appointment_id]
        );

        if (existingReviewResult.rows.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Review already exists for this appointment'
            });
        }

        // Create review
        const reviewResult = await pool.query(
            'INSERT INTO reviews (doctor_id, patient_id, appointment_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [appointmentResult.rows[0].doctor_id, userId, appointment_id, rating, comment || null]
        );

        // Update doctor's average rating
        const statsResult = await pool.query(
            'SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews FROM reviews WHERE doctor_id = $1',
            [appointmentResult.rows[0].doctor_id]
        );

        await pool.query(
            'UPDATE doctors SET average_rating = $1, total_reviews = $2 WHERE id = $3',
            [statsResult.rows[0].avg_rating, statsResult.rows[0].total_reviews, appointmentResult.rows[0].doctor_id]
        );

        res.status(201).json({
            status: 'success',
            message: 'Review created successfully',
            data: reviewResult.rows[0]
        });

    } catch (error) {
        console.error('Error creating review:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error creating review'
        });
    }
});

// Get reviews for a doctor
router.get('/doctor/:doctorId', async (req, res) => {
    try {
        const { doctorId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const reviewsResult = await pool.query(
            `SELECT r.*, u.name as patient_name, a.appointment_date, ts.start_time, ts.end_time
             FROM reviews r
             JOIN users u ON r.patient_id = u.id
             JOIN appointments a ON r.appointment_id = a.id
             JOIN time_slots ts ON a.time_slot_id = ts.id
             WHERE r.doctor_id = $1
             ORDER BY r.created_at DESC
             LIMIT $2 OFFSET $3`,
            [doctorId, limit, offset]
        );

        const totalResult = await pool.query(
            'SELECT COUNT(*) as count FROM reviews WHERE doctor_id = $1',
            [doctorId]
        );

        res.json({
            status: 'success',
            data: reviewsResult.rows,
            pagination: {
                total: parseInt(totalResult.rows[0].count),
                page,
                totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / limit),
                limit
            }
        });

    } catch (error) {
        console.error('Error fetching doctor reviews:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching reviews'
        });
    }
});

// Get reviews by a patient
router.get('/patient', [verifyToken, checkRole(['patient'])], async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const reviewsResult = await pool.query(
            `SELECT r.*, d.name as doctor_name, a.appointment_date, ts.start_time, ts.end_time
             FROM reviews r
             JOIN doctors d ON r.doctor_id = d.id
             JOIN appointments a ON r.appointment_id = a.id
             JOIN time_slots ts ON a.time_slot_id = ts.id
             WHERE r.patient_id = $1
             ORDER BY r.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        const totalResult = await pool.query(
            'SELECT COUNT(*) as count FROM reviews WHERE patient_id = $1',
            [userId]
        );

        res.json({
            status: 'success',
            data: reviewsResult.rows,
            pagination: {
                total: parseInt(totalResult.rows[0].count),
                page,
                totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / limit),
                limit
            }
        });

    } catch (error) {
        console.error('Error fetching patient reviews:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching reviews'
        });
    }
});

// Check if user has reviewed an appointment
router.get('/check/:appointmentId', [verifyToken, checkRole(['patient'])], async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const userId = req.user.id;

        console.log('Checking review for appointment:', appointmentId, 'user:', userId);

        // First check if review exists
        const reviewResult = await pool.query(
            `SELECT r.*, u.name as patient_name 
             FROM reviews r 
             JOIN users u ON r.patient_id = u.id 
             WHERE r.appointment_id = $1 AND r.patient_id = $2`,
            [appointmentId, userId]
        );

        console.log('Review check result:', reviewResult.rows);

        if (reviewResult.rows.length > 0) {
            return res.json({
                status: 'success',
                hasReviewed: true,
                review: reviewResult.rows[0]
            });
        }

        // If no review exists, check if appointment exists and is approved
        const appointmentResult = await pool.query(
            `SELECT a.*, u.name as doctor_name, ts.start_time, ts.end_time 
             FROM appointments a 
             JOIN doctors d ON a.doctor_id = d.id 
             JOIN users u ON d.user_id = u.id
             JOIN time_slots ts ON a.time_slot_id = ts.id 
             WHERE a.id = $1 AND a.patient_id = $2 AND a.status = 'approved'`,
            [appointmentId, userId]
        );

        console.log('Appointment check result:', appointmentResult.rows);

        if (appointmentResult.rows.length === 0) {
            // Let's check if the appointment exists at all
            const appointmentExistsResult = await pool.query(
                'SELECT * FROM appointments WHERE id = $1',
                [appointmentId]
            );

            console.log('Appointment exists check:', appointmentExistsResult.rows);

            if (appointmentExistsResult.rows.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Appointment not found'
                });
            }

            // If appointment exists but doesn't match criteria, check why
            const appointmentDetails = appointmentExistsResult.rows[0];
            if (appointmentDetails.patient_id !== userId) {
                return res.status(403).json({
                    status: 'error',
                    message: 'This appointment belongs to another patient'
                });
            }

            if (appointmentDetails.status !== 'approved') {
                return res.status(400).json({
                    status: 'error',
                    message: `Appointment is not approved. Current status: ${appointmentDetails.status}`
                });
            }

            return res.status(404).json({
                status: 'error',
                message: 'Appointment not found or not approved'
            });
        }

        res.json({
            status: 'success',
            hasReviewed: false,
            appointment: appointmentResult.rows[0]
        });

    } catch (error) {
        console.error('Error checking review:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error checking review status',
            details: error.message
        });
    }
});

module.exports = router; 