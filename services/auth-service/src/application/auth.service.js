const { validateRegistration, validateLogin } = require('../domain/user');
const { ConflictError, UnauthorizedError, ValidationError, ServiceUnavailableError } = require('../domain/errors');
const { Role } = require('../domain/role');
const userRepo = require('../infrastructure/user.repository');
const security = require('../infrastructure/security');
const customerClient = require('../infrastructure/customer.client');
const config = require('../config');

// UC01 – Register
async function register(input) {
  const data = validateRegistration(input);
  const passwordHash = await security.hashPassword(data.password);

  // 1. Tạo User trong Auth DB
  let user;
  try {
    // Luôn gán CUSTOMER: không bao giờ nhận role từ request body (tránh tự cấp quyền Admin).
    user = await userRepo.create({ ...data, passwordHash, roleId: Role.CUSTOMER.id });
  } catch (err) {
    if (err.isDuplicate) throw ConflictError(`${err.field} already exists`);
    throw err;
  }

  // 2. Gọi gRPC sang Customer Service để tạo hồ sơ khách hàng (ADR-06)
  try {
    await customerClient.createCustomer({ uid: user.uid, fullname: input.fullname, phone: input.phone });
  } catch (err) {
    // 3. Compensation: hồ sơ không tạo được → xoá User vừa tạo, để không có "tài khoản mồ côi"
    await userRepo.deleteById(user.uid);
    if (err.code === customerClient.status.INVALID_ARGUMENT) throw ValidationError(err.details);
    console.error('[register] customer-service error:', err.code, err.details || err.message);
    throw ServiceUnavailableError('customer service is unavailable, please try again later');
  }

  return { message: 'User registered successfully', uid: user.uid };
}

// UC02 – Login
async function login(input) {
  const { username, password } = validateLogin(input);
  const user = await userRepo.findByUsername(username);
  const ok = await security.comparePassword(password, user ? user.password : security.DUMMY_HASH);
  if (!user || !ok) throw UnauthorizedError();
  return {
    accessToken: security.signAccessToken(user),
    tokenType: 'Bearer',
    expiresIn: config.jwtExpiresIn,
  };
}

// Tạo sẵn tài khoản Admin / Shipment Staff để test (chỉ tạo nếu chưa có).
async function seedPrivilegedUsers() {
  const seeds = [
    { ...config.seed.admin, role: Role.ADMIN },
    { ...config.seed.staff, role: Role.SHIPMENT_STAFF },
  ];
  for (const s of seeds) {
    if (!s.username || !s.password || (await userRepo.exists(s.username))) continue;
    await userRepo.create({
      username: s.username,
      email: null,
      passwordHash: await security.hashPassword(s.password),
      roleId: s.role.id,
    });
    console.log(`[seed] created ${s.role.name} account: ${s.username}`);
  }
}

module.exports = { register, login, seedPrivilegedUsers };
