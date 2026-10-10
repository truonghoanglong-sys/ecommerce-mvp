const crypto = require('crypto');

/**
 * Logging: mỗi request 1 dòng JSON + gắn x-request-id.
 * x-request-id được chuyển tiếp xuống service → tra log 1 request xuyên suốt nhiều service.
 */
function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  req.id = req.header('x-request-id') || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(JSON.stringify({
      time: new Date().toISOString(),
      reqId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms),
      uid: req.user ? req.user.uid : null,
      ip: req.socket.remoteAddress,
      cache: res.getHeader('x-cache') || undefined,
    }));
  });
  next();
}

module.exports = { requestLogger };
