const { MongoClient } = require('mongodb');
const config = require('../config');

const client = new MongoClient(config.mongoUrl);
let db;

async function connect() {
  await client.connect();
  db = client.db(config.mongoDb);
  // ADR-12: mỗi đơn chỉ có 1 shipment → unique index trên oid = chống tạo trùng khi nhận event 2 lần
  await db.collection('shipments').createIndex({ oid: 1 }, { unique: true });
  await db.collection('shipments').createIndex({ shipid: 1 }, { unique: true });
  return db;
}

module.exports = { connect, getDb: () => db, ping: () => db.command({ ping: 1 }), close: () => client.close() };
