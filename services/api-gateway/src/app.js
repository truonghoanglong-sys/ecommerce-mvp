const express = require('express');
const routes = require('./routes');
const config = require('./config');
const { requestLogger } = require('./middleware/request-logger');
const { authenticate } = require('./middleware/authenticate');
const { authorize } = require('./middleware/authorize');
const { createRateLimiter } = require('./middleware/rate-limit');
const { createCache } = require('./middleware/cache');
const { sendError } = require('./middleware/errors');
const { createInvoker } = require('./grpc-invoker');
const { createHealthHandler } = require('./health');

/**
 * Luồng xử lý MỖI request tại Gateway:
 *   Logging → (khớp route) → JWT → Rate limit → Phân quyền → Cache → gọi gRPC → JSON
 */
function createApp({ redis, clients, grpc }) {
  const app = express();
  app.disable('x-powered-by');
  const cache = createCache(redis, config.productCacheTtl);
  const invoke = createInvoker({ clients, grpc, cache });
  const rateLimit = createRateLimiter(redis);

  // Liveness: chỉ trả lời "process Gateway còn sống" (Docker HEALTHCHECK dùng)
  app.get('/livez', (req, res) => res.json({ status: 'UP' }));

  app.use(requestLogger);                                  // 1. Logging (ghi cả request bị chặn)
  app.get('/api/health', createHealthHandler(redis));      //    Health check: public
  app.use(express.json({ limit: '50kb' }));                //    Đọc JSON body để dựng message gRPC

  // 2. Đăng ký từng API trong bảng định tuyến
  for (const route of routes) {
    app[route.method.toLowerCase()](
      route.path,
      (req, res, next) => { req.route_ = route; next(); },
      authenticate,   // 3. JWT validation (bỏ qua route public)
      rateLimit,      // 4. Rate limit (Redis)
      authorize,      // 5. Phân quyền theo role
      cache.lookup,   // 6. Cache HIT → trả luôn, không gọi service
      invoke(route)   // 7. Gọi gRPC → trả JSON
    );
  }

  app.use((req, res) => sendError(res, 404, 'NOT_FOUND', 'Route not found'));

  // JSON body sai cú pháp → 400; lỗi khác → 500
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return sendError(res, 400, 'VALIDATION_ERROR', 'Malformed JSON body');
    if (err.type === 'entity.too.large') return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
    console.error('[gateway unhandled]', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  });

  return app;
}

module.exports = { createApp };
