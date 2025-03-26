const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../config/database');

// Middleware to check if user is admin
router.use(verifyToken, isAdmin);

// Get all pending appointment requests
router.get('/appointments/pending', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        a.*,
        p.name as patient_name,
        p.email as patient_email,
        d.specialty,
        u.name as doctor_name,
        u.email as doctor_email,
        ts.start_time,
        ts.end_time
      FROM appointments a
      JOIN users p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u ON d.user_id = u.id
      JOIN time_slots ts ON a.time_slot_id = ts.id
      WHERE a.request_status = 'pending'
      ORDER BY a.appointment_date ASC, ts.start_time ASC
      LIMIT $1 OFFSET $2
    `;

    const countQuery = `
      SELECT COUNT(*) 
      FROM appointments 
      WHERE request_status = 'pending'
    `;

    const [appointments, totalCount] = await Promise.all([
      pool.query(query, [limit, offset]),
      pool.query(countQuery)
    ]);

    const total = parseInt(totalCount.rows[0].count);
    const pages = Math.ceil(total / limit);

    res.json({
      status: 'success',
      data: appointments.rows,
      pagination: {
        total,
        page: parseInt(page),
        pages,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get pending appointments error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching pending appointments',
      details: error.message
    });
  }
});

// Update appointment request status (approve/reject)
router.patch('/appointments/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid status. Must be either "approved" or "rejected"'
      });
    }

    const result = await pool.query(
      'UPDATE appointments SET request_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Appointment not found'
      });
    }

    // If approved, reject other pending appointments for the same time slot
    if (status === 'approved') {
      await pool.query(
        `UPDATE appointments 
         SET request_status = 'rejected', updated_at = NOW() 
         WHERE time_slot_id = $1 
         AND doctor_id = $2 
         AND appointment_date = $3 
         AND id != $4 
         AND request_status = 'pending'`,
        [
          result.rows[0].time_slot_id,
          result.rows[0].doctor_id,
          result.rows[0].appointment_date,
          id
        ]
      );
    }

    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update appointment status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating appointment status',
      details: error.message
    });
  }
});

// Get all doctors (including inactive)
router.get('/doctors', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        d.*,
        u.name,
        u.email,
        u.is_active,
        COALESCE(AVG(r.rating), 0)::TEXT as average_rating,
        COUNT(r.id) as total_reviews
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN reviews r ON d.id = r.doctor_id
      GROUP BY d.id, u.id
      ORDER BY u.is_active DESC, d.experience DESC
      LIMIT $1 OFFSET $2
    `;

    const countQuery = 'SELECT COUNT(*) FROM doctors';

    const [doctors, totalCount] = await Promise.all([
      pool.query(query, [limit, offset]),
      pool.query(countQuery)
    ]);

    const total = parseInt(totalCount.rows[0].count);
    const pages = Math.ceil(total / limit);

    res.json({
      status: 'success',
      data: doctors.rows,
      pagination: {
        total,
        page: parseInt(page),
        pages,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all doctors error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching doctors',
      details: error.message
    });
  }
});

// Update doctor status (activate/deactivate)
router.patch('/doctors/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'is_active must be a boolean value'
      });
    }

    const result = await pool.query(
      `UPDATE users u
       SET is_active = $1, updated_at = NOW()
       FROM doctors d
       WHERE d.user_id = u.id AND d.id = $2
       RETURNING u.*, d.*`,
      [is_active, id]
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
    console.error('Update doctor status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating doctor status',
      details: error.message
    });
  }
});

// Get appointment statistics
router.get('/statistics/appointments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE request_status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE request_status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE request_status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE appointment_date >= CURRENT_DATE) as upcoming_count,
        COUNT(*) FILTER (WHERE appointment_date < CURRENT_DATE) as past_count
      FROM appointments
    `);

    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get appointment statistics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching appointment statistics',
      details: error.message
    });
  }
});

module.exports = router; 