// Lỗi nghiệp vụ mang sẵn HTTP status, để tầng interface map ra response thống nhất.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ValidationError = (msg) => new AppError(400, 'VALIDATION_ERROR', msg);
const UnauthorizedError = (msg = 'Invalid username or password') => new AppError(401, 'UNAUTHORIZED', msg);
const ConflictError = (msg) => new AppError(409, 'CONFLICT', msg);

module.exports = { AppError, ValidationError, UnauthorizedError, ConflictError };
