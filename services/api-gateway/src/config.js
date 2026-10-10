require('dotenv').config();
const path = require('path');

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

const svc = (name, grpcPort, httpPort) => ({
  grpcUrl: process.env[`${name}_GRPC_URL`] || `localhost:${grpcPort}`,
  healthUrl: process.env[`${name}_HEALTH_URL`] || `http://localhost:${httpPort}`,
});

module.exports = {
  port: Number(process.env.PORT || 8080),
  jwtSecret: required('JWT_SECRET'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  protoDir: path.resolve(process.cwd(), process.env.PROTO_DIR || '../../shared/proto'),
  services: {
    auth: svc('AUTH', 50051, 3001),
    customer: svc('CUSTOMER', 50052, 3002),
    product: svc('PRODUCT', 50053, 3003),
    order: svc('ORDER', 50054, 3004),
    shipment: svc('SHIPMENT', 50055, 3005),
  },
  rateLimit: {
    windowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60),
    max: Number(process.env.RATE_LIMIT_MAX || 100),
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  },
  productCacheTtl: Number(process.env.PRODUCT_CACHE_TTL_SECONDS || 30),
};
