const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const doctorRoutes = require('./doctors');
const appointmentRoutes = require('./appointments');

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy'
  });
});

router.use('/auth', authRoutes);
router.use('/doctors', doctorRoutes);
router.use('/appointments', appointmentRoutes);

module.exports = router; 