const config = require('../../config');
const service = require('../../application/shipment.service');
const { loadProto, createErrorMapper, createUnary, startGrpcServer, actorFrom, requireRole } = require('./grpc-server');

const proto = loadProto(config.protoDir, 'shipment.proto', 'shipment');
// 409 của Shipment = chuyển trạng thái không hợp lệ → FAILED_PRECONDITION (mặc định)
const unary = createUnary(createErrorMapper());

const iso = (d) => (d instanceof Date ? d.toISOString() : String(d || ''));
// Document MongoDB (có Date) → message gRPC (chuỗi ISO)
const toReply = (s) => ({
  shipid: s.shipid,
  oid: s.oid,
  uid: s.uid,
  status: s.status,
  total_amount: s.total_amount || 0,
  items: s.items || [],
  history: (s.history || []).map((h) => ({ status: h.status, at: iso(h.at), by: h.by || '' })),
  created_at: iso(s.created_at),
  updated_at: iso(s.updated_at),
});

const handlers = {
  GetShipment: unary(async (call) => toReply(await service.getByShipid(actorFrom(call), call.request.shipid))),
  GetShipmentByOrder: unary(async (call) => toReply(await service.getByOid(actorFrom(call), call.request.oid))),
  UpdateShipmentStatus: unary(async (call) => {
    const actor = actorFrom(call);
    requireRole(actor, 'SHIPMENT_STAFF', 'ADMIN');
    return toReply(await service.updateStatus(actor, call.request.shipid, call.request.status));
  }),
};

const start = () => startGrpcServer([[proto.ShipmentService, handlers]], config.grpcPort, 'shipment-service');

module.exports = { start };
