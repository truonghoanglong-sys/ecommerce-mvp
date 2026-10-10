require('dotenv').config();
const path = require('path');

module.exports = {
  port: Number(process.env.PORT || 3005),          // HTTP: chỉ còn /health
  grpcPort: Number(process.env.GRPC_PORT || 50055), // gRPC: Gateway gọi
  protoDir: path.resolve(process.cwd(), process.env.PROTO_DIR || '../../shared/proto'),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27019',
  mongoDb: process.env.MONGO_DB || 'shipment_db',
  kafkaBrokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  kafkaGroupId: process.env.KAFKA_GROUP_ID || 'shipment-service',
};
