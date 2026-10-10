# E-commerce MVP – Microservices · DDD · Database-per-Service (Node.js)

## Kiến trúc (đúng sơ đồ kiến trúc được giao)

```
Client ──REST/JSON──► API Gateway :8080 ──gRPC──► Auth · Customer · Product · Order · Shipment
                       │  REST → gRPC, JWT, phân quyền, rate limit, cache, logging
                       └── Redis (cache + rate limit)

Auth  ──gRPC──► Customer            (tạo hồ sơ khi đăng ký)
Order ──gRPC──► Customer, Product   (lấy % giảm giá; kiểm tra, trừ, hoàn kho)
Order ──Outbox──► Kafka (order-created) ──► Shipment
```

| Bounded Context | Service | Database | gRPC | HTTP (chỉ /health) |
|---|---|---|---|---|
| Identity & Access | auth-service | PostgreSQL (auth-db) | 50051 | 3001 |
| Customer & Membership | customer-service | PostgreSQL (customer-db) | 50052 | 3002 |
| Product Catalog | product-service | MongoDB (product-db) | 50053 | 3003 |
| Order Management | order-service | PostgreSQL (order-db) | 50054 | 3004 |
| Shipment | shipment-service | MongoDB (shipment-db) | 50055 | 3005 |
| — | api-gateway | Redis | — | **8080 (REST, cổng public duy nhất)** |

- Hợp đồng gRPC nằm trong `shared/proto/*.proto`, gồm 5 service và 22 RPC.
- Các quyết định thiết kế nằm trong `docs/00-architecture-decisions.md`.

## Chạy toàn bộ hệ thống

Yêu cầu: Docker Desktop.

```bash
cp .env.example .env          # Windows: copy .env.example .env
docker compose up -d --build  # lần đầu mất vài phút để build image
docker compose ps             # đợi các service (healthy), kafka-init Exited (0)
```

Kiểm tra: `GET http://localhost:8080/api/health` → `{"status":"UP", ...}`

Tắt hệ thống: `docker compose down`. Thêm `-v` nếu muốn xoá luôn dữ liệu.

## Kiểm thử 25 test case

```bash
cd tests
npm install
npm test          # ghi kết quả vào tests/e2e-report.md
```

## Tài khoản có sẵn

| Username | Password | Role |
|---|---|---|
| admin | Admin@123 | ADMIN |
| shipper | Shipper@123 | SHIPMENT_STAFF |

## API: REST tại Gateway và RPC tương ứng

| Method | Endpoint | gRPC | Quyền |
|---|---|---|---|
| POST | /api/auth/register | AuthService.Register | public |
| POST | /api/auth/login | AuthService.Login | public |
| GET | /api/customers/:uid | CustomerService.GetCustomerProfile | chính chủ / ADMIN |
| PUT | /api/customers/:uid | CustomerService.UpdateCustomer | chính chủ (chỉ ADMIN sửa score) |
| GET | /api/customers/:uid/membership | CustomerService.GetMembership | chính chủ / ADMIN |
| GET | /api/memberships | CustomerService.ListMemberships | đã đăng nhập |
| GET | /api/products | ProductService.ListProducts | đã đăng nhập (cache Redis) |
| GET | /api/products/:pid | ProductService.GetProduct | đã đăng nhập (cache Redis) |
| POST | /api/products | ProductService.CreateProduct | ADMIN |
| PUT | /api/products/:pid | ProductService.UpdateProduct | ADMIN |
| DELETE | /api/products/:pid | ProductService.DeleteProduct | ADMIN |
| POST | /api/orders | OrderService.CreateOrder | đã đăng nhập |
| GET | /api/orders | OrderService.ListOrders | đơn của mình / ADMIN xem tất cả |
| GET | /api/orders/:oid | OrderService.GetOrder | chủ đơn / ADMIN |
| GET | /api/shipments/:shipid | ShipmentService.GetShipment | chủ đơn / SHIPMENT_STAFF / ADMIN |
| GET | /api/shipments/order/:oid | ShipmentService.GetShipmentByOrder | chủ đơn / SHIPMENT_STAFF / ADMIN |
| PATCH | /api/shipments/:shipid/status | ShipmentService.UpdateShipmentStatus | SHIPMENT_STAFF / ADMIN |
| GET | /api/health | (HTTP tới /health từng service) | public |

## Cấu trúc mỗi service (DDD)

```
src/
├── domain/          quy tắc nghiệp vụ thuần (không phụ thuộc framework hay DB)
├── application/     use case (điều phối các bước)
├── infrastructure/  DB, gRPC client, Kafka, bảo mật
└── interfaces/      grpc/ (server cho Gateway và service khác), messaging/ (Kafka consumer)
```
