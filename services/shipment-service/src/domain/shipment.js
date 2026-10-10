const { ValidationError, ConflictError } = require('./errors');

/**
 * Vòng đời giao hàng (state machine) – chỉ cho phép chuyển trạng thái hợp lệ:
 *   PENDING ──► SHIPPING ──► DELIVERED
 *      │            │
 *      └──► CANCELLED ◄──┘
 * DELIVERED và CANCELLED là trạng thái cuối, không đổi được nữa.
 */
const STATUSES = ['PENDING', 'SHIPPING', 'DELIVERED', 'CANCELLED'];
const TRANSITIONS = {
  PENDING: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

function assertTransition(from, to) {
  if (!STATUSES.includes(to)) throw ValidationError(`status must be one of: ${STATUSES.join(', ')}`);
  if (!TRANSITIONS[from].includes(to)) {
    throw ConflictError(`cannot change status from ${from} to ${to}`);
  }
}

/**
 * Kiểm tra sự kiện OrderCreated nhận từ Kafka (TC-SHP-02: thiếu oid → không tạo Shipment).
 * Trả về null nếu hợp lệ, hoặc chuỗi mô tả lỗi.
 */
function validateOrderCreated(event) {
  if (!event || event.type !== 'OrderCreated') return 'type must be OrderCreated';
  const d = event.data;
  if (!d || !Number.isInteger(d.oid) || d.oid <= 0) return 'data.oid is missing or invalid';
  if (!Number.isInteger(d.uid) || d.uid <= 0) return 'data.uid is missing or invalid';
  return null;
}

// Ai được xem shipment: chủ đơn, nhân viên giao hàng, admin
function canView(actor, shipment) {
  return actor.role === 'ADMIN' || actor.role === 'SHIPMENT_STAFF' || shipment.uid === actor.uid;
}

module.exports = { STATUSES, assertTransition, validateOrderCreated, canView };
