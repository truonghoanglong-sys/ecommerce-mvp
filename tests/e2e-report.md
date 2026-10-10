# Báo cáo kiểm thử E2E – E-commerce MVP

- Thời gian: 21:57:27 10/10/2026
- Môi trường: Docker Compose, mọi request qua API Gateway http://localhost:8080
- **Kết quả: 25/25 PASS**

| Test Case ID | Bounded Context | Test Case | Kết quả | Thực tế |
|---|---|---|---|---|
| TC-IAM-01 | Identity & Access | Đăng ký tài khoản hợp lệ | ✅ PASS | HTTP 201, uid=19 |
| TC-IAM-02 | Identity & Access | Đăng ký username đã tồn tại | ✅ PASS | HTTP 409 |
| TC-IAM-03 | Identity & Access | Đăng ký thiếu password | ✅ PASS | HTTP 400 |
| TC-IAM-04 | Identity & Access | Đăng nhập đúng thông tin | ✅ PASS | HTTP 200, JWT nhận được |
| TC-IAM-05 | Identity & Access | Đăng nhập sai password | ✅ PASS | HTTP 401 |
| TC-CUS-01 | Customer & Membership | Lấy Customer tồn tại | ✅ PASS | HTTP 200, fullname=E2E User |
| TC-CUS-02 | Customer & Membership | Lấy Customer không tồn tại | ✅ PASS | HTTP 404 |
| TC-CUS-03 | Customer & Membership | Cập nhật fullname | ✅ PASS | HTTP 200, fullname=E2E Updated |
| TC-CUS-04 | Customer & Membership | Lấy thông tin Membership | ✅ PASS | HTTP 200, BRONZE / score 0 |
| TC-CUS-05 | Customer & Membership | Truy vấn Customer không có token | ✅ PASS | HTTP 401 |
| TC-PRO-01 | Product | Lấy danh sách Product | ✅ PASS | HTTP 200, 10 sản phẩm |
| TC-PRO-02 | Product | Lấy Product tồn tại | ✅ PASS | HTTP 200, price=1500 |
| TC-PRO-03 | Product | Lấy Product không tồn tại | ✅ PASS | HTTP 404 |
| TC-PRO-04 | Product | Tạo Product | ✅ PASS | HTTP 201, pid=11 |
| TC-PRO-05 | Product | Cập nhật tồn kho | ✅ PASS | quantity 10 → 8 |
| TC-ORD-01 | Order | Tạo Order hợp lệ | ✅ PASS | HTTP 201, oid=14, total=3000 |
| TC-ORD-02 | Order | Tạo Order không có JWT | ✅ PASS | HTTP 401 |
| TC-ORD-03 | Order | Đặt số lượng vượt tồn kho | ✅ PASS | HTTP 409: insufficient stock: pid 11 (requested 999, available 6) |
| TC-ORD-04 | Order | Tính discount theo score | ✅ PASS | GOLD: 1500 − 10% = 1350 |
| TC-ORD-05 | Order | Tạo Order và phát sự kiện | ✅ PASS | OrderCreated → Kafka → shipment 5020 |
| TC-SHP-01 | Shipment | Nhận OrderCreated Event | ✅ PASS | HTTP 200, status=PENDING |
| TC-SHP-02 | Shipment | Event thiếu oid | ✅ PASS | shipments 15→15, ghi nhận lỗi: có |
| TC-SHP-03 | Shipment | Cập nhật trạng thái Shipment | ✅ PASS | HTTP 200, status=SHIPPING |
| TC-SHP-04 | Shipment | Cập nhật Shipment không tồn tại | ✅ PASS | HTTP 404 |
| TC-SHP-05 | Shipment | Nhận cùng Event hai lần | ✅ PASS | số shipment của đơn 14 = 1 |
