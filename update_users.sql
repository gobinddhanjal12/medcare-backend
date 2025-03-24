ALTER TABLE users 
ADD COLUMN verification_token VARCHAR(255),
ADD COLUMN verification_token_expires TIMESTAMP,
ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN reset_token VARCHAR(255),
ADD COLUMN reset_token_expires TIMESTAMP; 