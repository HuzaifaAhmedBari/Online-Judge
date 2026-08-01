const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const { signToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Creates a new user with role 'participant' (default).
 * Returns a JWT on success.
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check for existing user
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });

    if (existing) {
      const field = existing.username === username ? 'username' : 'email';
      return res.status(409).json({ error: `A user with that ${field} already exists.` });
    }

    // Hash password and create user
    const password_hash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password_hash,
        // role defaults to 'participant' via schema
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        is_banned: true,
        created_at: true,
      },
    });

    const token = signToken({ id: user.id, role: user.role, username: user.username });

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Validates credentials, returns JWT.
 * Includes is_banned in response (still allows login per spec — ban
 * restricts actions, not authentication itself).
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        username: true,
        email: true,
        password_hash: true,
        role: true,
        is_banned: true,
        banned_reason: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken({ id: user.id, role: user.role, username: user.username });

    // Don't send password_hash back
    const { password_hash, ...userWithoutHash } = user;

    res.json({ user: userWithoutHash, token });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Returns the current authenticated user's profile.
 */
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
