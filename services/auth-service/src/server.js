const config = require('./config');
const app = require('./app');
const { pool, migrate } = require('./infrastructure/db');
const { seedPrivilegedUsers } = require('./application/auth.service');
const authGrpc = require('./interfaces/grpc/auth.grpc');

async function start() {
  await migrate();               // 1. tạo bảng + seed roles
  await seedPrivilegedUsers();   // 2. tạo admin / shipper nếu chưa có
  const grpcServer = await authGrpc.start();   // 3. gRPC cho API Gateway
  const httpServer = app.listen(config.port, () =>
    console.log(`auth-service health on :${config.port}/health`)
  );

  const shutdown = () => grpcServer.tryShutdown(() => httpServer.close(() => pool.end().then(() => process.exit(0))));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start auth-service:', err.message);
  process.exit(1);
});
