/**
 * Smoke test Bước 4 – TC-PRO-01..05 + phân quyền + gRPC trừ kho / hoàn kho.
 * Yêu cầu: product-service đang chạy (HTTP 3003, gRPC 50053).
 */
const path = require('path');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const BASE = process.env.PRODUCT_URL || 'http://localhost:3003';
const GRPC = process.env.PRODUCT_GRPC_URL || 'localhost:50053';
const admin = { uid: 1, role: 'ADMIN' };
const customer = { uid: 99, role: 'CUSTOMER' };

async function http(method, p, { body, user } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) { headers['x-user-id'] = String(user.uid); headers['x-user-role'] = user.role; }
  const res = await fetch(`${BASE}/api/products${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

const def = protoLoader.loadSync(path.join(__dirname, '../../../shared/proto/product.proto'), {
  keepCase: true, longs: Number, defaults: true,
});
const client = new (grpc.loadPackageDefinition(def).product.ProductService)(GRPC, grpc.credentials.createInsecure());
const rpc = (method, req) => new Promise((resolve) =>
  client[method](req, { deadline: Date.now() + 3000 }, (err, reply) =>
    resolve(err ? { status: `gRPC ${grpc.status[err.code]}`, body: err.details, code: err.code } : { status: 'gRPC OK', body: reply }))
);
const qtyOf = async (pid) => (await http('GET', `/${pid}`, { user: customer })).body.quantity;

(async () => {
  let laptop, mouse;
  const resId = crypto.randomUUID();
  const cases = [
    ['TC-PRO-04', 'Admin tạo Product', async () => {
      const r = await http('POST', '', { user: admin, body: { pname: 'Laptop', price: 1500, quantity: 10 } });
      laptop = r.body?.pid;
      const r2 = await http('POST', '', { user: admin, body: { pname: 'Mouse', price: 25, quantity: 5 } });
      mouse = r2.body?.pid;
      return [r.status === 201 && Number.isInteger(laptop) && r2.status === 201, r];
    }],
    ['EXTRA-01 ', 'Customer tạo Product → 403', async () => {
      const r = await http('POST', '', { user: customer, body: { pname: 'Hack', price: 1, quantity: 1 } });
      return [r.status === 403, r];
    }],
    ['EXTRA-02 ', 'Giá âm → 400', async () => {
      const r = await http('POST', '', { user: admin, body: { pname: 'Bad', price: -5, quantity: 1 } });
      return [r.status === 400, r];
    }],
    ['TC-PRO-01', 'Lấy danh sách Product', async () => {
      const r = await http('GET', '', { user: customer });
      return [r.status === 200 && r.body.items.some((p) => p.pid === laptop), r];
    }],
    ['TC-PRO-02', 'Lấy Product tồn tại', async () => {
      const r = await http('GET', `/${laptop}`, { user: customer });
      return [r.status === 200 && r.body.pname === 'Laptop' && r.body.price === 1500, r];
    }],
    ['TC-PRO-03', 'Lấy Product không tồn tại', async () => {
      const r = await http('GET', '/999999', { user: customer });
      return [r.status === 404, r];
    }],
    ['TC-PRO-05', 'Cập nhật tồn kho', async () => {
      const r = await http('PUT', `/${laptop}`, { user: admin, body: { quantity: 20 } });
      return [r.status === 200 && (await qtyOf(laptop)) === 20, r];
    }],
    ['EXTRA-03 ', 'gRPC GetProducts trả giá + tồn kho', async () => {
      const r = await rpc('GetProducts', { pids: [laptop, mouse] });
      return [r.body?.items?.length === 2, r];
    }],
    ['EXTRA-04 ', 'gRPC ReserveStock: Laptop x2 + Mouse x1', async () => {
      const r = await rpc('ReserveStock', { reservation_id: resId, items: [{ pid: laptop, qty: 2 }, { pid: mouse, qty: 1 }] });
      const ok = r.status === 'gRPC OK' && (await qtyOf(laptop)) === 18 && (await qtyOf(mouse)) === 4
        && r.body.items.find((i) => i.pid === laptop).unit_price === 1500;
      return [ok, r];
    }],
    ['EXTRA-05 ', 'Gọi lại cùng reservation_id → KHÔNG trừ lần 2', async () => {
      const r = await rpc('ReserveStock', { reservation_id: resId, items: [{ pid: laptop, qty: 2 }, { pid: mouse, qty: 1 }] });
      return [r.status === 'gRPC OK' && (await qtyOf(laptop)) === 18, r];
    }],
    ['EXTRA-06 ', 'Đặt vượt tồn kho → lỗi, KHÔNG trừ dở dang', async () => {
      const r = await rpc('ReserveStock', { reservation_id: crypto.randomUUID(), items: [{ pid: laptop, qty: 1 }, { pid: mouse, qty: 999 }] });
      const ok = r.code === grpc.status.FAILED_PRECONDITION && (await qtyOf(laptop)) === 18 && (await qtyOf(mouse)) === 4;
      return [ok, r];
    }],
    ['EXTRA-07 ', 'ReleaseStock → hoàn kho', async () => {
      const r = await rpc('ReleaseStock', { reservation_id: resId });
      return [r.body?.released === true && (await qtyOf(laptop)) === 20 && (await qtyOf(mouse)) === 5, r];
    }],
    ['EXTRA-08 ', 'ReleaseStock lần 2 → KHÔNG hoàn 2 lần', async () => {
      const r = await rpc('ReleaseStock', { reservation_id: resId });
      return [r.body?.released === false && (await qtyOf(laptop)) === 20, r];
    }],
    ['EXTRA-09 ', 'Admin xoá Product', async () => {
      const r = await http('DELETE', `/${mouse}`, { user: admin });
      const r2 = await http('GET', `/${mouse}`, { user: customer });
      return [r.status === 200 && r2.status === 404, r];
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
  client.close();
  console.log(`\nKết quả: ${passed}/${cases.length} PASS`);
  process.exit(passed === cases.length ? 0 : 1);
})();
