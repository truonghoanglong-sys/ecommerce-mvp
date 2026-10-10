const crypto = require('crypto');
const { pool } = require('./db');

// PostgreSQL trả NUMERIC dưới dạng chuỗi ("1500.00") → đổi về number cho API
const num = (v) => (v === null || v === undefined ? v : Number(v));
const toOrder = (r) => ({
  oid: r.oid, uid: r.uid, subtotal: num(r.subtotal), discount_percent: num(r.discount_percent),
  discount: num(r.discount), total_amount: num(r.total_amount), status: r.status, created_at: r.created_at,
});

/**
 * UC09 – Lưu Order + OrderDetail + OutboxEvent trong CÙNG 1 TRANSACTION.
 * Hoặc cả 3 cùng được lưu, hoặc không có gì → không bao giờ có đơn mà "quên" báo cho Shipment.
 */
async function createWithOutbox({ uid, reservationId, pricing }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [o] } = await client.query(
      `INSERT INTO orders (uid, subtotal, discount, discount_percent, total_amount, reservation_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uid, pricing.subtotal, pricing.discount, pricing.discount_percent, pricing.total_amount, reservationId]
    );

    // Chèn nhiều dòng 1 lần: VALUES ($1,$2,$3,$4), ($1,$5,$6,$7), ...
    const params = [o.oid];
    const values = pricing.items.map((it) => {
      params.push(it.pid, it.qty, it.unit_price);
      const n = params.length;
      return `($1, $${n - 2}, $${n - 1}, $${n})`;
    });
    await client.query(`INSERT INTO order_details (oid, pid, qty, unit_price) VALUES ${values.join(', ')}`, params);

    const order = { ...toOrder(o), items: pricing.items };
    const eventId = crypto.randomUUID();
    const payload = {
      eventId,
      type: 'OrderCreated',
      occurredAt: new Date().toISOString(),
      data: { oid: order.oid, uid, items: pricing.items, subtotal: order.subtotal, discount: order.discount, total_amount: order.total_amount },
    };
    await client.query(
      `INSERT INTO outbox_events (event_id, aggregate_id, event_type, payload) VALUES ($1, $2, 'OrderCreated', $3)`,
      [eventId, order.oid, payload]
    );

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function findById(oid) {
  const { rows: [o] } = await pool.query('SELECT * FROM orders WHERE oid = $1', [oid]);
  if (!o) return null;
  const { rows } = await pool.query(
    'SELECT pid, qty, unit_price FROM order_details WHERE oid = $1 ORDER BY pid', [oid]
  );
  return { ...toOrder(o), items: rows.map((r) => ({ pid: r.pid, qty: r.qty, unit_price: num(r.unit_price) })) };
}

async function findMany({ uid } = {}) {
  const { rows } = uid
    ? await pool.query('SELECT * FROM orders WHERE uid = $1 ORDER BY oid DESC LIMIT 100', [uid])
    : await pool.query('SELECT * FROM orders ORDER BY oid DESC LIMIT 100');
  return rows.map(toOrder);
}

module.exports = { createWithOutbox, findById, findMany };
