# Nairobi Houses Backend API

Complete Node.js/Express backend for the Nairobi Houses property rental platform.

## Features

✅ User Authentication (Login/Register)
✅ Listings Management (CRUD)
✅ Booking System
✅ Messaging System
✅ Reviews & Ratings
✅ Two-Factor Authentication (2FA)
✅ Admin Dashboard
✅ SQLite Database (Auto-initialized)

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

Or with auto-reload (development):
```bash
npm run dev
```

### 3. Server will run on
```
http://localhost:5000
http://192.168.1.104:5000 (for Android APK on network)
```

## Default Admin Credentials

```
Email: nyumbalink@gmail.com
Password: admin123
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires token)

### Listings
- `GET /api/listings` - Get all listings (with filters)
- `GET /api/listings/:id` - Get listing details
- `POST /api/listings` - Create listing (caretaker)
- `GET /api/listings/my/listings` - Get my listings (caretaker)
- `PUT /api/listings/:id` - Update listing
- `DELETE /api/listings/:id` - Delete listing

### Bookings
- `POST /api/bookings` - Create booking request
- `GET /api/bookings/my` - Get my bookings (tenant)
- `GET /api/bookings/requests` - Get booking requests (caretaker)
- `PATCH /api/bookings/:id/confirm` - Confirm booking
- `PATCH /api/bookings/:id/reject` - Reject booking
- `PATCH /api/bookings/:id/cancel` - Cancel booking

### Reviews
- `GET /api/listings/:id/reviews` - Get reviews for listing
- `POST /api/listings/:id/reviews` - Add review

### Messaging
- `GET /api/messages/:recipientId` - Get messages with user
- `POST /api/messages` - Send message

### 2FA
- `POST /api/auth/2fa/setup` - Setup 2FA (returns secret)
- `POST /api/auth/2fa/verify` - Verify 2FA code
- `POST /api/auth/2fa/disable` - Disable 2FA

### Admin
- `GET /api/admin/stats` - Get platform statistics
- `GET /api/admin/listings/pending` - Get pending listings
- `PATCH /api/admin/listings/:id/approve` - Approve listing
- `PATCH /api/admin/listings/:id/reject` - Reject listing
- `GET /api/admin/users` - Get all users
- `GET /api/admin/users/:id` - Get user details
- `PATCH /api/admin/users/:id/suspend` - Suspend user
- `PATCH /api/admin/users/:id/verify` - Verify user
- `DELETE /api/admin/users/:id` - Delete user

## Database

SQLite database automatically created at `nairobi_houses.db` with:
- users
- listings
- images
- bookings
- reviews
- messages

All tables are auto-created on first run!

## Environment Variables

See `.env` file:
```
PORT=5000
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
```

## Notes

- JWT tokens expire in 7 days
- 2FA uses TOTP (Time-based One-Time Password)
- All endpoints use JSON requests/responses
- Passwords are hashed with bcryptjs
- CORS enabled for all origins (configure in production)
