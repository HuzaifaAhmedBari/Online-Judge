/**
 * Role-based access control middleware.
 * Usage: requireRole('author', 'admin') — allows only those roles through.
 * Must be used after authenticate() middleware.
 *
 * Per the spec: roles are a strict superset hierarchy
 *   participant < author < admin
 * But this middleware checks explicit membership, not hierarchy,
 * so callers must list all acceptable roles.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
      });
    }

    next();
  };
}

module.exports = { requireRole };
