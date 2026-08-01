require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const problemRoutes = require('./routes/problems');
const testRoutes = require('./routes/test');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' })); // 1MB cap for source code uploads

// ─── Routes ─────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/test', testRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Error Handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  console.error(err.stack);

  // Prisma known errors
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'A record with that unique field already exists.' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error.',
  });
});

// ─── Start Server ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Online Judge API running on http://localhost:${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
