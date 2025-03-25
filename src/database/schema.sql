-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_password_token VARCHAR(255),
    reset_password_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create doctors table
CREATE TABLE doctors (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
    specialty VARCHAR(100) NOT NULL,
    experience INTEGER NOT NULL,
    location VARCHAR(255) NOT NULL,
    consultation_fee DECIMAL(10,2) NOT NULL,
    bio TEXT,
    education TEXT,
    languages TEXT[],
    gender VARCHAR(10) NOT NULL,
    photo VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create time_slots table
CREATE TABLE time_slots (
    id SERIAL PRIMARY KEY,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create appointments table
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    patient_id INTEGER NOT NULL REFERENCES users(id),
    appointment_date DATE NOT NULL,
    time_slot_id INTEGER NOT NULL REFERENCES time_slots(id),
    consultation_type VARCHAR(20) NOT NULL CHECK (consultation_type IN ('online', 'offline')),
    patient_age INTEGER,
    patient_gender VARCHAR(10) CHECK (patient_gender IN ('male', 'female', 'other')),
    health_info TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_doctors_updated_at
    BEFORE UPDATE ON doctors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default time slots (16 slots total)
-- Morning slots (8 slots from 9 AM to 12:30 PM)
INSERT INTO time_slots (start_time, end_time) VALUES
    ('09:00:00', '09:30:00'),
    ('09:30:00', '10:00:00'),
    ('10:00:00', '10:30:00'),
    ('10:30:00', '11:00:00'),
    ('11:00:00', '11:30:00'),
    ('11:30:00', '12:00:00'),
    ('12:00:00', '12:30:00'),
    ('12:30:00', '13:00:00'),
    -- Afternoon slots (8 slots from 2 PM to 5:30 PM)
    ('14:00:00', '14:30:00'),
    ('14:30:00', '15:00:00'),
    ('15:00:00', '15:30:00'),
    ('15:30:00', '16:00:00'),
    ('16:00:00', '16:30:00'),
    ('16:30:00', '17:00:00'),
    ('17:00:00', '17:30:00'),
    ('17:30:00', '18:00:00'); 