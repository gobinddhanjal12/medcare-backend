const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
    createDoctor,
    getAllDoctors,
    getTopRatedDoctors,
    getDoctorById,
    updateDoctor,
    deleteDoctor
} = require('../controllers/doctorController');

const validateDoctorProfile = [
    body('specialty').notEmpty(),
    body('experience').isInt({ min: 0 }),
    body('location').notEmpty(),
    body('consultation_fee').isFloat({ min: 0 }),
    body('bio').optional(),
    body('education').notEmpty(),
    body('languages').isArray(),
    body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other')
];

router.post('/', [
    verifyToken,
    upload.single('photo'),
    validateDoctorProfile
], createDoctor);

router.get('/', getAllDoctors);

router.get('/top-rated', getTopRatedDoctors);

router.get('/:id', getDoctorById);

router.put('/:id', [
    verifyToken,
    upload.single('photo'),
    validateDoctorProfile
], updateDoctor);

router.delete('/:id', verifyToken, deleteDoctor);

module.exports = router; 