const config = require('./config');
const app = require('./app');
const { pool, migrate } = require('./infrastructure/db');
const customerGrpc = require('./interfaces/grpc/customer.grpc');

async function start() {
  await migrate();
  const grpcServer = await customerGrpc.start();   // Gateway + Auth + Order gọi
  const httpServer = app.listen(config.port, () =>
    console.log(`customer-service health on :${config.port}/health`)
  );

  const shutdown = () => grpcServer.tryShutdown(() => httpServer.close(() => pool.end().then(() => process.exit(0))));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start customer-service:', err.message);
  process.exit(1);
});
