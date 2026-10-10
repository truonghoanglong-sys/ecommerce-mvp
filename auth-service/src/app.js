const express = require('express');
const { pool } = require('./infrastructure/db');
const authRoutes = require('./interfaces/http/auth.routes');
const { errorHandler } = require('./interfaces/http/error-handler');

const app = express();
app.use(express.json({ limit: '10kb' }));

// Health check: kiểm tra cả kết nối DB, không chỉ "process còn sống"
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ service: 'auth-service', status: 'UP', db: 'UP' });
  } catch {
    res.status(503).json({ service: 'auth-service', status: 'DOWN', db: 'DOWN' });
  }
});

// Gateway sẽ chuyển /api/auth/* → service này giữ nguyên đường dẫn
app.use('/api/auth', authRoutes);

app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
app.use(errorHandler);

module.exports = app;
