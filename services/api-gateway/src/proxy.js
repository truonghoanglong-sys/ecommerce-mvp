const http = require('http');
const { sendError } = require('./middleware/errors');

// Header "hop-by-hop" chỉ có ý nghĩa trên 1 chặng kết nối → không được chuyển tiếp
const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'te', 'trailer'];
const TIMEOUT_MS = 10000;

/**
 * Routing: chuyển tiếp request sang service đích, giữ nguyên method + đường dẫn + body.
 * Gateway KHÔNG đọc body (không dùng express.json) → body được "chảy" thẳng (stream) sang service.
 */
function createProxy({ onCacheable, onWriteSuccess } = {}) {
  return function proxy(req, res) {
    const route = req.route_;
    const url = new URL(req.originalUrl, route.target);

    const headers = { ...req.headers, host: url.host };
    for (const h of HOP_BY_HOP) delete headers[h];
    // BẢO MẬT: xoá header danh tính client tự gửi lên, rồi gắn lại từ JWT đã kiểm tra.
    // Nếu không xoá, ai cũng có thể gửi "x-user-role: ADMIN" để giả làm Admin.
    delete headers['x-user-id'];
    delete headers['x-user-role'];
    if (req.user) {
      headers['x-user-id'] = String(req.user.uid);
      headers['x-user-role'] = req.user.role;
    }
    headers['x-request-id'] = req.id;
    headers['x-forwarded-for'] = req.socket.remoteAddress || '';

    const upstream = http.request(url, { method: req.method, headers, timeout: TIMEOUT_MS }, (up) => {
      const status = up.statusCode;
      for (const [k, v] of Object.entries(up.headers)) {
        if (!HOP_BY_HOP.includes(k)) res.setHeader(k, v);
      }
      res.statusCode = status;

      if (status >= 200 && status < 300 && req.method !== 'GET' && route.invalidates && onWriteSuccess) {
        onWriteSuccess(route.invalidates);
      }

      if (req.cacheKey && status === 200 && onCacheable) {
        // Cần giữ lại toàn bộ body để lưu cache → gom các chunk lại
        const chunks = [];
        up.on('data', (c) => chunks.push(c));
        up.on('end', () => {
          const body = Buffer.concat(chunks);
          onCacheable(req.cacheKey, body.toString('utf8'));
          res.setHeader('content-length', body.length);
          res.end(body);
        });
      } else {
        up.pipe(res);
      }
    });

    upstream.on('timeout', () => upstream.destroy(Object.assign(new Error('upstream timeout'), { code: 'ETIMEDOUT' })));
    upstream.on('error', (err) => {
      if (res.headersSent) return res.destroy();
      if (err.code === 'ETIMEDOUT') return sendError(res, 504, 'GATEWAY_TIMEOUT', 'Upstream service timed out');
      // ECONNREFUSED: service chưa chạy hoặc đã sập
      sendError(res, 503, 'SERVICE_UNAVAILABLE', `Upstream service unavailable (${route.prefix})`);
    });

    req.pipe(upstream);
  };
}

module.exports = { createProxy };
