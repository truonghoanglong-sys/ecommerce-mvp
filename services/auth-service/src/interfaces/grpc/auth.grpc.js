const config = require('../../config');
const authService = require('../../application/auth.service');
const { loadProto, createErrorMapper, createUnary, startGrpcServer, grpc } = require('./grpc-server');

const proto = loadProto(config.protoDir, 'auth.proto', 'auth');
// Trùng username/email → ALREADY_EXISTS (Gateway đổi thành HTTP 409)
const unary = createUnary(createErrorMapper(grpc.status.ALREADY_EXISTS));

// Handler mỏng: nhận message gRPC → gọi use case → trả message. Nghiệp vụ nằm ở application/domain.
const handlers = {
  Register: unary((call) => authService.register(call.request)),

  Login: unary(async (call) => {
    const r = await authService.login(call.request);
    return { access_token: r.accessToken, token_type: r.tokenType, expires_in: r.expiresIn };
  }),
};

const start = () => startGrpcServer([[proto.AuthService, handlers]], config.grpcPort, 'auth-service');

module.exports = { start };
