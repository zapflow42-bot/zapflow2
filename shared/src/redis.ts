import Redis from 'ioredis';

export const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null, // OBRIGATÓRIO PARA O BULLMQ
  enableReadyCheck: false,    // Recomendado para evitar erros de conexão inicial
});

redis.on("connect", () => console.log("✓ Redis conectado"));
redis.on("error", (e) => console.error("✗ Redis:", e.message));