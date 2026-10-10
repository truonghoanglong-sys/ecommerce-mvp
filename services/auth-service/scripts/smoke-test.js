/**
 * Smoke test Bước 2 – chạy 5 test case TC-IAM-01..05 trong file 25_TestCases.
 * Cách chạy:  npm run smoke            (mặc định gọi http://localhost:3001)
 *             BASE_URL=http://localhost:8080 npm run smoke   (sau khi có Gateway)
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const username = `user_${Date.now()}`; // tên mới mỗi lần chạy → chạy lại nhiều lần vẫn PASS
const password = 'P@ss123';

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* body rỗng */ }
  return { status: res.status, body: json };
}

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

const cases = [
  ['TC-IAM-01', 'Đăng ký tài khoản hợp lệ', async () => {
    const r = await call('/api/auth/register', { username, password, email: `${username}@example.com` });
    return [r.status === 201 && Number.isInteger(r.body?.uid), r];
  }],
  ['TC-IAM-02', 'Đăng ký username đã tồn tại', async () => {
    const r = await call('/api/auth/register', { username, password });
    return [r.status === 409, r];
  }],
  ['TC-IAM-03', 'Đăng ký thiếu password', async () => {
    const r = await call('/api/auth/register', { username: `${username}_x`, password: '' });
    return [r.status === 400, r];
  }],
  ['TC-IAM-04', 'Đăng nhập đúng thông tin', async () => {
    const r = await call('/api/auth/login', { username, password });
    const ok = r.status === 200 && r.body?.tokenType === 'Bearer' && typeof r.body?.accessToken === 'string';
    if (ok) {
      const p = decodeJwt(r.body.accessToken);
      r.jwtPayload = p;
      return [Boolean(p.sub && p.role === 'CUSTOMER'), r];
    }
    return [false, r];
  }],
  ['TC-IAM-05', 'Đăng nhập sai password', async () => {
    const r = await call('/api/auth/login', { username, password: 'wrong-password' });
    return [r.status === 401, r];
  }],
];

(async () => {
  console.log(`Target: ${BASE}\n`);
  let passed = 0;
  for (const [id, name, fn] of cases) {
    try {
      const [ok, r] = await fn();
      if (ok) passed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}  → HTTP ${r.status}`);
      if (!ok || r.jwtPayload) console.log('      ', JSON.stringify(r.jwtPayload || r.body));
    } catch (err) {
      console.log(`FAIL  ${id}  ${name}  → ${err.cause?.code || err.message}`);
    }
  }
  console.log(`\nKết quả: ${passed}/${cases.length} PASS`);
  process.exit(passed === cases.length ? 0 : 1);
})();
