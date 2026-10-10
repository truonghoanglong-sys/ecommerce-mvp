const { pool } = require('./db');

// Luôn JOIN memberships để trả kèm tên hạng + % giảm giá
const SELECT_CUSTOMER = `
  SELECT c.uid, c.fullname, c.phone, c.score, c.mid, m.mname,
         m.discount_percent::float AS discount_percent
    FROM customers c JOIN memberships m ON m.mid = c.mid`;

async function findByUid(uid) {
  const { rows } = await pool.query(`${SELECT_CUSTOMER} WHERE c.uid = $1`, [uid]);
  return rows[0] || null;
}

async function insert({ uid, fullname, phone, mid }) {
  try {
    await pool.query(
      'INSERT INTO customers (uid, fullname, phone, mid) VALUES ($1, $2, $3, $4)',
      [uid, fullname, phone, mid]
    );
  } catch (err) {
    if (err.code === '23505') err.isDuplicate = true;
    throw err;
  }
  return findByUid(uid);
}

async function update(uid, changes) {
  // Chỉ ghép các cột nằm trong danh sách cho phép → không bị SQL injection qua tên cột
  const cols = ['fullname', 'phone', 'score', 'mid'].filter((c) => changes[c] !== undefined);
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const { rowCount } = await pool.query(
    `UPDATE customers SET ${sets}, updated_at = NOW() WHERE uid = $1`,
    [uid, ...cols.map((c) => changes[c])]
  );
  return rowCount ? findByUid(uid) : null;
}

module.exports = { findByUid, insert, update };
