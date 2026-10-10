const config = require('../config');
const { sendError } = require('./errors');

/**
 * Rate limiting kiểu "fixed window" bằng Redis:
 *   key = rl:<nhóm>:<ai>:<số thứ tự cửa sổ>   → INCR mỗi request, tự hết hạn sau 1 cửa sổ.
 * "ai" = uid nếu đã đăng nhập, ngược lại = IP.
 * Dùng Redis (không dùng biến trong RAM) để khi chạy NHIỀU Gateway, giới hạn vẫn tính chung.
 */
function createRateLimiter(redis) {
  return async function rateLimit(req, res, next) {
    const isAuth = req.route_.rateLimit === 'auth';
    const max = isAuth ? config.rateLimit.authMax : config.rateLimit.max;
    const windowSec = config.rateLimit.windowSeconds;
    const who = req.user ? `u${req.user.uid}` : `ip${req.socket.remoteAddress}`;
    const windowNo = Math.floor(Date.now() / 1000 / windowSec);
    const key = `rl:${isAuth ? 'auth' : 'api'}:${who}:${windowNo}`;

    try {
      const [[, count]] = await redis.multi().incr(key).expire(key, windowSec).exec();
      const resetIn = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
      res.setHeader('x-ratelimit-limit', max);
      res.setHeader('x-ratelimit-remaining', Math.max(0, max - count));
      if (count > max) {
        return sendError(res, 429, 'TOO_MANY_REQUESTS', `Rate limit exceeded, retry in ${resetIn}s`, {
          'retry-after': resetIn,
        });
      }
    } catch (err) {
      // Redis lỗi → "fail open": vẫn cho qua, chỉ ghi cảnh báo. Không để Redis làm sập cả hệ thống.
      console.warn('[rate-limit] redis unavailable, skipping:', err.message);
    }
    next();
  };
}

module.exports = { createRateLimiter };
