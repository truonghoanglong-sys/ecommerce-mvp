const Redis = require('ioredis');
const config = require('./config');

// enableOfflineQueue=false: Redis sập thì lệnh lỗi NGAY thay vì treo chờ → Gateway vẫn phục vụ được
const redis = new Redis(config.redisUrl, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
});
redis.on('error', (err) => console.warn('[redis]', err.message));

module.exports = redis;
