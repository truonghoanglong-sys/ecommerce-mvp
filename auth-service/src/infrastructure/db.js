const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({ connectionString: config.databaseUrl });

// Chạy file SQL khởi tạo (idempotent: CREATE IF NOT EXISTS + ON CONFLICT).
async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '../../sql/001_init.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { pool, migrate };
