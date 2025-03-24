const pool = require('../config/database');
const path = require('path');
const fs = require('fs').promises;

const createDoctor = async (req, res) => {
    try {
        const {
            specialty,
            experience,
            location,
            consultation_fee,
            bio,
            education,
            languages,
            gender
        } = req.body;

        let photo_path = null;
        if (req.file) {
            photo_path = `/uploads/doctors/${req.file.filename}`;
        }

        const result = await pool.query(
            `INSERT INTO doctors (
                user_id, specialty, experience, location, consultation_fee,
                bio, education, languages, photo_path, gender
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                req.user.id, specialty, experience, location, consultation_fee,
                bio, education, languages, photo_path, gender
            ]
        );

        res.status(201).json({
            status: 'success',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Create doctor error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error creating doctor profile'
        });
    }
};

const getAllDoctors = async (req, res) => {
    try {
        const { page = 1, limit = 6, specialty, location } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT d.*, u.name, u.email,
                   COALESCE(AVG(r.rating), 0) as average_rating,
                   COUNT(r.id) as total_reviews
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN reviews r ON d.id = r.doctor_id
            WHERE 1=1
        `;
        const queryParams = [];
        let paramCount = 1;

        if (specialty) {
            query += ` AND d.specialty = $${paramCount}`;
            queryParams.push(specialty);
            paramCount++;
        }

        if (location) {
            query += ` AND d.location = $${paramCount}`;
            queryParams.push(location);
            paramCount++;
        }

        query += ` GROUP BY d.id, u.id ORDER BY average_rating DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        queryParams.push(parseInt(limit), offset);

        const result = await pool.query(query, queryParams);

        const countQuery = `
            SELECT COUNT(*) FROM doctors d WHERE 1=1
            ${specialty ? ` AND d.specialty = $1` : ''}
            ${location ? ` AND d.location = $${specialty ? 2 : 1}` : ''}
        `;
        const countParams = [];
        if (specialty) countParams.push(specialty);
        if (location) countParams.push(location);
        const countResult = await pool.query(countQuery, countParams);

        res.json({
            status: 'success',
            data: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get all doctors error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching doctors'
        });
    }
};

const getTopRatedDoctors = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT d.*, u.name, u.email,
                    COALESCE(AVG(r.rating), 0) as average_rating,
                    COUNT(r.id) as total_reviews
             FROM doctors d
             JOIN users u ON d.user_id = u.id
             LEFT JOIN reviews r ON d.id = r.doctor_id
             GROUP BY d.id, u.id
             ORDER BY average_rating DESC
             LIMIT 5`
        );

        res.json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Get top rated doctors error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching top rated doctors'
        });
    }
};

const getDoctorById = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT d.*, u.name, u.email,
                    COALESCE(AVG(r.rating), 0) as average_rating,
                    COUNT(r.id) as total_reviews
             FROM doctors d
             JOIN users u ON d.user_id = u.id
             LEFT JOIN reviews r ON d.id = r.doctor_id
             WHERE d.id = $1
             GROUP BY d.id, u.id`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Doctor not found'
            });
        }

        res.json({
            status: 'success',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Get doctor by ID error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching doctor'
        });
    }
};

const updateDoctor = async (req, res) => {
    try {
        const {
            specialty,
            experience,
            location,
            consultation_fee,
            bio,
            education,
            languages,
            gender
        } = req.body;

        const doctorCheck = await pool.query(
            'SELECT * FROM doctors WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        if (doctorCheck.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Doctor not found or unauthorized'
            });
        }

        let photo_path = doctorCheck.rows[0].photo_path;
        if (req.file) {
            if (photo_path) {
                const oldPhotoPath = path.join(__dirname, '../../', photo_path);
                try {
                    await fs.unlink(oldPhotoPath);
                } catch (error) {
                    console.error('Error deleting old photo:', error);
                }
            }

            photo_path = `/uploads/doctors/${req.file.filename}`;
        }

        const result = await pool.query(
            `UPDATE doctors 
             SET specialty = $1, experience = $2, location = $3,
                 consultation_fee = $4, bio = $5, education = $6,
                 languages = $7, photo_path = $8, gender = $9, updated_at = NOW()
             WHERE id = $10 AND user_id = $11
             RETURNING *`,
            [
                specialty, experience, location, consultation_fee,
                bio, education, languages, photo_path, gender,
                req.params.id, req.user.id
            ]
        );

        res.json({
            status: 'success',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Update doctor error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error updating doctor profile'
        });
    }
};

const deleteDoctor = async (req, res) => {
    try {
        const doctorCheck = await pool.query(
            'SELECT * FROM doctors WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        if (doctorCheck.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Doctor not found or unauthorized'
            });
        }

        if (doctorCheck.rows[0].photo_path) {
            const photoPath = path.join(__dirname, '../../', doctorCheck.rows[0].photo_path);
            try {
                await fs.unlink(photoPath);
            } catch (error) {
                console.error('Error deleting doctor photo:', error);
            }
        }

        await pool.query(
            'DELETE FROM doctors WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );

        res.json({
            status: 'success',
            message: 'Doctor profile deleted successfully'
        });
    } catch (error) {
        console.error('Delete doctor error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error deleting doctor profile'
        });
    }
};

module.exports = {
    createDoctor,
    getAllDoctors,
    getTopRatedDoctors,
    getDoctorById,
    updateDoctor,
    deleteDoctor
}; 