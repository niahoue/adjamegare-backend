import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL, {
  tls: {},
});

redis.on("connect", () => {
  console.log("✅ Redis connecté avec Upstash");
});

redis.on("error", (err) => {
  console.error("❌ Erreur Redis:", err);
});

export default redis;
