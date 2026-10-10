const { MongoClient } = require('mongodb');
const config = require('../config');

const client = new MongoClient(config.mongoUrl);
let db;

async function connect() {
  await client.connect();
  db = client.db(config.mongoDb);
  // Index: pid là duy nhất (như PRIMARY KEY), reservation_id duy nhất (chống trừ kho 2 lần)
  await db.collection('products').createIndex({ pid: 1 }, { unique: true });
  await db.collection('reservations').createIndex({ reservation_id: 1 }, { unique: true });
  return db;
}

const getDb = () => db;
const ping = () => db.command({ ping: 1 });
const close = () => client.close();

module.exports = { connect, getDb, ping, close };
