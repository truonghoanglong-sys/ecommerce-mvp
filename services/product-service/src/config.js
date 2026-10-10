require('dotenv').config();
const path = require('path');

module.exports = {
  port: Number(process.env.PORT || 3003),
  grpcPort: Number(process.env.GRPC_PORT || 50053),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27018',
  mongoDb: process.env.MONGO_DB || 'product_db',
  protoDir: path.resolve(process.cwd(), process.env.PROTO_DIR || '../../shared/proto'),
};
