const { assertTransition, validateOrderCreated, canView } = require('../domain/shipment');
const { NotFoundError, ForbiddenError, ConflictError } = require('../domain/errors');
const repo = require('../infrastructure/shipment.repository');

// Xử lý sự kiện OrderCreated (TC-SHP-01, 02, 05)
async function handleOrderCreated(rawValue) {
  let event;
  try { event = JSON.parse(rawValue); } catch { event = null; }

  const problem = validateOrderCreated(event);
  if (problem) {
    // Sự kiện hỏng: KHÔNG tạo shipment, lưu lại để kiểm tra, KHÔNG làm treo consumer
    await repo.saveFailedEvent(rawValue, problem);
    console.warn(`[shipment] invalid OrderCreated event skipped: ${problem}`);
    return { result: 'invalid' };
  }

  const { oid, uid, items, total_amount } = event.data;
  const r = await repo.createForOrder({ oid, uid, items, total_amount, eventId: event.eventId });
  console.log(r.created
    ? `[shipment] created shipment ${r.shipid} for order ${oid} (PENDING)`
    : `[shipment] duplicate event for order ${oid} ignored`);
  return { result: r.created ? 'created' : 'duplicate' };
}

async function getByShipid(actor, shipid) {
  const s = await repo.findByShipid(shipid);
  if (!s) throw NotFoundError(`shipment ${shipid} not found`);
  if (!canView(actor, s)) throw ForbiddenError();
  return s;
}

async function getByOid(actor, oid) {
  const s = await repo.findByOid(oid);
  if (!s) throw NotFoundError(`shipment for order ${oid} not found (it may still be processing)`);
  if (!canView(actor, s)) throw ForbiddenError();
  return s;
}

// UC11 – nhân viên giao hàng cập nhật trạng thái
async function updateStatus(actor, shipid, status) {
  const current = await repo.findByShipid(shipid);
  if (!current) throw NotFoundError(`shipment ${shipid} not found`);
  assertTransition(current.status, status);
  const updated = await repo.updateStatus(shipid, current.status, status, `${actor.role}:${actor.uid}`);
  if (!updated) throw ConflictError('shipment was modified by someone else, please reload');
  return updated;
}

module.exports = { handleOrderCreated, getByShipid, getByOid, updateStatus };
