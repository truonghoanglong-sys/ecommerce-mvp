// Gửi lỗi theo đúng 1 định dạng như các service: { error: { code, message } }
function sendError(res, status, code, message, extraHeaders = {}) {
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: { code, message } }));
}

module.exports = { sendError };
