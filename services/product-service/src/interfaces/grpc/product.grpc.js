const config = require('../../config');
const service = require('../../application/product.service');
const { loadProto, createErrorMapper, createUnary, startGrpcServer, actorFrom, requireRole } = require('./grpc-server');

const proto = loadProto(config.protoDir, 'product.proto', 'product');
// 409 của Product = hết hàng / reservation đã hoàn → FAILED_PRECONDITION (mặc định)
const unary = createUnary(createErrorMapper());

const fromMask = (req, allowed) =>
  Object.fromEntries(req.update_mask.filter((f) => allowed.includes(f)).map((f) => [f, req[f]]));

const handlers = {
  // ---- API Gateway gọi: xem cần đăng nhập, ghi cần ADMIN (phòng thủ 2 lớp cùng Gateway) ----
  ListProducts: unary(async (call) => {
    actorFrom(call);
    return { items: await service.list() };
  }),

  GetProduct: unary((call) => {
    actorFrom(call);
    return service.getOne(call.request.pid);
  }),

  CreateProduct: unary((call) => {
    requireRole(actorFrom(call), 'ADMIN');
    const { pname, price, quantity } = call.request;
    return service.create({ pname, price, quantity });
  }),

  UpdateProduct: unary(async (call) => {
    requireRole(actorFrom(call), 'ADMIN');
    const product = await service.update(call.request.pid, fromMask(call.request, ['pname', 'price', 'quantity']));
    return { message: 'Product updated successfully', product };
  }),

  DeleteProduct: unary(async (call) => {
    requireRole(actorFrom(call), 'ADMIN');
    await service.remove(call.request.pid);
    return { message: 'Product deleted successfully', pid: call.request.pid };
  }),

  // ---- Order Service gọi ----
  GetProducts: unary(async (call) => ({ items: await service.getMany(call.request.pids) })),
  ReserveStock: unary((call) => service.reserve(call.request.reservation_id, call.request.items)),
  ReleaseStock: unary((call) => service.release(call.request.reservation_id)),
};

const start = () => startGrpcServer([[proto.ProductService, handlers]], config.grpcPort, 'product-service');

module.exports = { start };
