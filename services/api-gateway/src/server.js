const config = require('./config');
const redis = require('./redis');
const { clients, grpc } = require('./grpc-clients');
const { createApp } = require('./app');

async function start() {
  try {
    await redis.connect();
    console.log('[redis] connected');
  } catch (err) {
    // Không dừng Gateway: rate limit + cache sẽ tạm bỏ qua cho tới khi Redis sống lại
    console.warn('[redis] not available at startup, continuing without it:', err.message);
  }

  const server = createApp({ redis, clients, grpc }).listen(config.port, () =>
    console.log(`api-gateway listening on :${config.port} (REST → gRPC)`)
  );

  const shutdown = () => server.close(() => {
    Object.values(clients).forEach((c) => c.close());
    redis.quit().finally(() => process.exit(0));
  });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();
