const config = require('./config');
const db = require('./infrastructure/db');
const { createApp } = require('./app');
const { createOrderCreatedConsumer } = require('./interfaces/messaging/order-created.consumer');
const shipmentGrpc = require('./interfaces/grpc/shipment.grpc');

async function start() {
  await db.connect();
  const consumer = createOrderCreatedConsumer();
  await consumer.start();                          // Kafka: nhận OrderCreated
  const grpcServer = await shipmentGrpc.start();   // gRPC: API Gateway gọi
  const httpServer = createApp(consumer).listen(config.port, () =>
    console.log(`shipment-service health on :${config.port}/health`)
  );

  const shutdown = () => grpcServer.tryShutdown(() =>
    httpServer.close(() => consumer.stop().then(() => db.close()).then(() => process.exit(0))));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start shipment-service:', err.message);
  process.exit(1);
});
