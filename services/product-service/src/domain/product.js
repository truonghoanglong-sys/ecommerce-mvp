const { ValidationError } = require('./errors');

// Quy tắc nghiệp vụ của Product: tên 1-100 ký tự, giá >= 0 (2 số lẻ), tồn kho là số nguyên >= 0
function validName(v) {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > 100) throw ValidationError('pname must be 1-100 characters');
  return v.trim();
}
function validPrice(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw ValidationError('price must be a number >= 0');
  return Math.round(v * 100) / 100; // tương đương DECIMAL(10,2)
}
function validQuantity(v) {
  if (!Number.isInteger(v) || v < 0) throw ValidationError('quantity must be an integer >= 0');
  return v;
}

function validateNewProduct(body) {
  return { pname: validName(body.pname), price: validPrice(body.price), quantity: validQuantity(body.quantity) };
}

function validateProductUpdate(body) {
  const allowed = ['pname', 'price', 'quantity'];
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length) throw ValidationError(`unknown field(s): ${unknown.join(', ')}`);
  const changes = {};
  if (body.pname !== undefined) changes.pname = validName(body.pname);
  if (body.price !== undefined) changes.price = validPrice(body.price);
  if (body.quantity !== undefined) changes.quantity = validQuantity(body.quantity);
  if (!Object.keys(changes).length) throw ValidationError('nothing to update');
  return changes;
}

/**
 * Chuẩn hoá danh sách hàng cần trừ kho:
 *  - mỗi dòng phải có pid và qty nguyên dương
 *  - gộp các dòng trùng pid ( [{pid:1,qty:1},{pid:1,qty:2}] → [{pid:1,qty:3}] )
 */
function normalizeStockItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw ValidationError('items must be a non-empty array');
  const merged = new Map();
  for (const it of items) {
    if (!Number.isInteger(it.pid) || it.pid <= 0) throw ValidationError('pid must be a positive integer');
    if (!Number.isInteger(it.qty) || it.qty <= 0) throw ValidationError('qty must be a positive integer');
    merged.set(it.pid, (merged.get(it.pid) || 0) + it.qty);
  }
  return [...merged].map(([pid, qty]) => ({ pid, qty }));
}

module.exports = { validateNewProduct, validateProductUpdate, normalizeStockItems };
