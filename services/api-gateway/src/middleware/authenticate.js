const jwt = require('jsonwebtoken');
const config = require('../config');
const { sendError } = require('./errors');

/**
 * Authentication + JWT validation.
 * Hợp lệ → req.user = { uid, role }. Sai/thiếu/hết hạn → 401 ngay tại Gateway,
 * request KHÔNG BAO GIỜ tới được service phía sau.
 */
function authenticate(req, res, next) {
  if (req.route_.public) return next();

  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Missing Bearer token');
  }
  try {
    // algorithms cố định HS256 → chặn kiểu tấn công đổi alg sang "none"
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const uid = Number(payload.sub);
    if (!Number.isInteger(uid) || !payload.role) throw new Error('bad claims');
    req.user = { uid, role: payload.role };
    next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    sendError(res, 401, expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED', expired ? 'Token expired' : 'Invalid token');
  }
}

module.exports = { authenticate };
