const config = require('../../config');
const { orderService } = require('../../container');
const { loadProto, createErrorMapper, createUnary, startGrpcServer, actorFrom } = require('./grpc-server');

const proto = loadProto(config.protoDir, 'order.proto', 'order');
// 409 của Order = hết hàng → FAILED_PRECONDITION (mặc định)
const unary = createUnary(createErrorMapper());

// Date (từ PostgreSQL) → chuỗi ISO, vì proto khai báo created_at là string
const toReply = (o) => ({
  ...o,
  created_at: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at || ''),
  items: o.items || [],
  membership: o.membership || '',
});

const handlers = {
  CreateOrder: unary(async (call) => toReply(await orderService.placeOrder(actorFrom(call), call.request))),
  ListOrders: unary(async (call) => ({ items: (await orderService.listOrders(actorFrom(call))).map(toReply) })),
  GetOrder: unary(async (call) => toReply(await orderService.getOrder(actorFrom(call), call.request.oid))),
};

const start = () => startGrpcServer([[proto.OrderService, handlers]], config.grpcPort, 'order-service');

module.exports = { start };
