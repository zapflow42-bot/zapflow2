import Redis, { RedisOptions } from 'ioredis';

// Configurações base para evitar o erro fatal do BullMQ
const REDIS_OPTS: RedisOptions = {
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null, // OBRIGATÓRIO PARA BULLMQ
  enableReadyCheck: false,
};

// Singleton para uso geral (cache, etc)
export const redis = new Redis(REDIS_OPTS);

// Factory para instâncias dedicadas do BullMQ
export function newRedisConnection() {
  return new Redis(REDIS_OPTS);
}

redis.on("connect", () => console.log("✓ Redis conectado"));
redis.on("error", (e) => console.error("✗ Redis:", e.message));