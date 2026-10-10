-- Identity & Access Bounded Context
CREATE TABLE IF NOT EXISTS roles (
  roleid   INT PRIMARY KEY,
  rolename VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  uid        SERIAL PRIMARY KEY,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  email      VARCHAR(100) UNIQUE,
  password   VARCHAR(255) NOT NULL,          -- chỉ lưu bcrypt hash, không bao giờ lưu mật khẩu gốc
  roleid     INT NOT NULL REFERENCES roles(roleid),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed vai trò (ADR-13). ON CONFLICT để chạy lại nhiều lần không lỗi.
INSERT INTO roles (roleid, rolename) VALUES
  (1, 'ADMIN'),
  (2, 'CUSTOMER'),
  (3, 'SHIPMENT_STAFF')
ON CONFLICT (roleid) DO NOTHING;
