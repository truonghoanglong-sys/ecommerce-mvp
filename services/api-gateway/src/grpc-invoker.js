const { sendError } = require('./middleware/errors');
const { RequestError } = require('./request-mapper');

const TIMEOUT_MS = 10000;

/**
 * Bảng đổi mã lỗi gRPC → HTTP status (để client REST nhận đúng mã như API Specification).
 * Mã số theo chuẩn gRPC: https://grpc.io/docs/guides/status-codes/
 */
const GRPC_TO_HTTP = {
  3: [400, 'VALIDATION_ERROR'],      // INVALID_ARGUMENT
  16: [401, 'UNAUTHORIZED'],         // UNAUTHENTICATED
  7: [403, 'FORBIDDEN'],             // PERMISSION_DENIED
  5: [404, 'NOT_FOUND'],             // NOT_FOUND
  6: [409, 'CONFLICT'],              // ALREADY_EXISTS     (trùng username...)
  9: [409, 'CONFLICT'],              // FAILED_PRECONDITION (hết hàng, sai trạng thái...)
  10: [409, 'CONFLICT'],             // ABORTED
  8: [429, 'TOO_MANY_REQUESTS'],     // RESOURCE_EXHAUSTED
  14: [503, 'SERVICE_UNAVAILABLE'],  // UNAVAILABLE        (service chưa chạy / sập)
  4: [504, 'GATEWAY_TIMEOUT'],       // DEADLINE_EXCEEDED  (service quá chậm)
};

function sendGrpcError(res, err, route) {
  const [status, code] = GRPC_TO_HTTP[err.code] || [500, 'INTERNAL_ERROR'];
  let message = err.details || 'Internal server error';
  if (status === 503) message = `Upstream service unavailable (${route.service}-service)`;
  if (status === 504) message = `Upstream service timed out (${route.service}-service)`;
  sendError(res, status, code, message);
}

/**
 * Bước cuối của Gateway: REST request → gọi gRPC → reply → JSON response.
 *   1. Dựng message gRPC từ URL params + JSON body (kiểm tra kiểu dữ liệu)
 *   2. Gắn danh tính đã xác thực vào gRPC METADATA (x-user-id, x-user-role, x-request-id)
 *      – client KHÔNG thể tự gửi metadata này, vì Gateway tự tạo mới hoàn toàn
 *   3. Gọi RPC với deadline 10 giây
 *   4. Thành công: xoá cache nếu là thao tác ghi, lưu cache nếu là GET có cache
 */
function createInvoker({ clients, grpc, cache }) {
  return (route) => (req, res) => {
    let request;
    try {
      request = route.toRequest(req);
    } catch (err) {
      if (err instanceof RequestError) return sendError(res, 400, 'VALIDATION_ERROR', err.message);
      throw err;
    }

    const metadata = new grpc.Metadata();
    if (req.user) {
      metadata.set('x-user-id', String(req.user.uid));
      metadata.set('x-user-role', req.user.role);
    }
    metadata.set('x-request-id', req.id);

    const client = clients[route.service];
    client[route.rpc](request, metadata, { deadline: Date.now() + TIMEOUT_MS }, async (err, reply) => {
      if (err) return sendGrpcError(res, err, route);

      const body = JSON.stringify(route.toResponse ? route.toResponse(reply) : reply);
      if (route.invalidates) await cache.invalidate(route.invalidates);
      if (req.cacheKey) await cache.store(req.cacheKey, body);

      res.statusCode = route.status || 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(body);
    });
  };
}

module.exports = { createInvoker, GRPC_TO_HTTP };
