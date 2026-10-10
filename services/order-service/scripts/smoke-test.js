/**
 * Smoke test Bước 6 – TC-ORD-01..05 qua API Gateway (8080), như client thật.
 * Yêu cầu đang chạy: Docker, auth, customer, product, api-gateway, order-service.
 */
require('dotenv').config();
const { Pool } = require('pg');

const GW = process.env.GATEWAY_URL || 'http://localhost:8080';
const db = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://order:order_pw@localhost:5435/order_db' });

async function call(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${GW}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json, cache: res.headers.get('x-cache') };
}

async function newCustomer(tag) {
  const username = `${tag}_${Date.now()}`;
  const reg = await call('POST', '/api/auth/register', { body: { username, password: 'P@ss123', fullname: tag } });
  const login = await call('POST', '/api/auth/login', { body: { username, password: 'P@ss123' } });
  return { uid: reg.body?.uid, token: login.body?.accessToken };
}

(async () => {
  let admin, alice, bob, laptop, mouse, order1;
  const stock = async (pid) => (await call('GET', `/api/products/${pid}`, { token: alice.token })).body?.quantity;

  const cases = [
    ['SETUP    ', 'Tạo admin token, 2 khách, 2 sản phẩm', async () => {
      admin = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } })).body?.accessToken;
      alice = await newCustomer('alice');
      bob = await newCustomer('bob');
      laptop = (await call('POST', '/api/products', { token: admin, body: { pname: 'Laptop', price: 1500, quantity: 5 } })).body?.pid;
      mouse = (await call('POST', '/api/products', { token: admin, body: { pname: 'Mouse', price: 25.5, quantity: 10 } })).body?.pid;
      return [Boolean(admin && alice.token && bob.token && laptop && mouse), { status: 'setup', body: { laptop, mouse } }];
    }],
    ['TC-ORD-02', 'Tạo Order không có JWT → 401', async () => {
      const r = await call('POST', '/api/orders', { body: { items: [{ pid: laptop, qty: 1 }] } });
      return [r.status === 401, r];
    }],
    ['TC-ORD-03', 'Đặt vượt tồn kho → 409, kho không đổi', async () => {
      const r = await call('POST', '/api/orders', { token: alice.token, body: { items: [{ pid: laptop, qty: 99 }] } });
      return [r.status === 409 && (await stock(laptop)) === 5, r];
    }],
    ['EXTRA-01 ', 'Sản phẩm không tồn tại → 404', async () => {
      const r = await call('POST', '/api/orders', { token: alice.token, body: { items: [{ pid: 999999, qty: 1 }] } });
      return [r.status === 404, r];
    }],
    ['EXTRA-02 ', 'qty = 0 → 400', async () => {
      const r = await call('POST', '/api/orders', { token: alice.token, body: { items: [{ pid: laptop, qty: 0 }] } });
      return [r.status === 400, r];
    }],
    ['TC-ORD-01', 'Tạo Order hợp lệ (BRONZE 0%): 2×1500 + 2×25.5 = 3051', async () => {
      const r = await call('POST', '/api/orders', {
        token: alice.token, body: { items: [{ pid: laptop, qty: 2 }, { pid: mouse, qty: 2 }] },
      });
      order1 = r.body;
      const ok = r.status === 201 && r.body.items.length === 2 && r.body.subtotal === 3051
        && r.body.discount === 0 && r.body.total_amount === 3051 && r.body.status === 'CREATED';
      return [ok, r];
    }],
    ['EXTRA-03 ', 'Tồn kho đã trừ: Laptop 5→3, Mouse 10→8 (cache đã xoá)', async () => {
      const l = await stock(laptop); const m = await stock(mouse);
      return [l === 3 && m === 8, { status: `laptop=${l}, mouse=${m}`, body: null }];
    }],
    ['TC-ORD-04', 'Discount theo score: lên SILVER (150 điểm) → giảm 5%', async () => {
      await call('PUT', `/api/customers/${alice.uid}`, { token: admin, body: { score: 150 } });
      const r = await call('POST', '/api/orders', { token: alice.token, body: { items: [{ pid: laptop, qty: 1 }] } });
      return [r.status === 201 && r.body.discount_percent === 5 && r.body.discount === 75 && r.body.total_amount === 1425, r];
    }],
    ['TC-ORD-05', 'Order + OutboxEvent(OrderCreated, PENDING) lưu cùng transaction', async () => {
      const { rows } = await db.query(
        "SELECT event_type, status, payload FROM outbox_events WHERE aggregate_id = $1", [order1.oid]
      );
      const e = rows[0];
      const ok = rows.length === 1 && e.event_type === 'OrderCreated' && e.payload.data.oid === order1.oid
        && e.payload.data.items.length === 2;
      return [ok, { status: e ? `${e.event_type} / ${e.status}` : 'no row', body: rows }];
    }],
    ['EXTRA-04 ', 'Giá chốt lúc đặt: Admin đổi giá Laptop → đơn cũ vẫn 1500', async () => {
      await call('PUT', `/api/products/${laptop}`, { token: admin, body: { price: 9999 } });
      const r = await call('GET', `/api/orders/${order1.oid}`, { token: alice.token });
      return [r.status === 200 && r.body.items.find((i) => i.pid === laptop).unit_price === 1500, r];
    }],
    ['EXTRA-05 ', 'Xem danh sách đơn của mình (2 đơn)', async () => {
      const r = await call('GET', '/api/orders', { token: alice.token });
      return [r.status === 200 && r.body.items.length === 2 && r.body.items.every((o) => o.uid === alice.uid), r];
    }],
    ['EXTRA-06 ', 'Bob xem đơn của Alice → 403', async () => {
      const r = await call('GET', `/api/orders/${order1.oid}`, { token: bob.token });
      return [r.status === 403, r];
    }],
    ['EXTRA-07 ', 'Xem đơn không tồn tại → 404', async () => {
      const r = await call('GET', '/api/orders/999999', { token: alice.token });
      return [r.status === 404, r];
    }],
    ['EXTRA-08 ', 'Đặt món cuối cùng: 3 người cùng mua 1 Laptop còn 2 cái', async () => {
      await call('PUT', `/api/products/${laptop}`, { token: admin, body: { quantity: 2, price: 1500 } });
      const tries = await Promise.all([alice, bob, alice].map((c) =>
        call('POST', '/api/orders', { token: c.token, body: { items: [{ pid: laptop, qty: 1 }] } })));
      const codes = tries.map((t) => t.status).sort();
      const left = await stock(laptop);
      return [JSON.stringify(codes) === '[201,201,409]' && left === 0, { status: `${codes} → còn ${left}`, body: null }];
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
  await db.end();
  console.log(`\nKết quả: ${passed}/${cases.length} PASS`);
  process.exit(passed === cases.length ? 0 : 1);
})();
