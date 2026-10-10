// Value object: danh sách vai trò cố định của hệ thống (khớp bảng roles).
const Role = Object.freeze({
  ADMIN: { id: 1, name: 'ADMIN' },
  CUSTOMER: { id: 2, name: 'CUSTOMER' },
  SHIPMENT_STAFF: { id: 3, name: 'SHIPMENT_STAFF' },
});

module.exports = { Role };
