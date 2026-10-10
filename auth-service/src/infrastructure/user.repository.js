const { pool } = require('./db');

// Repository: nơi DUY NHẤT biết bảng users nằm ở đâu và viết SQL ra sao.
const PG_UNIQUE_VIOLATION = '23505';

async function create({ username, email, passwordHash, roleId }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password, roleid)
       VALUES ($1, $2, $3, $4)
       RETURNING uid, username, email, roleid`,
      [username, email, passwordHash, roleId]
    );
    return rows[0];
  } catch (err) {
    if (err.code === PG_UNIQUE_VIOLATION) {
      err.isDuplicate = true;
      err.field = err.constraint && err.constraint.includes('email') ? 'email' : 'username';
    }
    throw err;
  }
}

async function findByUsername(username) {
  const { rows } = await pool.query(
    `SELECT u.uid, u.username, u.email, u.password, u.roleid, r.rolename
       FROM users u JOIN roles r ON r.roleid = u.roleid
      WHERE u.username = $1`,
    [username]
  );
  return rows[0] || null;
}

async function exists(username) {
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  return rowCount > 0;
}

module.exports = { create, findByUsername, exists };
