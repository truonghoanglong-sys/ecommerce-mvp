const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');

const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

// Hash giả, dùng khi username không tồn tại: vẫn chạy bcrypt.compare để thời gian phản hồi
// giống hệt trường hợp sai password → không đoán được username nào có thật (user enumeration).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', config.bcryptRounds);

// JWT chứa sub (uid) và role → API Gateway đọc 2 claim này để phân quyền (UC13).
function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.uid), role: user.rolename, username: user.username },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' }
  );
}

module.exports = { hashPassword, comparePassword, signAccessToken, DUMMY_HASH };
