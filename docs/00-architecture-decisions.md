# Architecture Decisions (ADR) – E-commerce MVP

Các quyết định dưới đây giải quyết những điểm mâu thuẫn giữa ERD, sequence diagram, API spec và test case.

| # | Vấn đề trong tài liệu | Quyết định |
|---|---|---|
| ADR-01 | Client gọi REST, nhưng Gateway → service vẽ là gRPC | **Đúng sơ đồ:** Client → Gateway dùng REST/JSON. Gateway → 5 service dùng **gRPC** (Gateway chuyển REST → gRPC → JSON). Service ↔ service cũng dùng **gRPC** (Auth → Customer, Order → Customer, Order → Product). Danh tính người gọi gửi qua **gRPC metadata** (`x-user-id`, `x-user-role`). Cập nhật một phần dùng `update_mask` (giống FieldMask). |
| ADR-02 | Ai điều phối luồng đặt hàng (Gateway hay Order)? | **Order Service điều phối**. Gateway chỉ xác thực + chuyển tiếp. Gateway không chứa nghiệp vụ. |
| ADR-03 | `score` nằm ở MemberShip (mọi khách cùng hạng chung điểm) | `score` chuyển sang **Customer**. MemberShip giữ `min_score` và `discount_percent`. |
| ADR-04 | Không có quy tắc discount | Bronze 0–99: 0% · Silver 100–499: 5% · Gold ≥ 500: 10%. Discount lưu dạng **số tiền** DECIMAL(10,2). |
| ADR-05 | Register nhận email/phone/fullname nhưng User không có cột | User thêm `email` (unique). `phone`, `fullname` thuộc Customer. |
| ADR-06 | Không có bước tạo Customer khi đăng ký | Auth Service gọi gRPC `CreateCustomer` sang Customer Service sau khi tạo User. |
| ADR-07 | API-ORD-01 trả về shipment ngay (không thể vì async) | Response 201 chỉ trả order + `status: "CREATED"`. Shipment xem qua `GET /api/shipments/order/:oid`. |
| ADR-08 | Trừ kho trước khi lưu Order → lệch khi DB lỗi | Lưu Order thất bại → gọi gRPC `ReleaseStock` để **hoàn kho** (compensation). Trừ kho dùng phép cập nhật nguyên tử `quantity >= qty`. |
| ADR-09 | Thiếu bảng OutboxEvent; Order thiếu status/total | Thêm bảng `outbox_events`. Order thêm `subtotal`, `total_amount`, `status`, `created_at`. |
| ADR-10 | Customer tự sửa được `mid` (tự nâng hạng) | Customer chỉ sửa `fullname`, `phone`. `score`/`mid` chỉ Admin sửa. |
| ADR-11 | `Order` trùng từ khóa SQL | Tên bảng: `orders`, `order_details`. |
| ADR-12 | Shipment nhận event 2 lần | Unique index trên `oid` trong MongoDB → idempotent. |
| ADR-13 | Role chưa có dữ liệu | Seed: 1 = ADMIN, 2 = CUSTOMER, 3 = SHIPMENT_STAFF. |
| ADR-14 | protobuf ép kiểu ngầm ("abc" vào int32 thành 0) | Gateway kiểm tra **kiểu dữ liệu** JSON trước khi dựng message gRPC, sai kiểu → 400. Service vẫn kiểm tra **nghiệp vụ**. |

## Port quy ước (local)

| Thành phần | Port host |
|---|---|
| API Gateway (REST, cổng public duy nhất) | 8080 |
| auth / customer / product / order / shipment – **gRPC** | 50051 / 50052 / 50053 / 50054 / 50055 |
| auth / customer / product / order / shipment – HTTP (chỉ `/health`) | 3001 / 3002 / 3003 / 3004 / 3005 |
| auth-db / customer-db / order-db (PostgreSQL) | 5433 / 5434 / 5435 |
| product-db / shipment-db (MongoDB) | 27018 / 27019 |
| Redis | 6379 |
| Kafka (từ máy host) | 29092 |
