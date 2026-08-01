const express = require('express');
const { authenticate, requireNotBanned } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

/**
 * Temporary test routes to verify the auth + role middleware stack.
 * These will be removed after Milestone 1 verification.
 */

// Any authenticated user can access this
router.get('/protected', authenticate, (req, res) => {
  res.json({
    message: 'You are authenticated!',
    user: req.user,
  });
});

// Only non-banned users can access this
router.get('/not-banned', authenticate, requireNotBanned, (req, res) => {
  res.json({
    message: 'You are authenticated and not banned!',
    user: req.user,
  });
});

// Only authors and admins
router.get(
  '/author-only',
  authenticate,
  requireNotBanned,
  requireRole('author', 'admin'),
  (req, res) => {
    res.json({
      message: 'You have author or admin access!',
      user: req.user,
    });
  }
);

// Only admins
router.get(
  '/admin-only',
  authenticate,
  requireNotBanned,
  requireRole('admin'),
  (req, res) => {
    res.json({
      message: 'You have admin access!',
      user: req.user,
    });
  }
);

module.exports = router;
