import Redis from 'ioredis';

// Conexão local, com as opções que o BullMQ exige
export const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null, // <--- ISSO É O QUE O BULLMQ EXIGE
  enableReadyCheck: false,
});

redis.on("connect", () => console.log("✓ Redis conectado"));
redis.on("error",   (e) => console.error("✗ Redis:", e.message));