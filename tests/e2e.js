/**
 * KIỂM THỬ END-TO-END: 25 test case trong 25_TestCases_5_BoundedContexts.xlsx
 * Mọi request HTTP đi qua API Gateway (http://localhost:8080) giống client thật.
 * Riêng TC-SHP-02 / TC-SHP-05 cần gửi event "hỏng"/"trùng" trực tiếp vào Kafka và đếm trong MongoDB.
 *
 * Kết quả in ra màn hình + ghi file tests/e2e-report.md (nộp kèm bài).
 */
const fs = require('fs');
const path = require('path');
const { Kafka, Partitioners, logLevel } = require('kafkajs');
const { MongoClient } = require('mongodb');

const GW = process.env.GATEWAY_URL || 'http://localhost:8080';
const mongo = new MongoClient(process.env.SHIPMENT_MONGO_URL || 'mongodb://localhost:27019');
const kafka = new Kafka({ clientId: 'e2e', brokers: [process.env.KAFKA_BROKER || 'localhost:29092'], logLevel: logLevel.NOTHING });
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, p, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${GW}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}
const login = async (u, pw) => (await call('POST', '/api/auth/login', { body: { username: u, password: pw } })).body?.accessToken;
async function waitFor(fn, timeoutMs = 15000) {
  for (let t = 0; t < timeoutMs; t += 500) { const r = await fn(); if (r) return r; await sleep(500); }
  return null;
}

const ctx = { run: Date.now() };
const results = [];

const TESTS = [
  // ---------------- 1. Identity & Access ----------------
  ['TC-IAM-01', 'Identity & Access', 'Đăng ký tài khoản hợp lệ', async () => {
    ctx.user = `e2e_${ctx.run}`;
    const r = await call('POST', '/api/auth/register', { body: { username: ctx.user, password: 'P@ss123', fullname: 'E2E User', phone: '0900000001' } });
    ctx.uid = r.body?.uid;
    return [r.status === 201 && Number.isInteger(ctx.uid), `HTTP ${r.status}, uid=${ctx.uid}`];
  }],
  ['TC-IAM-02', 'Identity & Access', 'Đăng ký username đã tồn tại', async () => {
    const r = await call('POST', '/api/auth/register', { body: { username: ctx.user, password: 'P@ss123' } });
    return [r.status === 409, `HTTP ${r.status}`];
  }],
  ['TC-IAM-03', 'Identity & Access', 'Đăng ký thiếu password', async () => {
    const r = await call('POST', '/api/auth/register', { body: { username: `${ctx.user}_x`, password: '' } });
    return [r.status === 400, `HTTP ${r.status}`];
  }],
  ['TC-IAM-04', 'Identity & Access', 'Đăng nhập đúng thông tin', async () => {
    const r = await call('POST', '/api/auth/login', { body: { username: ctx.user, password: 'P@ss123' } });
    ctx.token = r.body?.accessToken;
    ctx.admin = await login('admin', 'Admin@123');
    ctx.staff = await login('shipper', 'Shipper@123');
    return [r.status === 200 && r.body.tokenType === 'Bearer' && !!ctx.token, `HTTP ${r.status}, JWT nhận được`];
  }],
  ['TC-IAM-05', 'Identity & Access', 'Đăng nhập sai password', async () => {
    const r = await call('POST', '/api/auth/login', { body: { username: ctx.user, password: 'wrong' } });
    return [r.status === 401, `HTTP ${r.status}`];
  }],

  // ---------------- 2. Customer & Membership ----------------
  ['TC-CUS-01', 'Customer & Membership', 'Lấy Customer tồn tại', async () => {
    const r = await call('GET', `/api/customers/${ctx.uid}`, { token: ctx.token });
    return [r.status === 200 && r.body.fullname === 'E2E User', `HTTP ${r.status}, fullname=${r.body?.fullname}`];
  }],
  ['TC-CUS-02', 'Customer & Membership', 'Lấy Customer không tồn tại', async () => {
    const r = await call('GET', '/api/customers/999999', { token: ctx.admin });
    return [r.status === 404, `HTTP ${r.status}`];
  }],
  ['TC-CUS-03', 'Customer & Membership', 'Cập nhật fullname', async () => {
    const r = await call('PUT', `/api/customers/${ctx.uid}`, { token: ctx.token, body: { fullname: 'E2E Updated' } });
    return [r.status === 200 && r.body.fullname === 'E2E Updated', `HTTP ${r.status}, fullname=${r.body?.fullname}`];
  }],
  ['TC-CUS-04', 'Customer & Membership', 'Lấy thông tin Membership', async () => {
    const r = await call('GET', `/api/customers/${ctx.uid}/membership`, { token: ctx.token });
    return [r.status === 200 && r.body.mname === 'BRONZE' && r.body.score === 0, `HTTP ${r.status}, ${r.body?.mname} / score ${r.body?.score}`];
  }],
  ['TC-CUS-05', 'Customer & Membership', 'Truy vấn Customer không có token', async () => {
    const r = await call('GET', `/api/customers/${ctx.uid}`);
    return [r.status === 401, `HTTP ${r.status}`];
  }],

  // ---------------- 3. Product Catalog ----------------
  ['TC-PRO-04', 'Product', 'Tạo Product', async () => {
    const r = await call('POST', '/api/products', { token: ctx.admin, body: { pname: `Laptop E2E ${ctx.run}`, price: 1500, quantity: 10 } });
    ctx.pid = r.body?.pid;
    return [r.status === 201 && Number.isInteger(ctx.pid), `HTTP ${r.status}, pid=${ctx.pid}`];
  }],
  ['TC-PRO-01', 'Product', 'Lấy danh sách Product', async () => {
    const r = await call('GET', '/api/products', { token: ctx.token });
    return [r.status === 200 && r.body.items.some((p) => p.pid === ctx.pid), `HTTP ${r.status}, ${r.body?.items?.length} sản phẩm`];
  }],
  ['TC-PRO-02', 'Product', 'Lấy Product tồn tại', async () => {
    const r = await call('GET', `/api/products/${ctx.pid}`, { token: ctx.token });
    return [r.status === 200 && r.body.price === 1500, `HTTP ${r.status}, price=${r.body?.price}`];
  }],
  ['TC-PRO-03', 'Product', 'Lấy Product không tồn tại', async () => {
    const r = await call('GET', '/api/products/999999', { token: ctx.token });
    return [r.status === 404, `HTTP ${r.status}`];
  }],
  ['TC-PRO-05', 'Product', 'Cập nhật tồn kho', async () => {
    await call('PUT', `/api/products/${ctx.pid}`, { token: ctx.admin, body: { quantity: 8 } });
    const r = await call('GET', `/api/products/${ctx.pid}`, { token: ctx.token });
    return [r.body?.quantity === 8, `quantity 10 → ${r.body?.quantity}`];
  }],

  // ---------------- 4. Order Management ----------------
  ['TC-ORD-01', 'Order', 'Tạo Order hợp lệ', async () => {
    const r = await call('POST', '/api/orders', { token: ctx.token, body: { items: [{ pid: ctx.pid, qty: 2 }] } });
    ctx.oid = r.body?.oid;
    return [r.status === 201 && r.body.items.length === 1 && r.body.total_amount === 3000, `HTTP ${r.status}, oid=${ctx.oid}, total=${r.body?.total_amount}`];
  }],
  ['TC-ORD-02', 'Order', 'Tạo Order không có JWT', async () => {
    const r = await call('POST', '/api/orders', { body: { items: [{ pid: ctx.pid, qty: 1 }] } });
    return [r.status === 401, `HTTP ${r.status}`];
  }],
  ['TC-ORD-03', 'Order', 'Đặt số lượng vượt tồn kho', async () => {
    const r = await call('POST', '/api/orders', { token: ctx.token, body: { items: [{ pid: ctx.pid, qty: 999 }] } });
    return [r.status === 409, `HTTP ${r.status}: ${r.body?.error?.message}`];
  }],
  ['TC-ORD-04', 'Order', 'Tính discount theo score', async () => {
    await call('PUT', `/api/customers/${ctx.uid}`, { token: ctx.admin, body: { score: 600 } }); // → GOLD 10%
    const r = await call('POST', '/api/orders', { token: ctx.token, body: { items: [{ pid: ctx.pid, qty: 1 }] } });
    return [r.status === 201 && r.body.discount_percent === 10 && r.body.discount === 150 && r.body.total_amount === 1350,
      `GOLD: 1500 − 10% = ${r.body?.total_amount}`];
  }],
  ['TC-ORD-05', 'Order', 'Tạo Order và phát sự kiện', async () => {
    const r = await waitFor(async () => {
      const s = await call('GET', `/api/shipments/order/${ctx.oid}`, { token: ctx.token });
      return s.status === 200 ? s : null;
    });
    ctx.shipid = r?.body?.shipid;
    return [Boolean(r), r ? `OrderCreated → Kafka → shipment ${ctx.shipid}` : 'không thấy shipment sau 15s'];
  }],

  // ---------------- 5. Shipment ----------------
  ['TC-SHP-01', 'Shipment', 'Nhận OrderCreated Event', async () => {
    const r = await call('GET', `/api/shipments/${ctx.shipid}`, { token: ctx.token });
    return [r.status === 200 && r.body.oid === ctx.oid && r.body.status === 'PENDING', `HTTP ${r.status}, status=${r.body?.status}`];
  }],
  ['TC-SHP-02', 'Shipment', 'Event thiếu oid', async () => {
    const col = mongo.db('shipment_db').collection('shipments');
    const before = await col.countDocuments();
    const marker = `e2e-bad-${ctx.run}`;
    await producer.send({ topic: 'order-created', messages: [{ value: JSON.stringify({ eventId: marker, type: 'OrderCreated', data: { uid: 1 } }) }] });
    const logged = await waitFor(async () =>
      (await mongo.db('shipment_db').collection('failed_events').countDocuments({ raw: { $regex: marker } })) || null);
    const after = await col.countDocuments();
    return [after === before && logged === 1, `shipments ${before}→${after}, ghi nhận lỗi: ${logged ? 'có' : 'không'}`];
  }],
  ['TC-SHP-03', 'Shipment', 'Cập nhật trạng thái Shipment', async () => {
    const r = await call('PATCH', `/api/shipments/${ctx.shipid}/status`, { token: ctx.staff, body: { status: 'SHIPPING' } });
    return [r.status === 200 && r.body.status === 'SHIPPING', `HTTP ${r.status}, status=${r.body?.status}`];
  }],
  ['TC-SHP-04', 'Shipment', 'Cập nhật Shipment không tồn tại', async () => {
    const r = await call('PATCH', '/api/shipments/999999/status', { token: ctx.staff, body: { status: 'SHIPPING' } });
    return [r.status === 404, `HTTP ${r.status}`];
  }],
  ['TC-SHP-05', 'Shipment', 'Nhận cùng Event hai lần', async () => {
    const dup = { eventId: `e2e-dup-${ctx.run}`, type: 'OrderCreated', data: { oid: ctx.oid, uid: ctx.uid, items: [] } };
    await producer.send({ topic: 'order-created', messages: [{ key: String(ctx.oid), value: JSON.stringify(dup) }] });
    await sleep(3000);
    const n = await mongo.db('shipment_db').collection('shipments').countDocuments({ oid: ctx.oid });
    return [n === 1, `số shipment của đơn ${ctx.oid} = ${n}`];
  }],
];

(async () => {
  console.log(`E2E qua ${GW}\n`);
  const health = await call('GET', '/api/health').catch(() => null);
  if (!health || health.status !== 200) {
    console.log('Hệ thống chưa sẵn sàng (/api/health ≠ 200):', JSON.stringify(health?.body));
    console.log('Đợi 30 giây rồi chạy lại: docker compose ps để xem service nào chưa healthy.');
    process.exit(1);
  }
  await mongo.connect();
  await producer.connect();

  for (const [id, context, name, fn] of TESTS) {
    let ok = false; let detail = '';
    try { [ok, detail] = await fn(); } catch (err) { detail = `lỗi: ${err.cause?.code || err.message}`; }
    results.push({ id, context, name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}  → ${detail}`);
  }
  await producer.disconnect();
  await mongo.close();

  const passed = results.filter((r) => r.ok).length;
  const order = ['TC-IAM', 'TC-CUS', 'TC-PRO', 'TC-ORD', 'TC-SHP'];
  const sorted = [...results].sort((a, b) => order.indexOf(a.id.slice(0, 6)) - order.indexOf(b.id.slice(0, 6)) || a.id.localeCompare(b.id));
  const md = [
    '# Báo cáo kiểm thử E2E – E-commerce MVP', '',
    `- Thời gian: ${new Date().toLocaleString('vi-VN')}`,
    `- Môi trường: Docker Compose, mọi request qua API Gateway ${GW}`,
    `- **Kết quả: ${passed}/${results.length} PASS**`, '',
    '| Test Case ID | Bounded Context | Test Case | Kết quả | Thực tế |',
    '|---|---|---|---|---|',
    ...sorted.map((r) => `| ${r.id} | ${r.context} | ${r.name} | ${r.ok ? '✅ PASS' : '❌ FAIL'} | ${r.detail.replace(/\|/g, '/')} |`),
  ].join('\n');
  fs.writeFileSync(path.join(__dirname, 'e2e-report.md'), md + '\n');
  console.log(`\nKết quả: ${passed}/${results.length} PASS  (báo cáo: tests/e2e-report.md)`);
  process.exit(passed === results.length ? 0 : 1);
})();
