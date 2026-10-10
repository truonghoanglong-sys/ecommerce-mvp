// "Composition root": nơi DUY NHẤT ghép application service với infrastructure thật.
const orderRepo = require('./infrastructure/order.repository');
const { customers, products } = require('./infrastructure/grpc-clients');
const { createOrderService } = require('./application/order.service');

module.exports = { orderService: createOrderService({ customers, products, orders: orderRepo }) };
