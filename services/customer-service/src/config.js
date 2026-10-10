require('dotenv').config();
const path = require('path');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT || 3002),
  grpcPort: Number(process.env.GRPC_PORT || 50052),
  databaseUrl: required('DATABASE_URL'),
  protoDir: path.resolve(process.cwd(), process.env.PROTO_DIR || '../../shared/proto'),
};
