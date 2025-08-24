const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://yuri:yuri2503@notifi3c.9rbu1m2.mongodb.net/?retryWrites=true&w=majority&appName=Notifi3c";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const dbName = "notifi3c";
const collectionName = "push";

async function saveSubscription(subscription) {
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    // Upsert para evitar duplicidade
    await collection.updateOne(
      { endpoint: subscription.endpoint },
      { $set: subscription },
      { upsert: true }
    );
  } finally {
    await client.close();
  }
}

async function getAllSubscriptions() {
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const subs = await collection.find({}).toArray();
    return subs;
  } finally {
    await client.close();
  }
}

async function countSubscriptions() {
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();
    return count;
  } finally {
    await client.close();
  }
}

module.exports = { saveSubscription, getAllSubscriptions, countSubscriptions };
