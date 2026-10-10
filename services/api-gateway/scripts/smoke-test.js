/**
 * Smoke test API Gateway – mọi request đi qua Gateway (cổng 8080), Gateway gọi service bằng gRPC.
 * Yêu cầu: toàn bộ hệ thống đang chạy (docker compose up -d).
 * Chạy lại trong vòng 1 phút có thể bị 429 ở /api/auth (do chính bài test rate limit) → đợi 1 phút.
 */
const GW = process.env.GATEWAY_URL || 'http://localhost:8080';

async function call(method, path, { body, token, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${GW}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json, cache: res.headers.get('x-cache'), headers: res.headers };
}

(async () => {
  const username = `gw_${Date.now()}`;
  let token, adminToken, uid, pid;

  const cases = [
    ['GW-01', 'Health check: redis, auth, customer, product UP', async () => {
      const r = await call('GET', '/api/health');
      const c = r.body?.components || {};
      return [['redis', 'auth', 'customer', 'product'].every((k) => c[k] === 'UP'), r];
    }],
    ['GW-02', 'Đăng ký qua Gateway (public, không cần token)', async () => {
      const r = await call('POST', '/api/auth/register', { body: { username, password: 'P@ss123', fullname: 'Gateway User' } });
      uid = r.body?.uid;
      return [r.status === 201, r];
    }],
    ['GW-03', 'Đăng nhập qua Gateway → nhận JWT', async () => {
      const r = await call('POST', '/api/auth/login', { body: { username, password: 'P@ss123' } });
      token = r.body?.accessToken;
      const a = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } });
      adminToken = a.body?.accessToken;
      return [r.status === 200 && !!token && !!adminToken, r];
    }],
    ['GW-04', 'Không có token → 401 (chặn tại Gateway)', async () => {
      const r = await call('GET', '/api/products');
      return [r.status === 401, r];
    }],
    ['GW-05', 'Token giả → 401', async () => {
      const r = await call('GET', '/api/products', { token: 'abc.def.ghi' });
      return [r.status === 401, r];
    }],
    ['GW-06', 'Có token → Gateway gắn danh tính, xem hồ sơ của mình', async () => {
      const r = await call('GET', `/api/customers/${uid}`, { token });
      return [r.status === 200 && r.body.fullname === 'Gateway User', r];
    }],
    ['GW-07', 'Tự gửi header x-user-role: ADMIN → vẫn bị 403 (header giả bị xoá)', async () => {
      const r = await call('GET', '/api/customers/1', { token, headers: { 'x-user-role': 'ADMIN', 'x-user-id': '1' } });
      return [r.status === 403, r];
    }],
    ['GW-08', 'Customer tạo sản phẩm → 403 (chặn tại Gateway)', async () => {
      const r = await call('POST', '/api/products', { token, body: { pname: 'X', price: 1, quantity: 1 } });
      return [r.status === 403, r];
    }],
    ['GW-09', 'Admin tạo sản phẩm qua Gateway → 201', async () => {
      const r = await call('POST', '/api/products', { token: adminToken, body: { pname: 'Keyboard', price: 45, quantity: 7 } });
      pid = r.body?.pid;
      return [r.status === 201, r];
    }],
    ['GW-10', 'Cache: lần 1 MISS, lần 2 HIT (Redis)', async () => {
      const r1 = await call('GET', `/api/products/${pid}`, { token });
      const r2 = await call('GET', `/api/products/${pid}`, { token });
      return [r1.cache === 'MISS' && r2.cache === 'HIT' && r2.body.pname === 'Keyboard', { status: `${r1.cache} → ${r2.cache}`, body: r2.body }];
    }],
    ['GW-11', 'Admin sửa giá → cache bị xoá, thấy giá mới ngay', async () => {
      await call('PUT', `/api/products/${pid}`, { token: adminToken, body: { price: 50 } });
      const r = await call('GET', `/api/products/${pid}`, { token });
      return [r.cache === 'MISS' && r.body.price === 50, { status: r.cache, body: r.body }];
    }],
    ['GW-12', 'Route không tồn tại → 404', async () => {
      const r = await call('GET', '/api/khong-co', { token });
      return [r.status === 404, r];
    }],
    ['GW-13', 'Sai kiểu dữ liệu (price là chuỗi) → 400 ngay tại Gateway, không gọi gRPC', async () => {
      const r = await call('POST', '/api/products', { token: adminToken, body: { pname: 'X', price: '10', quantity: 1 } });
      return [r.status === 400, r];
    }],
    ['GW-14', 'Rate limit /api/auth: dò mật khẩu liên tục → 429', async () => {
      const statuses = [];
      for (let i = 0; i < 25; i++) {
        statuses.push((await call('POST', '/api/auth/login', { body: { username, password: 'wrong' } })).status);
      }
      const first429 = statuses.indexOf(429);
      return [first429 > 0, { status: `429 từ lần thứ ${first429 + 1}`, body: statuses }];
    }],
  ];

  let passed = 0;
  for (const [id, name, fn] of cases) {
    try {
      const [ok, r] = await fn();
      if (ok) passed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}  → ${typeof r.status === 'number' ? 'HTTP ' : ''}${r.status}`);
      if (!ok) console.log('      ', JSON.stringify(r.body));
    } catch (err) {
      console.log(`FAIL  ${id}  ${name}  → ${err.cause?.code || err.message}`);
    }
  }
  console.log(`\nKết quả: ${passed}/${cases.length} PASS`);
  process.exit(passed === cases.length ? 0 : 1);
})();
