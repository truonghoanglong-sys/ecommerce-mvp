const express = require('express');
const { pool } = require('./infrastructure/db');

// HTTP chỉ còn dùng cho health check (Docker HEALTHCHECK + Gateway /api/health).
// Nghiệp vụ (Register/Login) được phục vụ qua gRPC – xem interfaces/grpc/auth.grpc.js
const app = express();

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ service: 'auth-service', status: 'UP', db: 'UP' });
  } catch {
    res.status(503).json({ service: 'auth-service', status: 'DOWN', db: 'DOWN' });
  }
});

module.exports = app;
