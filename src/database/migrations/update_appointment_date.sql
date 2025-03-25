-- Update appointment_date column to use DATE type without timezone
ALTER TABLE appointments 
ALTER COLUMN appointment_date TYPE DATE USING appointment_date::DATE; 