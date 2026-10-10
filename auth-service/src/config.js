require('dotenv').config();

// Gom toàn bộ cấu hình vào 1 chỗ. Thiếu biến bắt buộc thì dừng ngay khi khởi động.
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: Number(process.env.JWT_EXPIRES_IN || 3600),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  seed: {
    admin: { username: process.env.SEED_ADMIN_USERNAME, password: process.env.SEED_ADMIN_PASSWORD },
    staff: { username: process.env.SEED_STAFF_USERNAME, password: process.env.SEED_STAFF_PASSWORD },
  },
};
