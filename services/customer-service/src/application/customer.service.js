const { validateNewCustomer, validateUpdate, assertCanAccess } = require('../domain/customer');
const { resolveTier } = require('../domain/membership');
const { NotFoundError, ConflictError } = require('../domain/errors');
const customerRepo = require('../infrastructure/customer.repository');
const membershipRepo = require('../infrastructure/membership.repository');

// Khách mới bắt đầu với score 0 → hạng thấp nhất
async function createCustomer(input) {
  const data = validateNewCustomer(input);
  const tier = resolveTier(0, await membershipRepo.findAll());
  try {
    return await customerRepo.insert({ ...data, mid: tier.mid });
  } catch (err) {
    if (err.isDuplicate) throw ConflictError(`customer ${data.uid} already exists`);
    throw err;
  }
}

async function getById(uid) {
  const customer = await customerRepo.findByUid(uid);
  if (!customer) throw NotFoundError(`customer ${uid} not found`);
  return customer;
}

// UC03 – xem hồ sơ (chính chủ hoặc Admin)
async function getCustomer(actor, uid) {
  assertCanAccess(actor, uid);
  return getById(uid);
}

// UC03 – cập nhật hồ sơ
async function updateCustomer(actor, uid, body) {
  assertCanAccess(actor, uid);
  const changes = validateUpdate(body, actor);
  if (changes.score !== undefined) {
    // score đổi → tính lại hạng (đây là nghiệp vụ "quản lý hạng thành viên")
    changes.mid = resolveTier(changes.score, await membershipRepo.findAll()).mid;
  }
  const updated = await customerRepo.update(uid, changes);
  if (!updated) throw NotFoundError(`customer ${uid} not found`);
  return updated;
}

// TC-CUS-04 – xem hạng + điểm
async function getMembership(actor, uid) {
  const c = await getCustomer(actor, uid);
  return { uid: c.uid, mid: c.mid, mname: c.mname, score: c.score, discount_percent: c.discount_percent };
}

const listMemberships = () => membershipRepo.findAll();

module.exports = { createCustomer, getById, getCustomer, updateCustomer, getMembership, listMemberships };
