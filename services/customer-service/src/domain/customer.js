const { ValidationError, ForbiddenError } = require('./errors');

const PHONE_RE = /^\+?[0-9]{9,15}$/;

function validateFullname(v) {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > 100) {
    throw ValidationError('fullname must be 1-100 characters');
  }
  return v.trim();
}

function validatePhone(v) {
  if (typeof v !== 'string' || !PHONE_RE.test(v)) {
    throw ValidationError('phone must be 9-15 digits');
  }
  return v;
}

function validateScore(v) {
  if (!Number.isInteger(v) || v < 0) throw ValidationError('score must be a non-negative integer');
  return v;
}

// Dữ liệu khi tạo hồ sơ (từ Auth Service lúc đăng ký): fullname, phone có thể bỏ trống.
function validateNewCustomer({ uid, fullname, phone }) {
  if (!Number.isInteger(uid) || uid <= 0) throw ValidationError('uid is invalid');
  return {
    uid,
    fullname: fullname ? validateFullname(fullname) : '',
    phone: phone ? validatePhone(phone) : null,
  };
}

/**
 * Quy tắc cập nhật (ADR-10):
 *  - Customer chỉ được sửa fullname, phone của CHÍNH MÌNH.
 *  - Chỉ ADMIN được sửa score (mid tự tính lại từ score, không ai được gán mid trực tiếp).
 */
function validateUpdate(body, actor) {
  const allowed = ['fullname', 'phone', 'score'];
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.includes('mid')) throw ValidationError('mid is derived from score and cannot be set directly');
  if (unknown.length) throw ValidationError(`unknown field(s): ${unknown.join(', ')}`);

  const changes = {};
  if (body.fullname !== undefined) changes.fullname = validateFullname(body.fullname);
  if (body.phone !== undefined) changes.phone = validatePhone(body.phone);
  if (body.score !== undefined) {
    if (actor.role !== 'ADMIN') throw ForbiddenError('only ADMIN can change score');
    changes.score = validateScore(body.score);
  }
  if (Object.keys(changes).length === 0) throw ValidationError('nothing to update');
  return changes;
}

// Chính chủ hoặc ADMIN mới được xem/sửa hồ sơ
function assertCanAccess(actor, uid) {
  if (actor.role !== 'ADMIN' && actor.uid !== uid) throw ForbiddenError();
}

module.exports = { validateNewCustomer, validateUpdate, assertCanAccess };
