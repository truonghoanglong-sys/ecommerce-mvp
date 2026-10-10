/**
 * Cache GET trong Redis cho các route có `cache` (hiện là /api/products).
 *
 * Kỹ thuật "version key" để xoá cache: key = cache:products:v<số phiên bản>:<url>
 *   - Mỗi lần có thao tác ghi (tạo/sửa/xoá sản phẩm, đặt hàng) → INCR số phiên bản.
 *   - Toàn bộ key cũ tự "vô hiệu" ngay lập tức (không ai đọc tới nữa) và tự hết hạn theo TTL.
 *   → Không phải đi tìm và xoá từng key.
 */
function createCache(redis, ttlSeconds) {
  const versionKey = (ns) => `cache:${ns}:version`;

  async function lookup(req, res, next) {
    const ns = req.route_.cache;
    if (!ns || req.method !== 'GET') return next();
    try {
      const version = (await redis.get(versionKey(ns))) || '0';
      // KHÔNG đưa uid vào key vì dữ liệu sản phẩm giống nhau với mọi người → dùng chung cache
      req.cacheKey = `cache:${ns}:v${version}:${req.originalUrl}`;
      const hit = await redis.get(req.cacheKey);
      if (hit) {
        res.setHeader('x-cache', 'HIT');
        res.setHeader('content-type', 'application/json; charset=utf-8');
        return res.end(hit);
      }
      res.setHeader('x-cache', 'MISS');
    } catch (err) {
      req.cacheKey = undefined; // Redis lỗi → bỏ qua cache, gọi thẳng service
      console.warn('[cache] redis unavailable, bypassing:', err.message);
    }
    next();
  }

  // Proxy gọi hàm này khi service trả 200 cho request có cacheKey
  async function store(key, body) {
    try { await redis.set(key, body, 'EX', ttlSeconds); } catch { /* bỏ qua */ }
  }

  // Proxy gọi hàm này khi thao tác ghi thành công (2xx)
  async function invalidate(ns) {
    try { await redis.incr(versionKey(ns)); } catch { /* bỏ qua */ }
  }

  return { lookup, store, invalidate };
}

module.exports = { createCache };
