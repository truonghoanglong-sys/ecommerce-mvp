const express = require('express');
const { pool } = require('./infrastructure/db');

// HTTP chỉ còn /health. Nghiệp vụ phục vụ qua gRPC (interfaces/grpc/customer.grpc.js)
const app = express();

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ service: 'customer-service', status: 'UP', db: 'UP' });
  } catch {
    res.status(503).json({ service: 'customer-service', status: 'DOWN', db: 'DOWN' });
  }
});

module.exports = app;
