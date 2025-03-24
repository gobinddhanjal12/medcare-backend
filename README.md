# MedCare Backend

A professional Express.js backend with PostgreSQL database.

## Project Structure

```
src/
├── config/         # Configuration files
├── controllers/    # Route controllers
├── middleware/     # Custom middleware
├── models/        # Database models
├── routes/        # API routes
├── services/      # Business logic
└── server.js      # Application entry point
```

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL
- npm or yarn

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a PostgreSQL database named `medcare_db`
4. Copy `.env.example` to `.env` and update the values
5. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /api/v1/health` - Health check endpoint

## Development

- `npm run dev` - Start development server with hot reload
- `npm start` - Start production server
- `npm test` - Run tests 