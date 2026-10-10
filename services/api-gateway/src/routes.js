const { mapBody, intParam } = require('./request-mapper');

/**
 * BẢNG ĐỊNH TUYẾN REST → gRPC. Mỗi dòng = 1 API trong API Specification.
 *   method, path : endpoint REST client gọi
 *   service, rpc : gọi hàm gRPC nào của service nào
 *   toRequest    : dựng message gRPC từ req (params + body)
 *   toResponse   : (tuỳ chọn) đổi reply gRPC → JSON đúng format API spec
 *   status       : HTTP status khi thành công (mặc định 200)
 *   public       : không cần JWT
 *   roles        : chỉ các role này được gọi (Gateway chặn trước, service kiểm tra lại)
 *   cache        : cache reply trong Redis;  invalidates: thao tác ghi thành công → xoá cache
 *   rateLimit    : 'auth' = giới hạn chặt hơn
 */
const REGISTER = {
  username: { type: 'string' }, password: { type: 'string' },
  email: { type: 'string' }, fullname: { type: 'string' }, phone: { type: 'string' },
};
const PRODUCT = { pname: { type: 'string', required: true }, price: { type: 'number', required: true }, quantity: { type: 'int', required: true } };

module.exports = [
  // ---------- Identity & Access ----------
  {
    method: 'POST', path: '/api/auth/register', service: 'auth', rpc: 'Register', status: 201,
    public: true, rateLimit: 'auth',
    toRequest: (req) => mapBody(req.body, REGISTER),
  },
  {
    method: 'POST', path: '/api/auth/login', service: 'auth', rpc: 'Login',
    public: true, rateLimit: 'auth',
    toRequest: (req) => mapBody(req.body, { username: { type: 'string' }, password: { type: 'string' } }),
    toResponse: (r) => ({ accessToken: r.access_token, tokenType: r.token_type, expiresIn: r.expires_in }),
  },

  // ---------- Customer & Membership ----------
  {
    method: 'GET', path: '/api/customers/:uid', service: 'customer', rpc: 'GetCustomerProfile',
    toRequest: (req) => ({ uid: intParam(req.params, 'uid') }),
  },
  {
    method: 'PUT', path: '/api/customers/:uid', service: 'customer', rpc: 'UpdateCustomer',
    toRequest: (req) => ({
      uid: intParam(req.params, 'uid'),
      ...mapBody(req.body, { fullname: { type: 'string' }, phone: { type: 'string' }, score: { type: 'int' } }, 'patch'),
    }),
    toResponse: (r) => ({ message: r.message, ...r.customer }),
  },
  {
    method: 'GET', path: '/api/customers/:uid/membership', service: 'customer', rpc: 'GetMembership',
    toRequest: (req) => ({ uid: intParam(req.params, 'uid') }),
  },
  { method: 'GET', path: '/api/memberships', service: 'customer', rpc: 'ListMemberships', toRequest: () => ({}) },

  // ---------- Product Catalog ----------
  {
    method: 'GET', path: '/api/products', service: 'product', rpc: 'ListProducts',
    toRequest: () => ({}), cache: 'products',
  },
  {
    method: 'GET', path: '/api/products/:pid', service: 'product', rpc: 'GetProduct',
    toRequest: (req) => ({ pid: intParam(req.params, 'pid') }), cache: 'products',
  },
  {
    method: 'POST', path: '/api/products', service: 'product', rpc: 'CreateProduct', status: 201,
    roles: ['ADMIN'], invalidates: 'products',
    toRequest: (req) => mapBody(req.body, PRODUCT),
  },
  {
    method: 'PUT', path: '/api/products/:pid', service: 'product', rpc: 'UpdateProduct',
    roles: ['ADMIN'], invalidates: 'products',
    toRequest: (req) => ({ pid: intParam(req.params, 'pid'), ...mapBody(req.body, PRODUCT, 'patch') }),
    toResponse: (r) => ({ message: r.message, ...r.product }),
  },
  {
    method: 'DELETE', path: '/api/products/:pid', service: 'product', rpc: 'DeleteProduct',
    roles: ['ADMIN'], invalidates: 'products',
    toRequest: (req) => ({ pid: intParam(req.params, 'pid') }),
  },

  // ---------- Order Management ----------
  {
    method: 'POST', path: '/api/orders', service: 'order', rpc: 'CreateOrder', status: 201,
    invalidates: 'products',   // đặt hàng làm đổi tồn kho → xoá cache sản phẩm
    toRequest: (req) => mapBody(req.body, { items: { type: 'items', required: true } }),
  },
  {
    method: 'GET', path: '/api/orders', service: 'order', rpc: 'ListOrders',
    toRequest: () => ({}),
    toResponse: (r) => ({ items: r.items.map(({ items, membership, ...o }) => o) }),
  },
  {
    method: 'GET', path: '/api/orders/:oid', service: 'order', rpc: 'GetOrder',
    toRequest: (req) => ({ oid: intParam(req.params, 'oid') }),
    toResponse: ({ membership, ...o }) => o,
  },

  // ---------- Shipment ----------
  {
    method: 'GET', path: '/api/shipments/order/:oid', service: 'shipment', rpc: 'GetShipmentByOrder',
    toRequest: (req) => ({ oid: intParam(req.params, 'oid') }),
  },
  {
    method: 'GET', path: '/api/shipments/:shipid', service: 'shipment', rpc: 'GetShipment',
    toRequest: (req) => ({ shipid: intParam(req.params, 'shipid') }),
  },
  {
    method: 'PATCH', path: '/api/shipments/:shipid/status', service: 'shipment', rpc: 'UpdateShipmentStatus',
    roles: ['SHIPMENT_STAFF', 'ADMIN'],
    toRequest: (req) => ({ shipid: intParam(req.params, 'shipid'), ...mapBody(req.body, { status: { type: 'string', required: true } }) }),
  },
];
