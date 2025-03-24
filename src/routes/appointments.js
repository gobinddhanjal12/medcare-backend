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

router.get("/available-slots/:doctorId", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({
        status: "error",
        message: "Date is required",
      });
    }

    const slotsResult = await pool.query(
      "SELECT * FROM time_slots ORDER BY start_time"
    );

    const bookedSlotsResult = await pool.query(
      `SELECT time_slot_id 
             FROM appointments 
             WHERE doctor_id = $1 
             AND appointment_date = $2 
             AND status != 'cancelled'`,
      [req.params.doctorId, date]
    );

    const bookedSlotIds = bookedSlotsResult.rows.map(
      (slot) => slot.time_slot_id
    );

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

router.post(
  "/",
  [verifyToken, checkRole(["patient"]), validateAppointment],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
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

      const slotCheck = await pool.query(
        `SELECT * FROM appointments 
             WHERE doctor_id = $1 
             AND appointment_date = $2 
             AND time_slot_id = $3 
             AND status != 'cancelled'`,
        [doctor_id, appointment_date, time_slot_id]
      );

      if (slotCheck.rows.length > 0) {
        return res.status(400).json({
          status: "error",
          message: "This time slot is already booked",
        });
      }

      const doctorResult = await pool.query(
        `SELECT d.*, u.first_name, u.last_name, u.email as doctor_email
             FROM doctors d
             JOIN users u ON d.user_id = u.id
             WHERE d.id = $1`,
        [doctor_id]
      );

      if (doctorResult.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Doctor not found",
        });
      }

      const result = await pool.query(
        `INSERT INTO appointments (
                doctor_id, patient_id, appointment_date, time_slot_id,
                consultation_type, patient_age, patient_gender, health_info
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
        [
          doctor_id,
          req.user.id,
          appointment_date,
          time_slot_id,
          consultation_type,
          patient_age,
          patient_gender,
          health_info,
        ]
      );

      const appointment = result.rows[0];

      await sendAppointmentConfirmation(
        appointment,
        req.user.email,
        `${doctorResult.rows[0].first_name} ${doctorResult.rows[0].last_name}`,
        consultation_type
      );

      res.status(201).json({
        status: "success",
        data: appointment,
      });
    } catch (error) {
      console.error("Create appointment error:", error);
      res.status(500).json({
        status: "error",
        message: "Error creating appointment",
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