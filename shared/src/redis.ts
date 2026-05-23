import { Redis } from "ioredis"

if (!process.env.REDIS_URL) throw new Error("REDIS_URL não definida")

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
})

redis.on("connect", () => console.log("✓ Redis conectado"))
redis.on("error",   (e) => console.error("✗ Redis:", e.message))
