/**
 * Smoke test Bước 7 – luồng đầy đủ: Đặt hàng → Outbox → Kafka → Shipment → cập nhật trạng thái.
 * TC-ORD-05, TC-SHP-01..05. Mọi request HTTP đều đi qua API Gateway (8080).
 * Yêu cầu: Docker + cả 6 service đang chạy.
 */
require('dotenv').config();
const { Kafka, Partitioners, logLevel } = require('kafkajs');
const { MongoClient } = require('mongodb');

const GW = process.env.GATEWAY_URL || 'http://localhost:8080';
const mongo = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27019');
const kafka = new Kafka({ clientId: 'smoke-test', brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','), logLevel: logLevel.NOTHING });
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${GW}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}
const login = async (u, p) => (await call('POST', '/api/auth/login', { body: { username: u, password: p } })).body?.accessToken;

async function newCustomer(tag) {
  const username = `${tag}_${Date.now()}`;
  await call('POST', '/api/auth/register', { body: { username, password: 'P@ss123', fullname: tag } });
  return login(username, 'P@ss123');
}

// Đợi tối đa 15 giây cho tới khi shipment xuất hiện (vì xử lý BẤT ĐỒNG BỘ)
async function waitForShipment(oid, token) {
  for (let i = 0; i < 30; i++) {
    const r = await call('GET', `/api/shipments/order/${oid}`, { token });
    if (r.status === 200) return { ...r, waitedMs: i * 500 };
    await sleep(500);
  }
  return { status: 404, body: 'timeout after 15s' };
}

(async () => {
  let admin, staff, alice, bob, oid, shipid;
  const shipments = () => mongo.db('shipment_db').collection('shipments');

  const cases = [
    ['SETUP    ', 'Đăng nhập admin + shipper, tạo 2 khách, tạo sản phẩm, đặt 1 đơn', async () => {
      await mongo.connect();
      await producer.connect();
      admin = await login('admin', 'Admin@123');
      staff = await login('shipper', 'Shipper@123');
      alice = await newCustomer('alice');
      bob = await newCustomer('bob');
      const pid = (await call('POST', '/api/products', { token: admin, body: { pname: 'Phone', price: 800, quantity: 10 } })).body?.pid;
      const o = await call('POST', '/api/orders', { token: alice, body: { items: [{ pid, qty: 1 }] } });
      oid = o.body?.oid;
      return [Boolean(admin && staff && alice && bob && pid && o.status === 201), o];
    }],
    ['TC-SHP-01', 'Nhận OrderCreated qua Kafka → Shipment PENDING được tạo', async () => {
      const r = await waitForShipment(oid, alice);
      shipid = r.body?.shipid;
      return [r.status === 200 && r.body.oid === oid && r.body.status === 'PENDING',
        { status: r.status === 200 ? `HTTP 200 (sau ~${r.waitedMs}ms)` : r.status, body: r.body }];
    }],
    ['TC-ORD-05', 'Order được lưu VÀ đã phát OrderCreated vào Kafka', async () => {
      const r = await call('GET', `/api/orders/${oid}`, { token: alice });
      return [r.status === 200 && Number.isInteger(shipid), { status: `order ${oid} → shipment ${shipid}`, body: r.body }];
    }],
    ['EXTRA-01 ', 'Bob xem shipment của Alice → 403', async () => {
      const r = await call('GET', `/api/shipments/${shipid}`, { token: bob });
      return [r.status === 403, r];
    }],
    ['EXTRA-02 ', 'Khách tự cập nhật trạng thái → 403 (chặn tại Gateway)', async () => {
      const r = await call('PATCH', `/api/shipments/${shipid}/status`, { token: alice, body: { status: 'DELIVERED' } });
      return [r.status === 403, r];
    }],
    ['TC-SHP-03', 'Shipper cập nhật status = SHIPPING', async () => {
      const r = await call('PATCH', `/api/shipments/${shipid}/status`, { token: staff, body: { status: 'SHIPPING' } });
      return [r.status === 200 && r.body.status === 'SHIPPING' && r.body.history.length === 2, r];
    }],
    ['EXTRA-03 ', 'Status không hợp lệ "FLYING" → 400', async () => {
      const r = await call('PATCH', `/api/shipments/${shipid}/status`, { token: staff, body: { status: 'FLYING' } });
      return [r.status === 400, r];
    }],
    ['EXTRA-04 ', 'Chuyển ngược SHIPPING → PENDING → 409', async () => {
      const r = await call('PATCH', `/api/shipments/${shipid}/status`, { token: staff, body: { status: 'PENDING' } });
      return [r.status === 409, r];
    }],
    ['TC-SHP-04', 'Cập nhật Shipment không tồn tại → 404', async () => {
      const r = await call('PATCH', '/api/shipments/999999/status', { token: staff, body: { status: 'SHIPPING' } });
      return [r.status === 404, r];
    }],
    ['TC-SHP-05', 'Nhận CÙNG event 2 lần → không tạo Shipment trùng', async () => {
      const dup = { eventId: 'dup-test', type: 'OrderCreated', occurredAt: new Date().toISOString(), data: { oid, uid: 1, items: [] } };
      await producer.send({ topic: 'order-created', messages: [{ key: String(oid), value: JSON.stringify(dup) }] });
      await sleep(3000);
      const count = await shipments().countDocuments({ oid });
      return [count === 1, { status: `số shipment của đơn ${oid} = ${count}`, body: null }];
    }],
    ['TC-SHP-02', 'Event thiếu oid → không tạo Shipment, ghi nhận lỗi', async () => {
      const before = await shipments().countDocuments();
      const marker = `bad-${Date.now()}`;
      await producer.send({ topic: 'order-created', messages: [{ value: JSON.stringify({ eventId: marker, type: 'OrderCreated', data: { uid: 1 } }) }] });
      await sleep(3000);
      const after = await shipments().countDocuments();
      const logged = await mongo.db('shipment_db').collection('failed_events').countDocuments({ raw: { $regex: marker } });
      return [after === before && logged === 1, { status: `shipments ${before}→${after}, failed_events +${logged}`, body: null }];
    }],
    ['EXTRA-05 ', 'Giao xong: SHIPPING → DELIVERED, khách thấy trạng thái mới', async () => {
      await call('PATCH', `/api/shipments/${shipid}/status`, { token: staff, body: { status: 'DELIVERED' } });
      const r = await call('GET', `/api/shipments/order/${oid}`, { token: alice });
      return [r.status === 200 && r.body.status === 'DELIVERED', r];
    }],
    ['EXTRA-06 ', 'Health check toàn hệ thống: tất cả UP', async () => {
      const r = await call('GET', '/api/health');
      return [r.status === 200 && r.body.status === 'UP', r];
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
  await producer.disconnect().catch(() => {});
  await mongo.close().catch(() => {});
  console.log(`\nKết quả: ${passed}/${cases.length} PASS`);
  process.exit(passed === cases.length ? 0 : 1);
})();
