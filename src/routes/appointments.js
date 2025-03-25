const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const { verifyToken, checkRole } = require("../middleware/auth");
const { body, validationResult } = require("express-validator");
const {
  sendAppointmentConfirmation,
  sendAppointmentStatusUpdate,
} = require("../services/emailService");

const validateAppointment = [
  body("doctor_id").isInt(),
  body("appointment_date").isDate(),
  body("time_slot_id").isInt(),
  body("consultation_type").isIn(["online", "offline"]),
  body("patient_age").optional().isInt({ min: 0 }),
  body("patient_gender").optional().isIn(["male", "female", "other"]),
  body("health_info").optional().isString(),
];

// Get available slots (now shows all slots as multiple requests are allowed)
router.get("/available-slots/:doctorId", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({
        status: "error",
        message: "Date is required",
      });
    }

    // First check if doctor exists
    const doctorCheck = await pool.query(
      "SELECT id FROM doctors WHERE id = $1",
      [req.params.doctorId]
    );

    if (doctorCheck.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Doctor not found",
      });
    }

    // Get all possible time slots
    const slotsResult = await pool.query(
      "SELECT * FROM time_slots ORDER BY start_time"
    );

    // Get approved appointments for the doctor on the specified date
    const bookedSlotsResult = await pool.query(
      `SELECT time_slot_id 
       FROM appointments 
       WHERE doctor_id = $1 
       AND appointment_date = $2 
       AND request_status = 'approved'
       AND status != 'cancelled'`,
      [req.params.doctorId, date]
    );

    // Get array of booked slot IDs
    const bookedSlotIds = bookedSlotsResult.rows.map(
      (slot) => slot.time_slot_id
    );

    // Filter out booked slots to get available slots
    const availableSlots = slotsResult.rows.filter(
      (slot) => !bookedSlotIds.includes(slot.id)
    );

    res.json({
      status: "success",
      data: availableSlots,
    });
  } catch (error) {
    console.error("Get available slots error:", error);
    res.status(500).json({
      status: "error",
      message: "Error fetching available slots",
    });
  }
});

// Create appointment request
router.post(
  "/",
  [
    verifyToken,
    checkRole(["patient"]),
    body("doctor_id").isInt().withMessage("Doctor ID must be a number"),
    body("appointment_date")
      .isDate()
      .withMessage("Appointment date must be a valid date")
      .custom((value) => {
        const date = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (date < today) {
          throw new Error("Appointment date cannot be in the past");
        }
        return true;
      }),
    body("time_slot_id").isInt().withMessage("Time slot ID must be a number"),
    body("consultation_type")
      .isIn(["online", "offline"])
      .withMessage("Consultation type must be online or offline"),
    body("patient_age").isInt().withMessage("Patient age must be a number"),
    body("patient_gender")
      .isIn(["male", "female", "other"])
      .withMessage("Patient gender must be male, female, or other"),
    body("health_info").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: "error",
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        doctor_id,
        appointment_date,
        time_slot_id,
        consultation_type,
        patient_age,
        patient_gender,
        health_info,
      } = req.body;

      const patient_id = req.user.id;

      // Format the date to YYYY-MM-DD
      const formattedDate = new Date(appointment_date).toISOString().split('T')[0];

      // Create appointment request
      const result = await pool.query(
        `INSERT INTO appointments (
          doctor_id,
          patient_id,
          appointment_date,
          time_slot_id,
          consultation_type,
          patient_age,
          patient_gender,
          health_info,
          request_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
        RETURNING *`,
        [
          doctor_id,
          patient_id,
          formattedDate,
          time_slot_id,
          consultation_type,
          patient_age,
          patient_gender,
          health_info,
        ]
      );

      res.status(201).json({
        status: "success",
        message: "Appointment request submitted successfully. Waiting for admin approval.",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Create appointment error:", error);
      res.status(500).json({
        status: "error",
        message: "Error creating appointment request",
      });
    }
  }
);

// Get pending appointment requests (Admin)
router.get("/pending-requests", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        a.*,
        u.name as patient_name,
        u.email as patient_email,
        d.specialty,
        u2.name as doctor_name,
        ts.start_time,
        ts.end_time
      FROM appointments a
      JOIN users u ON a.patient_id = u.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN users u2 ON d.user_id = u2.id
      JOIN time_slots ts ON a.time_slot_id = ts.id
      WHERE a.request_status = 'pending'
      ORDER BY a.appointment_date, ts.start_time`
    );

    res.json({
      status: "success",
      data: result.rows,
    });
  } catch (error) {
    console.error("Get pending requests error:", error);
    res.status(500).json({
      status: "error",
      message: "Error fetching pending requests",
    });
  }
});

// Admin approve/reject appointment request
router.patch(
  "/:id/request-status",
  async (req, res) => {
    try {
      const { request_status } = req.body;
      if (!["approved", "rejected"].includes(request_status)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid request status",
        });
      }

      const appointmentCheck = await pool.query(
        `SELECT a.*, ts.start_time, ts.end_time 
         FROM appointments a
         JOIN time_slots ts ON a.time_slot_id = ts.id
         WHERE a.id = $1`,
        [req.params.id]
      );

      if (appointmentCheck.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Appointment not found",
        });
      }

      const appointment = appointmentCheck.rows[0];

      if (appointment.request_status !== "pending") {
        return res.status(400).json({
          status: "error",
          message: "This appointment request has already been processed",
        });
      }

      // If trying to approve, check if the time slot is already booked
      if (request_status === "approved") {
        const existingAppointment = await pool.query(
          `SELECT a.*, u.name as patient_name
           FROM appointments a
           JOIN users u ON a.patient_id = u.id
           WHERE a.doctor_id = $1 
           AND a.appointment_date = $2 
           AND a.time_slot_id = $3 
           AND a.request_status = 'approved'
           AND a.status != 'cancelled'
           AND a.id != $4`,
          [appointment.doctor_id, appointment.appointment_date, appointment.time_slot_id, appointment.id]
        );

        if (existingAppointment.rows.length > 0) {
          return res.status(400).json({
            status: "error",
            message: `This time slot is already booked by ${existingAppointment.rows[0].patient_name}`,
          });
        }
      }

      const result = await pool.query(
        `UPDATE appointments 
         SET request_status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [request_status, req.params.id]
      );

      res.json({
        status: "success",
        message: `Appointment request ${request_status} successfully`,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Update request status error:", error);
      res.status(500).json({
        status: "error",
        message: "Error updating request status",
      });
    }
  }
);

router.get(
  "/doctor/:doctorId",
  [verifyToken, checkRole(["doctor", "admin"])],
  async (req, res) => {
    try {
      const { date, status } = req.query;
      let query = `
            SELECT a.*, 
                   u.first_name as patient_first_name,
                   u.last_name as patient_last_name,
                   u.email as patient_email,
                   ts.start_time,
                   ts.end_time
            FROM appointments a
            JOIN users u ON a.patient_id = u.id
            JOIN time_slots ts ON a.time_slot_id = ts.id
            WHERE a.doctor_id = $1
        `;
      const queryParams = [req.params.doctorId];

      if (date) {
        query += ` AND a.appointment_date = $${queryParams.length + 1}`;
        queryParams.push(date);
      }

      if (status) {
        query += ` AND a.status = $${queryParams.length + 1}`;
        queryParams.push(status);
      }

      query += ` ORDER BY a.appointment_date, ts.start_time`;

      const result = await pool.query(query, queryParams);

      res.json({
        status: "success",
        data: result.rows,
      });
    } catch (error) {
      console.error("Get doctor appointments error:", error);
      res.status(500).json({
        status: "error",
        message: "Error fetching doctor appointments",
      });
    }
  }
);

router.get(
  "/patient",
  [verifyToken, checkRole(["patient"])],
  async (req, res) => {
    try {
      const { status } = req.query;
      let query = `
            SELECT a.*, 
                   d.specialty,
                   u.first_name as doctor_first_name,
                   u.last_name as doctor_last_name,
                   ts.start_time,
                   ts.end_time
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users u ON d.user_id = u.id
            JOIN time_slots ts ON a.time_slot_id = ts.id
            WHERE a.patient_id = $1
        `;
      const queryParams = [req.user.id];

      if (status) {
        query += ` AND a.status = $${queryParams.length + 1}`;
        queryParams.push(status);
      }

      query += ` ORDER BY a.appointment_date, ts.start_time`;

      const result = await pool.query(query, queryParams);

      res.json({
        status: "success",
        data: result.rows,
      });
    } catch (error) {
      console.error("Get patient appointments error:", error);
      res.status(500).json({
        status: "error",
        message: "Error fetching patient appointments",
      });
    }
  }
);

router.patch(
  "/:id/status",
  [verifyToken, checkRole(["doctor", "admin"])],
  async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = [
        "pending",
        "approved",
        "declined",
        "completed",
        "cancelled",
      ];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid status",
        });
      }

      const appointmentCheck = await pool.query(
        "SELECT * FROM appointments WHERE id = $1",
        [req.params.id]
      );

      if (appointmentCheck.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Appointment not found",
        });
      }

      const appointment = appointmentCheck.rows[0];

      if (appointment.doctor_id !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({
          status: "error",
          message: "Not authorized to update this appointment",
        });
      }

      const result = await pool.query(
        `UPDATE appointments 
             SET status = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
        [status, req.params.id]
      );

      await sendAppointmentStatusUpdate(
        appointment.patient_id,
        appointment.id,
        status
      );

      res.json({
        status: "success",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Update appointment status error:", error);
      res.status(500).json({
        status: "error",
        message: "Error updating appointment status",
      });
    }
  }
);

router.patch(
  "/:id/cancel",
  [verifyToken, checkRole(["patient"])],
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE appointments 
             SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND patient_id = $2
             RETURNING *`,
        [req.params.id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Appointment not found or unauthorized",
        });
      }

      res.json({
        status: "success",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Cancel appointment error:", error);
      res.status(500).json({
        status: "error",
        message: "Error cancelling appointment",
      });
    }
  }
);

module.exports = router;