const config = require('./config');
const app = require('./app');
const { pool, migrate } = require('./infrastructure/db');
const { createOutboxPublisher } = require('./infrastructure/outbox-publisher');
const orderGrpc = require('./interfaces/grpc/order.grpc');

async function start() {
  await migrate();
  const publisher = createOutboxPublisher();
  publisher.start();                              // tiến trình nền: Outbox → Kafka
  const grpcServer = await orderGrpc.start();     // gRPC cho API Gateway
  const httpServer = app.listen(config.port, () => console.log(`order-service health on :${config.port}/health`));

  const shutdown = () => grpcServer.tryShutdown(() =>
    httpServer.close(() => publisher.stop().then(() => pool.end()).then(() => process.exit(0))));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start order-service:', err.message);
  process.exit(1);
});
