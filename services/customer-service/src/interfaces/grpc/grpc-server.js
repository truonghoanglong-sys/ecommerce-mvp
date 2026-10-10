const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { AppError } = require('../../domain/errors');

/**
 * Tiện ích gRPC dùng chung trong service:
 *  - nạp file .proto
 *  - đọc danh tính người gọi từ metadata (Gateway gắn sau khi kiểm tra JWT)
 *  - đổi lỗi nghiệp vụ (AppError có HTTP status) ↔ mã lỗi chuẩn của gRPC
 */
const LOADER_OPTIONS = { keepCase: true, longs: Number, enums: String, defaults: true, oneofs: true };

function loadProto(protoDir, file, pkg) {
  return grpc.loadPackageDefinition(protoLoader.loadSync(path.join(protoDir, file), LOADER_OPTIONS))[pkg];
}

// 409 có 2 nghĩa trong gRPC: ALREADY_EXISTS (trùng dữ liệu) hoặc FAILED_PRECONDITION (sai trạng thái/hết hàng)
function createErrorMapper(conflictCode = grpc.status.FAILED_PRECONDITION) {
  const HTTP_TO_GRPC = {
    400: grpc.status.INVALID_ARGUMENT,
    401: grpc.status.UNAUTHENTICATED,
    403: grpc.status.PERMISSION_DENIED,
    404: grpc.status.NOT_FOUND,
    409: conflictCode,
    503: grpc.status.UNAVAILABLE,
  };
  return function toGrpcError(err) {
    if (err instanceof AppError) {
      return { code: HTTP_TO_GRPC[err.status] || grpc.status.INTERNAL, details: err.message, message: err.message };
    }
    console.error('[grpc unhandled]', err);
    return { code: grpc.status.INTERNAL, details: 'internal error', message: 'internal error' };
  };
}

/**
 * Danh tính người gọi: Gateway gửi qua gRPC metadata (tương tự HTTP header).
 * Thiếu → UNAUTHENTICATED. Service chỉ nằm trong mạng nội bộ Docker nên tin được Gateway.
 */
function actorFrom(call) {
  const uid = Number(call.metadata.get('x-user-id')[0]);
  const role = call.metadata.get('x-user-role')[0];
  if (!Number.isInteger(uid) || uid <= 0 || !role) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return { uid, role: String(role) };
}

function requireRole(actor, ...roles) {
  if (!roles.includes(actor.role)) throw new AppError(403, 'FORBIDDEN', `Requires role: ${roles.join(' or ')}`);
}

// Bọc handler async: trả kết quả hoặc lỗi gRPC chuẩn
function createUnary(toGrpcError) {
  return (fn) => (call, callback) => {
    Promise.resolve()
      .then(() => fn(call))
      .then((reply) => callback(null, reply))
      .catch((err) => callback(toGrpcError(err)));
  };
}

function startGrpcServer(services, port, name) {
  const server = new grpc.Server();
  for (const [definition, handlers] of services) server.addService(definition.service, handlers);
  return new Promise((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
      if (err) return reject(err);
      console.log(`${name} gRPC listening on :${port}`);
      resolve(server);
    });
  });
}

module.exports = { grpc, loadProto, createErrorMapper, actorFrom, requireRole, createUnary, startGrpcServer };
