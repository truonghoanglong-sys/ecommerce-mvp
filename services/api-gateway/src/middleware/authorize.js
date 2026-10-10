const { sendError } = require('./errors');

// Authorization theo role (UC13): JWT hợp lệ nhưng không đủ quyền → 403, KHÔNG gọi tới service
function authorize(req, res, next) {
  const allowed = req.route_.roles;
  if (!allowed || (req.user && allowed.includes(req.user.role))) return next();
  sendError(res, 403, 'FORBIDDEN', `Requires role: ${allowed.join(' or ')}`);
}

module.exports = { authorize };
