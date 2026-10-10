const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const config = require('../config');
const { AppError } = require('../domain/errors');

const load = (file, pkg) => grpc.loadPackageDefinition(
  protoLoader.loadSync(path.join(config.protoDir, file), { keepCase: true, longs: Number, enums: String, defaults: true })
)[pkg];

const customerStub = new (load('customer.proto', 'customer').CustomerService)(config.customerGrpcUrl, grpc.credentials.createInsecure());
const productStub = new (load('product.proto', 'product').ProductService)(config.productGrpcUrl, grpc.credentials.createInsecure());

const TIMEOUT_MS = 3000;

// Đổi lỗi gRPC → lỗi nghiệp vụ có HTTP status, giữ lại grpcCode để tầng application quyết định hoàn kho
const GRPC_TO_HTTP = {
  [grpc.status.INVALID_ARGUMENT]: [400, 'VALIDATION_ERROR'],
  [grpc.status.NOT_FOUND]: [404, 'NOT_FOUND'],
  [grpc.status.FAILED_PRECONDITION]: [409, 'CONFLICT'],
  [grpc.status.ALREADY_EXISTS]: [409, 'CONFLICT'],
  [grpc.status.UNAVAILABLE]: [503, 'SERVICE_UNAVAILABLE'],
  [grpc.status.DEADLINE_EXCEEDED]: [503, 'SERVICE_UNAVAILABLE'],
};

function call(stub, method, req, serviceName) {
  return new Promise((resolve, reject) => {
    stub[method](req, { deadline: Date.now() + TIMEOUT_MS }, (err, reply) => {
      if (!err) return resolve(reply);
      const [status, code] = GRPC_TO_HTTP[err.code] || [502, 'BAD_GATEWAY'];
      const message = status === 503 ? `${serviceName} is unavailable` : err.details;
      const e = new AppError(status, code, message);
      e.grpcCode = err.code;
      reject(e);
    });
  });
}

const customers = {
  getCustomer: (uid) => call(customerStub, 'GetCustomer', { uid }, 'customer-service'),
};

const products = {
  getProducts: async (pids) => (await call(productStub, 'GetProducts', { pids }, 'product-service')).items,
  reserveStock: (reservationId, items) =>
    call(productStub, 'ReserveStock', { reservation_id: reservationId, items }, 'product-service'),
  releaseStock: (reservationId) => call(productStub, 'ReleaseStock', { reservation_id: reservationId }, 'product-service'),
};

module.exports = { customers, products };
