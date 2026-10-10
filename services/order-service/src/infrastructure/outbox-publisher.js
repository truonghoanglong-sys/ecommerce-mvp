const { Kafka, Partitioners, logLevel } = require('kafkajs');
const config = require('../config');
const { pool } = require('./db');

const TOPIC = 'order-created';
const BATCH = 20;

/**
 * OUTBOX PUBLISHER – tiến trình nền chạy mỗi giây:
 *   1. Lấy tối đa 20 sự kiện PENDING (FOR UPDATE SKIP LOCKED: nếu chạy 2 bản Order Service,
 *      mỗi bản lấy các dòng khác nhau, không gửi trùng).
 *   2. Gửi lên Kafka (key = oid → các sự kiện của cùng 1 đơn luôn vào cùng partition, giữ thứ tự).
 *   3. Gửi được → PUBLISHED. Kafka lỗi → giữ PENDING, tăng attempts, lần sau gửi lại.
 *
 * Đảm bảo "at-least-once": sự kiện CHẮC CHẮN tới Kafka, nhưng có thể tới 2 lần
 * (ví dụ gửi xong thì sập trước khi kịp đánh dấu PUBLISHED) → Shipment phải chống trùng (TC-SHP-05).
 */
function createOutboxPublisher() {
  const kafka = new Kafka({ clientId: 'order-service', brokers: config.kafkaBrokers, logLevel: logLevel.WARN });
  const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
  let timer = null;
  let connected = false;
  let running = false;

  async function publishBatch() {
    if (running) return;            // lần trước chưa xong thì bỏ qua lượt này
    running = true;
    const client = await pool.connect();
    try {
      if (!connected) { await producer.connect(); connected = true; console.log('[outbox] kafka producer connected'); }

      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id, aggregate_id, payload FROM outbox_events
          WHERE status = 'PENDING' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [BATCH]
      );
      if (rows.length) {
        try {
          await producer.send({
            topic: TOPIC,
            messages: rows.map((r) => ({ key: String(r.aggregate_id), value: JSON.stringify(r.payload) })),
          });
          await client.query(
            `UPDATE outbox_events SET status = 'PUBLISHED', published_at = NOW(), attempts = attempts + 1, last_error = NULL
              WHERE id = ANY($1)`, [rows.map((r) => r.id)]
          );
          console.log(`[outbox] published ${rows.length} event(s): oid ${rows.map((r) => r.aggregate_id).join(', ')}`);
        } catch (err) {
          await client.query(
            'UPDATE outbox_events SET attempts = attempts + 1, last_error = $2 WHERE id = ANY($1)',
            [rows.map((r) => r.id), err.message]
          );
          console.warn(`[outbox] kafka send failed, will retry: ${err.message}`);
          connected = false;
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      connected = false;
      console.warn(`[outbox] cycle failed, will retry: ${err.message}`);
    } finally {
      client.release();
      running = false;
    }
  }

  return {
    start() {
      timer = setInterval(publishBatch, config.outboxPollMs);
      console.log(`[outbox] publisher started (every ${config.outboxPollMs}ms → topic ${TOPIC})`);
    },
    async stop() {
      clearInterval(timer);
      await producer.disconnect().catch(() => {});
    },
  };
}

module.exports = { createOutboxPublisher };
