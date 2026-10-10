const { validateNewProduct, validateProductUpdate, normalizeStockItems } = require('../domain/product');
const { NotFoundError, ConflictError, ValidationError } = require('../domain/errors');
const repo = require('../infrastructure/product.repository');

// ---------- UC04 / UC05: CRUD ----------
const list = () => repo.findAll();

async function getOne(pid) {
  const p = await repo.findByPid(pid);
  if (!p) throw NotFoundError(`product ${pid} not found`);
  return p;
}

const create = (body) => repo.insert(validateNewProduct(body));

async function update(pid, body) {
  const p = await repo.update(pid, validateProductUpdate(body));
  if (!p) throw NotFoundError(`product ${pid} not found`);
  return p;
}

async function remove(pid) {
  if (!(await repo.remove(pid))) throw NotFoundError(`product ${pid} not found`);
}

// ---------- gRPC cho Order Service ----------
async function getMany(pids) {
  return repo.findByPids([...new Set(pids)]);
}

/**
 * UC08 – Trừ kho cho cả đơn hàng: ĐƯỢC HẾT hoặc KHÔNG GÌ CẢ.
 * MongoDB chạy 1 node không hỗ trợ transaction nhiều document, nên:
 *   trừ lần lượt từng sản phẩm; nếu 1 sản phẩm thiếu hàng → cộng trả lại các sản phẩm đã trừ.
 */
async function reserve(reservationId, rawItems) {
  if (typeof reservationId !== 'string' || !reservationId) throw ValidationError('reservation_id is required');

  // Idempotent: Order gọi lại (do timeout mạng...) với cùng reservation_id → trả kết quả cũ, không trừ lần 2
  const existing = await repo.findReservation(reservationId);
  if (existing) {
    if (existing.status === 'RELEASED') throw ConflictError(`reservation ${reservationId} was already released`);
    return { reservation_id: reservationId, items: existing.items };
  }

  const items = normalizeStockItems(rawItems);
  const found = await repo.findByPids(items.map((i) => i.pid));
  const byPid = new Map(found.map((p) => [p.pid, p]));
  const missing = items.filter((i) => !byPid.has(i.pid)).map((i) => i.pid);
  if (missing.length) throw NotFoundError(`product(s) not found: ${missing.join(', ')}`);

  const done = [];
  for (const it of items) {
    if (await repo.decrementIfAvailable(it.pid, it.qty)) {
      done.push(it);
      continue;
    }
    // Thiếu hàng → hoàn lại những gì đã trừ trong lần này
    for (const d of done) await repo.increment(d.pid, d.qty);
    throw ConflictError(`insufficient stock for product ${it.pid}`);
  }

  // unit_price chốt tại thời điểm đặt hàng (sau này đổi giá cũng không ảnh hưởng đơn cũ)
  const reserved = items.map((i) => ({ pid: i.pid, qty: i.qty, unit_price: byPid.get(i.pid).price }));
  await repo.saveReservation(reservationId, reserved);
  return { reservation_id: reservationId, items: reserved };
}

// Compensation: chỉ hoàn kho ĐÚNG 1 LẦN dù bị gọi nhiều lần
async function release(reservationId) {
  const r = await repo.markReleased(reservationId);
  if (!r) return { released: false };
  for (const it of r.items) await repo.increment(it.pid, it.qty);
  return { released: true };
}

module.exports = { list, getOne, create, update, remove, getMany, reserve, release };
