const config = require('./config');
const app = require('./app');
const db = require('./infrastructure/db');
const productGrpc = require('./interfaces/grpc/product.grpc');

async function start() {
  await db.connect();
  const grpcServer = await productGrpc.start();   // Gateway + Order gọi
  const httpServer = app.listen(config.port, () =>
    console.log(`product-service health on :${config.port}/health`)
  );

  const shutdown = () => grpcServer.tryShutdown(() => httpServer.close(() => db.close().then(() => process.exit(0))));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start product-service:', err.message);
  process.exit(1);
});
