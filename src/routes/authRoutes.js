const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const client = require('../redis'); // Assuming Redis is used to store users
const { JWT_SECRET } = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const existingUser = await client.get(`user:${email}`);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userId = `usr_${Date.now()}`;
    const userObj = { id: userId, email, password: hashedPassword };

    await client.set(`user:${email}`, JSON.stringify(userObj));
    
    // Generate JWT
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '24h' });
    
    res.status(201).json({ message: 'User registered successfully', token, user: { id: userId, email } });
  } catch (err) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const userData = await client.get(`user:${email}`);
    if (!userData) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let userObj;
    if (typeof userData === 'string') {
      userObj = JSON.parse(userData);
    } else {
      userObj = userData;
    }

    const isMatch = await bcrypt.compare(password, userObj.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign({ id: userObj.id, email: userObj.email }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({ message: 'Login successful', token, user: { id: userObj.id, email: userObj.email } });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /api/auth/me (Protected Route Demo)
const { authenticateToken } = require('../middleware/authMiddleware');
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
