const { validateRegistration, validateLogin } = require('../domain/user');
const { ConflictError, UnauthorizedError } = require('../domain/errors');
const { Role } = require('../domain/role');
const userRepo = require('../infrastructure/user.repository');
const security = require('../infrastructure/security');
const config = require('../config');

// UC01 – Register
async function register(input) {
  const data = validateRegistration(input);
  const passwordHash = await security.hashPassword(data.password);
  try {
    // Luôn gán CUSTOMER: không bao giờ nhận role từ request body (tránh tự cấp quyền Admin).
    const user = await userRepo.create({ ...data, passwordHash, roleId: Role.CUSTOMER.id });
    return { message: 'User registered successfully', uid: user.uid };
  } catch (err) {
    if (err.isDuplicate) throw ConflictError(`${err.field} already exists`);
    throw err;
  }
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
