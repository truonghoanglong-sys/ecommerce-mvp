const { UnauthorizedError } = require('../../domain/errors');

/**
 * API Gateway đã kiểm tra JWT, rồi gắn danh tính vào 2 header:
 *   x-user-id: <uid>     x-user-role: <ADMIN|CUSTOMER|SHIPMENT_STAFF>
 * Service tin 2 header này VÌ service không mở ra Internet – chỉ Gateway gọi được (Bước 10).
 */
function requireUser(req, _res, next) {
  const uid = Number(req.header('x-user-id'));
  const role = req.header('x-user-role');
  if (!Number.isInteger(uid) || uid <= 0 || !role) return next(UnauthorizedError());
  req.user = { uid, role };
  next();
}

// Chỉ cho phép các role được liệt kê (ví dụ: requireRole('ADMIN'))
function requireRole(...roles) {
  const { ForbiddenError } = require('../../domain/errors');
  return (req, _res, next) => (roles.includes(req.user.role) ? next() : next(ForbiddenError()));
}

module.exports = { requireUser, requireRole };
