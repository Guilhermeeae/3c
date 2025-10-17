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

// === SUBSCRIPTIONS ===
async function saveSubscription(subscription) {
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("push");
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
    const collection = db.collection("push");
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
    const collection = db.collection("push");
    const count = await collection.countDocuments();
    return count;
  } finally {
    await client.close();
  }
}

// === NOTIFICAÇÕES ===
async function saveNotification(notification) {
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("notificacoes");
    await collection.insertOne(notification);
  } finally {
    await client.close();
  }
}

async function getAllNotifications() {
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("notificacoes");
    const notifications = await collection.find({}).sort({ timestamp: -1 }).toArray();
    return notifications;
  } finally {
    await client.close();
  }
}

// === USUÁRIOS ===
async function getUserByUsername(username) {
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("login");
    const user = await collection.findOne({ username: username });
    return user;
  } finally {
    await client.close();
  }
}

// === INICIALIZAÇÃO DOS USUÁRIOS (executar uma vez) ===
async function initializeUsers() {
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("login");
    
    const users = [
      { username: "Yuri", password: "123" },
      { username: "Freitas", password: "456" },
      { username: "Izadora", password: "789" }
    ];
    
    for (const user of users) {
      await collection.updateOne(
        { username: user.username },
        { $set: user },
        { upsert: true }
      );
    }
    
    console.log("Usuários inicializados com sucesso!");
  } catch (err) {
    console.error("Erro ao inicializar usuários:", err);
  } finally {
    await client.close();
  }
}

module.exports = { 
  saveSubscription, 
  getAllSubscriptions, 
  countSubscriptions,
  saveNotification,
  getAllNotifications,
  getUserByUsername,
  initializeUsers
};
