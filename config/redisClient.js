
import Redis from "ioredis";

const redisOptions = {
  tls: {},
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 200,
  connectTimeout: 10000,
  lazyConnect: true,
  // Pool de connexions
  maxMemoryPolicy: 'allkeys-lru',
  // Optimisations réseau
  keepAlive: 30000,
  family: 4, // Force IPv4
};

const redis = new Redis(process.env.REDIS_URL, redisOptions);

redis.on("connect", () => {
  console.log("✅ Redis connecté avec Upstash");
});

redis.on("error", (err) => {
  console.error("❌ Erreur Redis:", err.message);
  // Ne pas faire crash l'app si Redis est indisponible
});

redis.on("reconnecting", () => {
  console.log("🔄 Reconnexion à Redis...");
});

// Fonction helper pour gérer les erreurs Redis gracieusement
redis.safeGet = async function(key) {
  try {
    return await this.get(key);
  } catch (error) {
    console.warn(`Redis GET error for key ${key}:`, error.message);
    return null;
  }
};

redis.safeSet = async function(key, value, mode, duration) {
  try {
    return await this.set(key, value, mode, duration);
  } catch (error) {
    console.warn(`Redis SET error for key ${key}:`, error.message);
    return false;
  }
};

export default redis;