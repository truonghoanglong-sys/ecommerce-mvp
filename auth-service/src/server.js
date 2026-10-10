const config = require('./config');
const app = require('./app');
const { pool, migrate } = require('./infrastructure/db');
const { seedPrivilegedUsers } = require('./application/auth.service');

async function start() {
  await migrate();               // 1. tạo bảng + seed roles
  await seedPrivilegedUsers();   // 2. tạo admin / shipper nếu chưa có
  const server = app.listen(config.port, () =>
    console.log(`auth-service listening on :${config.port}`)
  );

  // Tắt êm: đóng HTTP rồi đóng pool DB (Docker gửi SIGTERM khi stop)
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start auth-service:', err.message);
  process.exit(1);
});
