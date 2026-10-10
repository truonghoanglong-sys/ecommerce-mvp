const { ValidationError } = require('./errors');

// Quy tắc nghiệp vụ của User nằm ở domain, KHÔNG phụ thuộc Express hay PostgreSQL.
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration({ username, password, email }) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw ValidationError('username must be 3-50 characters (letters, digits, _ or .)');
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    // bcrypt chỉ dùng 72 byte đầu → giới hạn để tránh hiểu nhầm
    throw ValidationError('password must be 6-72 characters');
  }
  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || email.length > 100 || !EMAIL_RE.test(email)) {
      throw ValidationError('email is invalid');
    }
  }
  return {
    username: username.trim(),
    password,
    email: email ? email.trim().toLowerCase() : null,
  };
}

function validateLogin({ username, password }) {
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    throw ValidationError('username and password are required');
  }
  return { username: username.trim(), password };
}

module.exports = { validateRegistration, validateLogin };
