require('dotenv').config();
const path = require('path');

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

module.exports = {
  port: Number(process.env.PORT || 3004),          // HTTP: chỉ còn /health
  grpcPort: Number(process.env.GRPC_PORT || 50054), // gRPC: Gateway gọi
  databaseUrl: required('DATABASE_URL'),
  customerGrpcUrl: process.env.CUSTOMER_GRPC_URL || 'localhost:50052',
  productGrpcUrl: process.env.PRODUCT_GRPC_URL || 'localhost:50053',
  kafkaBrokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  outboxPollMs: Number(process.env.OUTBOX_POLL_MS || 1000),
  protoDir: path.resolve(process.cwd(), process.env.PROTO_DIR || '../../shared/proto'),
};
