/**
 * Smoke test Bước 3 – TC-CUS-01..05 + kiểm tra phân quyền, hạng thành viên và gRPC.
 * Yêu cầu: auth-service (3001) và customer-service (3002, gRPC 50052) đang chạy.
 *
 * Lưu ý: chưa có API Gateway nên script tự gắn header x-user-id / x-user-role
 * (đúng những gì Gateway sẽ làm sau khi kiểm tra JWT ở Bước 5).
 */
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const AUTH = process.env.AUTH_URL || 'http://localhost:3001';
const CUS = process.env.CUSTOMER_URL || 'http://localhost:3002';
const GRPC = process.env.CUSTOMER_GRPC_URL || 'localhost:50052';

async function http(method, url, { body, user } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) { headers['x-user-id'] = String(user.uid); headers['x-user-role'] = user.role; }
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

function grpcGetCustomer(uid) {
  const def = protoLoader.loadSync(path.join(__dirname, '../../../shared/proto/customer.proto'), {
    keepCase: true, longs: Number, defaults: true,
  });
  const Client = grpc.loadPackageDefinition(def).customer.CustomerService;
  const client = new Client(GRPC, grpc.credentials.createInsecure());
  return new Promise((resolve) =>
    client.GetCustomer({ uid }, { deadline: Date.now() + 3000 }, (err, reply) => {
      client.close();
      resolve(err ? { error: err.code, details: err.details } : reply);
    })
  );
}

(async () => {
  const username = `cus_${Date.now()}`;
  const admin = { uid: 1, role: 'ADMIN' };
  let me;
  const cases = [
    ['SETUP    ', 'Đăng ký qua Auth → tự tạo hồ sơ Customer (gRPC)', async () => {
      const r = await http('POST', `${AUTH}/api/auth/register`, {
        body: { username, password: 'P@ss123', fullname: 'Nguyen Van A', phone: '0900000000' },
      });
      if (r.status === 201) me = { uid: r.body.uid, role: 'CUSTOMER' };
      return [r.status === 201, r];
    }],
    ['TC-CUS-01', 'Lấy Customer tồn tại', async () => {
      const r = await http('GET', `${CUS}/api/customers/${me.uid}`, { user: me });
      return [r.status === 200 && r.body.fullname === 'Nguyen Van A' && r.body.mname === 'BRONZE', r];
    }],
    ['TC-CUS-02', 'Lấy Customer không tồn tại', async () => {
      const r = await http('GET', `${CUS}/api/customers/999999`, { user: admin });
      return [r.status === 404, r];
    }],
    ['TC-CUS-03', 'Cập nhật fullname', async () => {
      const r = await http('PUT', `${CUS}/api/customers/${me.uid}`, { user: me, body: { fullname: 'Nguyen Van B' } });
      return [r.status === 200 && r.body.fullname === 'Nguyen Van B', r];
    }],
    ['TC-CUS-04', 'Lấy thông tin Membership', async () => {
      const r = await http('GET', `${CUS}/api/customers/${me.uid}/membership`, { user: me });
      return [r.status === 200 && r.body.mname === 'BRONZE' && r.body.score === 0, r];
    }],
    ['TC-CUS-05', 'Truy vấn Customer không có token', async () => {
      const r = await http('GET', `${CUS}/api/customers/${me.uid}`);
      return [r.status === 401, r];
    }],
    ['EXTRA-01 ', 'Customer xem hồ sơ người khác → 403', async () => {
      const r = await http('GET', `${CUS}/api/customers/1`, { user: me });
      return [r.status === 403, r];
    }],
    ['EXTRA-02 ', 'Customer tự tăng score → 403 (ADR-10)', async () => {
      const r = await http('PUT', `${CUS}/api/customers/${me.uid}`, { user: me, body: { score: 9999 } });
      return [r.status === 403, r];
    }],
    ['EXTRA-03 ', 'Admin đặt score=150 → tự lên SILVER', async () => {
      const r = await http('PUT', `${CUS}/api/customers/${me.uid}`, { user: admin, body: { score: 150 } });
      return [r.status === 200 && r.body.mname === 'SILVER' && r.body.mid === 2, r];
    }],
    ['EXTRA-04 ', 'gRPC GetCustomer trả discount 5% (Order sẽ dùng)', async () => {
      const r = await grpcGetCustomer(me.uid);
      return [r.uid === me.uid && r.discount_percent === 5, { status: r.error ? 'gRPC ' + r.error : 'gRPC OK', body: r }];
    }],
  ];

  let passed = 0;
  for (const [id, name, fn] of cases) {
    try {
      const [ok, r] = await fn();
      if (ok) passed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}  → ${typeof r.status === 'number' ? 'HTTP ' : ''}${r.status}`);
      if (!ok) console.log('      ', JSON.stringify(r.body));
      if (!ok && id.startsWith('SETUP')) break;
    } catch (err) {
      console.log(`FAIL  ${id}  ${name}  → ${err.cause?.code || err.message}`);
      if (id.startsWith('SETUP')) break;
    }
  }
  console.log(`\nKết quả: ${passed}/${cases.length} PASS`);
  process.exit(passed === cases.length ? 0 : 1);
})();
