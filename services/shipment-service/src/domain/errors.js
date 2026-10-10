class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = {
  AppError,
  ValidationError: (m) => new AppError(400, 'VALIDATION_ERROR', m),
  UnauthorizedError: (m = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', m),
  ForbiddenError: (m = 'You do not have permission to perform this action') => new AppError(403, 'FORBIDDEN', m),
  NotFoundError: (m) => new AppError(404, 'NOT_FOUND', m),
  ConflictError: (m) => new AppError(409, 'CONFLICT', m),
  ServiceUnavailableError: (m) => new AppError(503, 'SERVICE_UNAVAILABLE', m),
};
