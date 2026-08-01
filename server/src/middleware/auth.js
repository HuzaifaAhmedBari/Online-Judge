const { verifyToken } = require('../utils/jwt');
const prisma = require('../utils/prisma');

/**
 * Authenticate middleware — extracts JWT from Authorization header,
 * verifies it, then re-checks the user's current role and ban status
 * from the database (never trusting the cached JWT claims alone).
 *
 * Attaches req.user = { id, username, email, role, is_banned }
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Provide a Bearer token.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    // Always re-check the user's current state from the database —
    // role or ban status may have changed since the JWT was issued
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        is_banned: true,
        banned_reason: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    next(err);
  }
}

/**
 * Ban-check middleware — rejects with 403 if the authenticated user is banned.
 * Must be used after authenticate().
 *
 * Per the spec: banned users match the logged-out access tier —
 * they can browse problems and see contest listings, but cannot
 * open/enter contests or submit code.
 */
function requireNotBanned(req, res, next) {
  if (req.user.is_banned) {
    return res.status(403).json({
      error: 'Your account has been banned.',
      reason: req.user.banned_reason || undefined,
    });
  }
  next();
}

module.exports = { authenticate, requireNotBanned };
