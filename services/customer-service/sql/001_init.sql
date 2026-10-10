-- Customer & Membership Bounded Context
-- Hạng thành viên: ngưỡng điểm tối thiểu + % giảm giá (ADR-03, ADR-04)
CREATE TABLE IF NOT EXISTS memberships (
  mid              INT PRIMARY KEY,
  mname            VARCHAR(50)  NOT NULL UNIQUE,
  min_score        INT          NOT NULL UNIQUE CHECK (min_score >= 0),
  discount_percent NUMERIC(5,2) NOT NULL CHECK (discount_percent BETWEEN 0 AND 100)
);

-- uid KHÔNG có FOREIGN KEY sang bảng users: users nằm ở DB khác (Database-per-Service).
-- uid chỉ là "tham chiếu theo ID" sang Identity & Access Context.
CREATE TABLE IF NOT EXISTS customers (
  uid        INT PRIMARY KEY,
  fullname   VARCHAR(100) NOT NULL DEFAULT '',
  phone      VARCHAR(20),
  score      INT NOT NULL DEFAULT 0 CHECK (score >= 0),
  mid        INT NOT NULL REFERENCES memberships(mid),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO memberships (mid, mname, min_score, discount_percent) VALUES
  (1, 'BRONZE',   0,  0),
  (2, 'SILVER', 100,  5),
  (3, 'GOLD',   500, 10)
ON CONFLICT (mid) DO NOTHING;
