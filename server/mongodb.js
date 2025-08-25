const { MongoClient, ServerApiVersion } = require('mongodb');

// Use variável de ambiente em produção
const uri = process.env.MONGODB_URI || "mongodb+srv://yuri:yuri2503@notifi3c.9rbu1m2.mongodb.net/?retryWrites=true&w=majority&appName=Notifi3c";

// Criar um client com cache
let cachedClient = null;
let cachedDb = null;

const clientOptions = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
  minPoolSize: 1,
  retryWrites: true,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 30000
};

const dbName = "notifi3c";
const collectionName = "push";

// Função para conectar ao MongoDB
async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  try {
    const client = await MongoClient.connect(uri, clientOptions);
    const db = client.db(dbName);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (error) {
    console.error('Erro ao conectar ao MongoDB:', error);
    throw error;
  }
}

// Salvar ou atualizar subscription
async function saveSubscription(subscription) {
  const { db } = await connectToDatabase();
  try {
    const collection = db.collection(collectionName);
    const result = await collection.updateOne(
      { endpoint: subscription.endpoint },
      { 
        $set: subscription,
        $setOnInsert: { createdAt: new Date() },
        $currentDate: { lastModified: true }
      },
      { upsert: true }
    );
    return result;
  } catch (error) {
    console.error('Erro ao salvar subscription:', error);
    throw error;
  }
}

// Buscar todas as subscriptions
async function getAllSubscriptions() {
  const { db } = await connectToDatabase();
  try {
    const collection = db.collection(collectionName);
    return await collection.find({}).toArray();
  } catch (error) {
    console.error('Erro ao buscar subscriptions:', error);
    throw error;
  }
}

// Contar total de subscriptions
async function countSubscriptions() {
  const { db } = await connectToDatabase();
  try {
    const collection = db.collection(collectionName);
    return await collection.countDocuments();
  } catch (error) {
    console.error('Erro ao contar subscriptions:', error);
    throw error;
  }
}

// Deletar uma subscription
async function deleteSubscription(endpoint) {
  const { db } = await connectToDatabase();
  try {
    const collection = db.collection(collectionName);
    const result = await collection.deleteOne({ endpoint });
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Erro ao deletar subscription:', error);
    throw error;
  }
}

// Buscar subscriptions recentes
async function getRecentSubscriptions(limit = 100) {
  const { db } = await connectToDatabase();
  try {
    const collection = db.collection(collectionName);
    return await collection.find({})
      .sort({ lastModified: -1 })
      .limit(limit)
      .toArray();
  } catch (error) {
    console.error('Erro ao buscar subscriptions recentes:', error);
    throw error;
  }
}

// Buscar estatísticas de dispositivos
async function getDeviceStats() {
  const { db } = await connectToDatabase();
  try {
    const collection = db.collection(collectionName);
    const stats = await collection.aggregate([
      {
        $group: {
          _id: "$metadata.deviceType",
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    return stats.reduce((acc, stat) => {
      acc[stat._id || 'unknown'] = stat.count;
      return acc;
    }, {});
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    throw error;
  }
}

// Limpar subscriptions antigas/inválidas
async function cleanupOldSubscriptions(daysOld = 30) {
  const { db } = await connectToDatabase();
  try {
    const collection = db.collection(collectionName);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await collection.deleteMany({
      lastModified: { $lt: cutoffDate }
    });

    return result.deletedCount;
  } catch (error) {
    console.error('Erro ao limpar subscriptions antigas:', error);
    throw error;
  }
}

// Gerenciar gracefully o fechamento da conexão
process.on('SIGINT', async () => {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
  process.exit(0);
});

module.exports = {
  saveSubscription,
  getAllSubscriptions,
  countSubscriptions,
  deleteSubscription,
  getRecentSubscriptions,
  getDeviceStats,
  cleanupOldSubscriptions,
  connectToDatabase
};
