const config = require('./config');

/**
 * GET /api/health (API-HEALTH-01): kiểm tra Gateway + Redis + /health của từng service.
 * Tất cả UP → 200; có thành phần DOWN → 503 kèm chi tiết thành phần nào hỏng.
 */
async function checkService(name, baseUrl) {
  try {
    const r = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return [name, r.ok ? 'UP' : 'DOWN'];
  } catch {
    return [name, 'DOWN'];
  }
}

function createHealthHandler(redis) {
  return async (req, res) => {
    const [redisStatus, ...services] = await Promise.all([
      redis.ping().then(() => 'UP').catch(() => 'DOWN'),
      ...Object.entries(config.services).map(([n, s]) => checkService(n, s.healthUrl)),
    ]);
    const components = { redis: redisStatus, ...Object.fromEntries(services) };
    const allUp = Object.values(components).every((s) => s === 'UP');
    res.status(allUp ? 200 : 503).json({
      status: allUp ? 'UP' : 'DEGRADED',
      message: allUp ? 'E-commerce API is running' : 'Some dependencies are unhealthy',
      components,
    });
  };
}

module.exports = { createHealthHandler };
