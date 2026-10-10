const { getDb } = require('./db');

const products = () => getDb().collection('products');
const reservations = () => getDb().collection('reservations');
const PUBLIC = { projection: { _id: 0, pid: 1, pname: 1, price: 1, quantity: 1 } };

/**
 * MongoDB không có AUTO_INCREMENT → dùng collection "counters" để sinh pid kiểu INT
 * đúng như ERD (pid INT). $inc là thao tác nguyên tử nên 2 request cùng lúc không bị trùng số.
 */
async function nextPid() {
  const r = await getDb().collection('counters').findOneAndUpdate(
    { _id: 'pid' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' }
  );
  return r.seq;
}

async function insert(data) {
  const doc = { pid: await nextPid(), ...data, created_at: new Date(), updated_at: new Date() };
  await products().insertOne(doc);
  return { pid: doc.pid, pname: doc.pname, price: doc.price, quantity: doc.quantity };
}

const findAll = () => products().find({}, PUBLIC).sort({ pid: 1 }).toArray();
const findByPid = (pid) => products().findOne({ pid }, PUBLIC);
const findByPids = (pids) => products().find({ pid: { $in: pids } }, PUBLIC).toArray();

async function update(pid, changes) {
  return products().findOneAndUpdate(
    { pid }, { $set: { ...changes, updated_at: new Date() } }, { ...PUBLIC, returnDocument: 'after' }
  );
}

async function remove(pid) {
  const r = await products().deleteOne({ pid });
  return r.deletedCount === 1;
}

/**
 * Trừ kho NGUYÊN TỬ: chỉ trừ khi quantity >= qty, kiểm tra và trừ trong cùng 1 lệnh.
 * → 2 khách đặt cùng lúc món cuối cùng: chỉ 1 người thành công, kho không bao giờ âm.
 */
async function decrementIfAvailable(pid, qty) {
  const r = await products().updateOne(
    { pid, quantity: { $gte: qty } },
    { $inc: { quantity: -qty }, $set: { updated_at: new Date() } }
  );
  return r.modifiedCount === 1;
}

async function increment(pid, qty) {
  await products().updateOne({ pid }, { $inc: { quantity: qty }, $set: { updated_at: new Date() } });
}

// ---- reservations: ghi lại mỗi lần trừ kho để hoàn kho đúng 1 lần ----
const findReservation = (id) => reservations().findOne({ reservation_id: id });

async function saveReservation(id, items) {
  await reservations().insertOne({ reservation_id: id, items, status: 'RESERVED', created_at: new Date() });
}

// Đổi RESERVED → RELEASED nguyên tử; trả về reservation nếu đổi được (lần đầu), null nếu đã hoàn rồi
async function markReleased(id) {
  return reservations().findOneAndUpdate(
    { reservation_id: id, status: 'RESERVED' },
    { $set: { status: 'RELEASED', released_at: new Date() } },
    { returnDocument: 'before' }
  );
}

module.exports = {
  insert, findAll, findByPid, findByPids, update, remove,
  decrementIfAvailable, increment, findReservation, saveReservation, markReleased,
};
