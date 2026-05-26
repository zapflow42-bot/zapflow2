import Redis from 'ioredis';
// Conexão local, super rápida, sem limites de requisição
export const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
});