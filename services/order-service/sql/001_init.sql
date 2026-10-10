-- Order Management Bounded Context (ADR-09, ADR-11)
CREATE TABLE IF NOT EXISTS orders (
  oid            SERIAL PRIMARY KEY,
  uid            INT NOT NULL,                 -- tham chiếu theo ID sang Customer context (không FK)
  subtotal       NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  discount       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_amount   NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  status         VARCHAR(20) NOT NULL DEFAULT 'CREATED',
  reservation_id UUID NOT NULL UNIQUE,         -- mã trừ kho bên Product, dùng để hoàn kho
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_uid ON orders(uid);

CREATE TABLE IF NOT EXISTS order_details (
  oid        INT NOT NULL REFERENCES orders(oid) ON DELETE CASCADE,
  pid        INT NOT NULL,                     -- tham chiếu theo ID sang Product context (không FK)
  qty        INT NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),  -- giá CHỐT lúc đặt hàng
  PRIMARY KEY (oid, pid)
);

-- Transactional Outbox: sự kiện được ghi CÙNG transaction với đơn hàng.
-- Bước 7, một tiến trình nền sẽ đọc các dòng PENDING và đẩy sang Kafka.
CREATE TABLE IF NOT EXISTS outbox_events (
  id           BIGSERIAL PRIMARY KEY,
  event_id     UUID NOT NULL UNIQUE,           -- consumer dùng để chống xử lý trùng
  aggregate_id INT NOT NULL,                   -- oid
  event_type   VARCHAR(50) NOT NULL,           -- 'OrderCreated'
  payload      JSONB NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING → PUBLISHED
  attempts     INT NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(id) WHERE status = 'PENDING';
