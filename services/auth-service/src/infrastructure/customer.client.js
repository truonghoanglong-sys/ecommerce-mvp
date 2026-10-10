const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const config = require('../config');

// gRPC client tới Customer Service. Hợp đồng nằm ở shared/proto/customer.proto
const definition = protoLoader.loadSync(path.join(config.protoDir, 'customer.proto'), {
  keepCase: true, longs: Number, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(definition).customer;
const client = new proto.CustomerService(config.customerGrpcUrl, grpc.credentials.createInsecure());

const TIMEOUT_MS = 3000; // luôn đặt deadline: service kia treo thì mình không treo theo

function createCustomer({ uid, fullname, phone }) {
  return new Promise((resolve, reject) => {
    client.createCustomer(
      { uid, fullname: fullname || '', phone: phone || '' },
      { deadline: Date.now() + TIMEOUT_MS },
      (err, reply) => (err ? reject(err) : resolve(reply))
    );
  });
}

module.exports = { createCustomer, status: grpc.status };
