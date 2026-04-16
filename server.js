const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;  // Changed to 3000
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running! ✅', timestamp: new Date().toISOString() });
});

// Initialize SQLite Database
const db = new sqlite3.Database('./nairobi_houses.db', (err) => {
  if (err) {
    console.error('Database error:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize Database Tables
async function initializeDatabase() {
  try {
    // Users table
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        national_id TEXT,
        role TEXT DEFAULT 'tenant',
        is_suspended INTEGER DEFAULT 0,
        is_verified INTEGER DEFAULT 0,
        two_fa_secret TEXT,
        two_fa_enabled INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Listings table
    await run(`
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT,
        location TEXT,
        sub_location TEXT,
        price REAL,
        bedrooms INTEGER,
        bathrooms INTEGER,
        furnished INTEGER,
        parking INTEGER,
        water INTEGER,
        generator INTEGER,
        gated INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // Images table
    await run(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        image_url TEXT,
        is_primary INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(listing_id) REFERENCES listings(id)
      )
    `);

    // Bookings table
    await run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        caretaker_id TEXT NOT NULL,
        viewing_date TEXT,
        message TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(listing_id) REFERENCES listings(id),
        FOREIGN KEY(tenant_id) REFERENCES users(id),
        FOREIGN KEY(caretaker_id) REFERENCES users(id)
      )
    `);

    // Reviews table
    await run(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        rating INTEGER,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(listing_id) REFERENCES listings(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // Messages table
    await run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sender_id) REFERENCES users(id),
        FOREIGN KEY(recipient_id) REFERENCES users(id)
      )
    `);

    // Create admin user if not exists
    const adminExists = await get('SELECT id FROM users WHERE email = ?', ['nyumbalink@gmail.com']);
    if (!adminExists) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      await run(
        'INSERT INTO users (id, name, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), 'Admin', 'nyumbalink@gmail.com', hashedPassword, 'admin', 1]
      );
      console.log('✅ Admin user created');
    }

    console.log('✅ Database initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone, national_id, role } = req.body;

    const exists = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) return res.status(400).json({ error: 'Email already registered' });

    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);
    await run(
      'INSERT INTO users (id, name, email, password, phone, national_id, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, email, hashedPassword, phone, national_id, role || 'tenant']
    );

    res.json({ message: 'Registration successful. Please login.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body.email);
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    if (user.is_suspended) {
      console.log('❌ Account suspended:', email);
      return res.status(403).json({ error: 'Account suspended' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      console.log('❌ Wrong password for:', email);
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    console.log('✅ Login successful:', email);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFAEnabled: user.two_fa_enabled
      }
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get Current User
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      twoFAEnabled: user.two_fa_enabled
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change Password
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password required' });
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = bcrypt.compareSync(currentPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
    await run('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hashedNewPassword, req.user.id]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ LISTINGS ROUTES ============

// Get All Listings
app.get('/api/listings', async (req, res) => {
  try {
    const { location, type, min_price, max_price, furnished, gated, parking } = req.query;
    let sql = 'SELECT * FROM listings WHERE status = ?';
    let params = ['approved'];

    if (location) {
      sql += ' AND location = ?';
      params.push(location);
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (min_price) {
      sql += ' AND price >= ?';
      params.push(min_price);
    }
    if (max_price) {
      sql += ' AND price <= ?';
      params.push(max_price);
    }
    if (furnished === 'true') {
      sql += ' AND furnished = 1';
    }
    if (gated === 'true') {
      sql += ' AND gated = 1';
    }
    if (parking === 'true') {
      sql += ' AND parking = 1';
    }

    const listings = await all(sql, params);
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Listing by ID
app.get('/api/listings/:id', async (req, res) => {
  try {
    const listing = await get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const images = await all('SELECT * FROM images WHERE listing_id = ?', [req.params.id]);
    const reviews = await all('SELECT * FROM reviews WHERE listing_id = ?', [req.params.id]);

    listing.images = images;
    listing.reviews = reviews;
    res.json(listing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Listing (Caretaker)
app.post('/api/listings', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'caretaker') {
      return res.status(403).json({ error: 'Only caretakers can create listings' });
    }

    const { title, type, location, sub_location, price, bedrooms, bathrooms, furnished, parking, water, generator, gated, description } = req.body;
    const id = uuidv4();

    await run(
      `INSERT INTO listings (id, user_id, title, type, location, sub_location, price, bedrooms, bathrooms, furnished, parking, water, generator, gated, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, title, type, location, sub_location, price, bedrooms, bathrooms, furnished ? 1 : 0, parking ? 1 : 0, water ? 1 : 0, generator ? 1 : 0, gated ? 1 : 0, description]
    );

    res.json({ id, message: 'Listing created - pending admin approval' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get My Listings (Caretaker)
app.get('/api/listings/my/listings', authMiddleware, async (req, res) => {
  try {
    const listings = await all('SELECT * FROM listings WHERE user_id = ?', [req.user.id]);
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Listing
app.put('/api/listings/:id', authMiddleware, async (req, res) => {
  try {
    const listing = await get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const { title, type, location, sub_location, price, bedrooms, bathrooms, furnished, parking, water, generator, gated, description } = req.body;
    await run(
      `UPDATE listings SET title=?, type=?, location=?, sub_location=?, price=?, bedrooms=?, bathrooms=?, furnished=?, parking=?, water=?, generator=?, gated=?, description=? WHERE id=?`,
      [title, type, location, sub_location, price, bedrooms, bathrooms, furnished ? 1 : 0, parking ? 1 : 0, water ? 1 : 0, generator ? 1 : 0, gated ? 1 : 0, description, req.params.id]
    );

    res.json({ message: 'Listing updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Listing
app.delete('/api/listings/:id', authMiddleware, async (req, res) => {
  try {
    const listing = await get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await run('DELETE FROM images WHERE listing_id = ?', [req.params.id]);
    await run('DELETE FROM listings WHERE id = ?', [req.params.id]);

    res.json({ message: 'Listing deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ BOOKINGS ROUTES ============

// Create Booking
app.post('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const { listing_id, viewing_date, message } = req.body;

    const listing = await get('SELECT * FROM listings WHERE id = ?', [listing_id]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const id = uuidv4();
    await run(
      'INSERT INTO bookings (id, listing_id, tenant_id, caretaker_id, viewing_date, message) VALUES (?, ?, ?, ?, ?, ?)',
      [id, listing_id, req.user.id, listing.user_id, viewing_date, message]
    );

    res.json({ id, message: 'Booking request sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get My Bookings (Tenant)
app.get('/api/bookings/my', authMiddleware, async (req, res) => {
  try {
    const bookings = await all(
      `SELECT b.*, l.title, l.location, l.sub_location, l.price, u.name as caretaker_name, u.phone as caretaker_phone 
       FROM bookings b 
       JOIN listings l ON b.listing_id = l.id 
       LEFT JOIN users u ON b.caretaker_id = u.id 
       WHERE b.tenant_id = ?`,
      [req.user.id]
    );
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Booking Requests (Caretaker)
app.get('/api/bookings/requests', authMiddleware, async (req, res) => {
  try {
    const bookings = await all(
      `SELECT b.*, l.title, l.location, l.sub_location, l.price, u.name as tenant_name, u.phone as tenant_phone 
       FROM bookings b 
       JOIN listings l ON b.listing_id = l.id 
       JOIN users u ON b.tenant_id = u.id 
       WHERE l.user_id = ?`,
      [req.user.id]
    );
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirm/Reject Booking
app.patch('/api/bookings/:id/:action', authMiddleware, async (req, res) => {
  try {
    const { action } = req.params;
    const status = action === 'confirm' ? 'confirmed' : 'rejected';
    await run('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: `Booking ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel Booking
app.patch('/api/bookings/:id/cancel', authMiddleware, async (req, res) => {
  try {
    await run('UPDATE bookings SET status = ? WHERE id = ?', ['cancelled', req.params.id]);
    res.json({ message: 'Booking cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ REVIEWS ROUTES ============

// Get Reviews for Listing
app.get('/api/listings/:id/reviews', async (req, res) => {
  try {
    const reviews = await all('SELECT * FROM reviews WHERE listing_id = ?', [req.params.id]);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Review
app.post('/api/listings/:id/reviews', authMiddleware, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const id = uuidv4();

    await run(
      'INSERT INTO reviews (id, listing_id, user_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [id, req.params.id, req.user.id, rating, comment]
    );

    res.json({ id, message: 'Review added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ MESSAGING ROUTES ============

// Get Messages
app.get('/api/messages/:recipientId', authMiddleware, async (req, res) => {
  try {
    const messages = await all(
      `SELECT * FROM messages 
       WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY timestamp ASC`,
      [req.user.id, req.params.recipientId, req.params.recipientId, req.user.id]
    );
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send Message
app.post('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { recipientId, content } = req.body;
    const id = uuidv4();

    await run(
      'INSERT INTO messages (id, sender_id, recipient_id, content) VALUES (?, ?, ?, ?)',
      [id, req.user.id, recipientId, content]
    );

    res.json({ id, message: 'Message sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ 2FA ROUTES ============

// Setup 2FA
app.post('/api/auth/2fa/setup', authMiddleware, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `NyumbaLink (${req.user.email})`,
      issuer: 'NyumbaLink'
    });

    res.json({ secret: secret.base32 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify 2FA
app.post('/api/auth/2fa/verify', authMiddleware, async (req, res) => {
  try {
    const { code, secret } = req.body;

    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) return res.status(400).json({ error: 'Invalid code' });

    await run('UPDATE users SET two_fa_secret = ?, two_fa_enabled = 1 WHERE id = ?', [secret, req.user.id]);
    res.json({ message: '2FA enabled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disable 2FA
app.post('/api/auth/2fa/disable', authMiddleware, async (req, res) => {
  try {
    await run('UPDATE users SET two_fa_secret = NULL, two_fa_enabled = 0 WHERE id = ?', [req.user.id]);
    res.json({ message: '2FA disabled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ADMIN ROUTES ============

// Get Stats
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const totalUsers = await get('SELECT COUNT(*) as count FROM users');
    const totalListings = await get('SELECT COUNT(*) as count FROM listings WHERE status = ?', ['approved']);
    const pendingListings = await get('SELECT COUNT(*) as count FROM listings WHERE status = ?', ['pending']);
    const totalBookings = await get('SELECT COUNT(*) as count FROM bookings');

    res.json({
      totalUsers: totalUsers.count,
      totalListings: totalListings.count,
      pendingListings: pendingListings.count,
      totalBookings: totalBookings.count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Pending Listings
app.get('/api/admin/listings/pending', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const listings = await all('SELECT * FROM listings WHERE status = ?', ['pending']);
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve Listing
app.patch('/api/admin/listings/:id/approve', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    await run('UPDATE listings SET status = ? WHERE id = ?', ['approved', req.params.id]);
    res.json({ message: 'Listing approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject Listing
app.patch('/api/admin/listings/:id/reject', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    await run('UPDATE listings SET status = ? WHERE id = ?', ['rejected', req.params.id]);
    res.json({ message: 'Listing rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Users
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const users = await all('SELECT id, name, email, role, is_suspended, is_verified, created_at FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get User Details
app.get('/api/admin/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Suspend/Unsuspend User
app.patch('/api/admin/users/:id/suspend', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot suspend your own account' });

    const user = await get('SELECT is_suspended FROM users WHERE id = ?', [req.params.id]);
    const newStatus = user.is_suspended ? 0 : 1;
    await run('UPDATE users SET is_suspended = ? WHERE id = ?', [newStatus, req.params.id]);

    res.json({ message: newStatus ? 'User suspended' : 'User unsuspended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify User
app.patch('/api/admin/users/:id/verify', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    await run('UPDATE users SET is_verified = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'User verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete User
app.delete('/api/admin/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

    await run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SERVER START ============

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log('📱 APK can reach at: http://192.168.1.104:5000');
  console.log('\n📝 Demo Login:');
  console.log('   Email: nyumbalink@gmail.com');
  console.log('   Password: admin123\n');
});

module.exports = app;
