const config = require('../../config');
const service = require('../../application/customer.service');
const { loadProto, createErrorMapper, createUnary, startGrpcServer, actorFrom, grpc } = require('./grpc-server');

const proto = loadProto(config.protoDir, 'customer.proto', 'customer');
const unary = createUnary(createErrorMapper(grpc.status.ALREADY_EXISTS));

const toReply = (c) => ({ ...c, phone: c.phone || '' });

// Dựng lại "body cập nhật" từ update_mask: chỉ những field client thực sự gửi
const fromMask = (req, allowed) =>
  Object.fromEntries(req.update_mask.filter((f) => allowed.includes(f)).map((f) => [f, req[f]]));

const handlers = {
  // ---- API Gateway gọi (cần danh tính người gọi trong metadata) ----
  GetCustomerProfile: unary(async (call) => toReply(await service.getCustomer(actorFrom(call), call.request.uid))),

  UpdateCustomer: unary(async (call) => {
    const body = fromMask(call.request, ['fullname', 'phone', 'score']);
    const customer = await service.updateCustomer(actorFrom(call), call.request.uid, body);
    return { message: 'Customer updated successfully', customer: toReply(customer) };
  }),

  GetMembership: unary((call) => service.getMembership(actorFrom(call), call.request.uid)),

  ListMemberships: unary(async (call) => {
    actorFrom(call); // chỉ cần đã đăng nhập
    return { items: await service.listMemberships() };
  }),

  // ---- Service nội bộ gọi (Auth, Order) ----
  CreateCustomer: unary(async (call) => toReply(await service.createCustomer(call.request))),
  GetCustomer: unary(async (call) => toReply(await service.getById(call.request.uid))),
};

const start = () => startGrpcServer([[proto.CustomerService, handlers]], config.grpcPort, 'customer-service');

module.exports = { start };
