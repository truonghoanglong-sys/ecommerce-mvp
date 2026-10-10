const express = require('express');
const { ping } = require('./infrastructure/db');

// HTTP chỉ còn /health. Nghiệp vụ: gRPC (interfaces/grpc) + Kafka consumer (interfaces/messaging)
function createApp(consumer) {
  const app = express();
  app.get('/health', async (req, res) => {
    const db = await ping().then(() => 'UP').catch(() => 'DOWN');
    const kafka = consumer.isRunning() ? 'UP' : 'DOWN';
    const up = db === 'UP' && kafka === 'UP';
    res.status(up ? 200 : 503).json({ service: 'shipment-service', status: up ? 'UP' : 'DOWN', db, kafka });
  });
  return app;
}

module.exports = { createApp };
