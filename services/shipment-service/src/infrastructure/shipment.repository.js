const { getDb } = require('./db');

const shipments = () => getDb().collection('shipments');
const PUBLIC = { projection: { _id: 0 } };

async function nextShipid() {
  // shipid INT theo ERD; bắt đầu từ 5001 cho giống ví dụ trong API spec
  const r = await getDb().collection('counters').findOneAndUpdate(
    { _id: 'shipid' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' }
  );
  return 5000 + r.seq;
}

/**
 * Tạo shipment cho đơn. Trả về { created: false } nếu đơn đã có shipment
 * (MongoDB báo lỗi E11000 duplicate key nhờ unique index trên oid) → idempotent.
 */
async function createForOrder({ oid, uid, items, total_amount, eventId }) {
  const now = new Date();
  const doc = {
    shipid: await nextShipid(), oid, uid, items, total_amount,
    status: 'PENDING',
    history: [{ status: 'PENDING', at: now, by: 'system' }],
    source_event_id: eventId,
    created_at: now, updated_at: now,
  };
  try {
    await shipments().insertOne(doc);
    return { created: true, shipid: doc.shipid };
  } catch (err) {
    if (err.code === 11000) return { created: false };
    throw err;
  }
}

const findByShipid = (shipid) => shipments().findOne({ shipid }, PUBLIC);
const findByOid = (oid) => shipments().findOne({ oid }, PUBLIC);

/**
 * Cập nhật trạng thái có điều kiện "status hiện tại vẫn là from"
 * → 2 nhân viên bấm cùng lúc thì chỉ 1 người thành công (optimistic concurrency).
 */
async function updateStatus(shipid, from, to, by) {
  const now = new Date();
  return shipments().findOneAndUpdate(
    { shipid, status: from },
    { $set: { status: to, updated_at: now }, $push: { history: { status: to, at: now, by } } },
    { ...PUBLIC, returnDocument: 'after' }
  );
}

async function saveFailedEvent(raw, reason) {
  await getDb().collection('failed_events').insertOne({ raw, reason, received_at: new Date() });
}

module.exports = { createForOrder, findByShipid, findByOid, updateStatus, saveFailedEvent };
