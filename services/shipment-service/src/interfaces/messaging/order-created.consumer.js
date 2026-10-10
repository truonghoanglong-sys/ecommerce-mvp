const { Kafka, logLevel } = require('kafkajs');
const config = require('../../config');
const service = require('../../application/shipment.service');

const TOPIC = 'order-created';

/**
 * Kafka consumer (consumer group "shipment-service").
 * Chạy 2 bản Shipment Service → Kafka chia 3 partition cho 2 bản, mỗi event chỉ 1 bản xử lý.
 * Offset chỉ được commit SAU KHI handleOrderCreated chạy xong
 * → service sập giữa chừng thì lần khởi động sau đọc lại event đó (không mất event).
 */
function createOrderCreatedConsumer() {
  const kafka = new Kafka({ clientId: 'shipment-service', brokers: config.kafkaBrokers, logLevel: logLevel.WARN });
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  const state = { running: false };

  consumer.on(consumer.events.CRASH, (e) => {
    state.running = false;
    console.error('[kafka] consumer crashed:', e.payload.error.message);
  });

  async function start() {
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ partition, message }) => {
        await service.handleOrderCreated(message.value.toString());
      },
    });
    state.running = true;
    console.log(`[kafka] consuming topic ${TOPIC} (group ${config.kafkaGroupId})`);
  }

  return { start, stop: () => consumer.disconnect(), isRunning: () => state.running };
}

module.exports = { createOrderCreatedConsumer };
