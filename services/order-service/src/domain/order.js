const { ValidationError, NotFoundError, ConflictError } = require('./errors');

const MAX_LINES = 50;

/**
 * Chuẩn hoá giỏ hàng: [{pid, qty}], qty nguyên dương, gộp pid trùng.
 */
function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw ValidationError('items must be a non-empty array');
  if (items.length > MAX_LINES) throw ValidationError(`an order can have at most ${MAX_LINES} lines`);
  const merged = new Map();
  for (const it of items) {
    if (!it || !Number.isInteger(it.pid) || it.pid <= 0) throw ValidationError('each item needs a positive integer pid');
    if (!Number.isInteger(it.qty) || it.qty <= 0) throw ValidationError('each item needs a positive integer qty');
    merged.set(it.pid, (merged.get(it.pid) || 0) + it.qty);
  }
  return [...merged].map(([pid, qty]) => ({ pid, qty }));
}

/**
 * Bước 6 sequence diagram: kiểm tra sản phẩm tồn tại + đủ hàng TRƯỚC khi trừ kho
 * → báo lỗi sớm, rõ ràng (sản phẩm nào thiếu). Việc trừ kho thật vẫn được Product kiểm tra lại.
 */
function checkAvailability(items, products) {
  const byPid = new Map(products.map((p) => [p.pid, p]));
  const missing = items.filter((i) => !byPid.has(i.pid)).map((i) => i.pid);
  if (missing.length) throw NotFoundError(`product(s) not found: ${missing.join(', ')}`);
  const short = items.filter((i) => byPid.get(i.pid).quantity < i.qty);
  if (short.length) {
    const detail = short.map((i) => `pid ${i.pid} (requested ${i.qty}, available ${byPid.get(i.pid).quantity})`);
    throw ConflictError(`insufficient stock: ${detail.join('; ')}`);
  }
}

/**
 * UC07 – Tính tiền. Tính bằng XU (số nguyên) để tránh lỗi số thực: 0.1 + 0.2 ≠ 0.3 trong JavaScript.
 *   subtotal = Σ qty × unit_price
 *   discount = subtotal × discount_percent / 100   (làm tròn tới xu)
 *   total    = subtotal − discount
 */
function calculatePricing(reservedItems, discountPercent) {
  if (typeof discountPercent !== 'number' || discountPercent < 0 || discountPercent > 100) {
    throw new Error(`invalid discount percent: ${discountPercent}`);
  }
  const toCents = (n) => Math.round(n * 100);
  const items = reservedItems.map((i) => ({ pid: i.pid, qty: i.qty, unit_price: toCents(i.unit_price) / 100 }));
  const subtotalCents = reservedItems.reduce((sum, i) => sum + i.qty * toCents(i.unit_price), 0);
  const discountCents = Math.round((subtotalCents * discountPercent) / 100);
  return {
    items,
    subtotal: subtotalCents / 100,
    discount_percent: discountPercent,
    discount: discountCents / 100,
    total_amount: (subtotalCents - discountCents) / 100,
  };
}

// Chính chủ hoặc ADMIN mới xem được đơn
function canView(actor, order) {
  return actor.role === 'ADMIN' || order.uid === actor.uid;
}

module.exports = { normalizeItems, checkAvailability, calculatePricing, canView };
