const { pool } = require('./db');

async function findAll() {
  const { rows } = await pool.query(
    'SELECT mid, mname, min_score, discount_percent::float AS discount_percent FROM memberships ORDER BY min_score'
  );
  return rows;
}

module.exports = { findAll };
