const express = require('express');
const { ping } = require('./infrastructure/db');

// HTTP chỉ còn /health. Nghiệp vụ phục vụ qua gRPC (interfaces/grpc/product.grpc.js)
const app = express();

app.get('/health', async (req, res) => {
  try {
    await ping();
    res.json({ service: 'product-service', status: 'UP', db: 'UP' });
  } catch {
    res.status(503).json({ service: 'product-service', status: 'DOWN', db: 'DOWN' });
  }
});

module.exports = app;
