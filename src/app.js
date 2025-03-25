const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const authRouter = require('./routes/auth');
const doctorsRouter = require('./routes/doctors');
const appointmentsRouter = require('./routes/appointments');
const adminRouter = require('./routes/admin');

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/doctors', doctorsRouter);
app.use('/api/v1/appointments', appointmentsRouter);
app.use('/api/v1/admin', adminRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Something went wrong!',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = app; 