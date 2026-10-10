const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const config = require('./config');

/**
 * Tạo 1 gRPC client cho mỗi service (kết nối được giữ và dùng lại cho mọi request).
 * Hợp đồng lấy từ shared/proto/*.proto – cùng file mà service dùng để dựng server.
 */
const OPTIONS = { keepCase: true, longs: Number, enums: String, defaults: true, oneofs: true };
const load = (file, pkg) =>
  grpc.loadPackageDefinition(protoLoader.loadSync(path.join(config.protoDir, file), OPTIONS))[pkg];

const insecure = grpc.credentials.createInsecure();
const { services } = config;

const clients = {
  auth: new (load('auth.proto', 'auth').AuthService)(services.auth.grpcUrl, insecure),
  customer: new (load('customer.proto', 'customer').CustomerService)(services.customer.grpcUrl, insecure),
  product: new (load('product.proto', 'product').ProductService)(services.product.grpcUrl, insecure),
  order: new (load('order.proto', 'order').OrderService)(services.order.grpcUrl, insecure),
  shipment: new (load('shipment.proto', 'shipment').ShipmentService)(services.shipment.grpcUrl, insecure),
};

module.exports = { clients, grpc };
