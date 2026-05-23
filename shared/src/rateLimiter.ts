import { RateLimiterRedis } from "rate-limiter-flexible"
import type { Response, NextFunction } from "express"
import { redis } from "./redis"
import type { AuthReq } from "./auth"

const limiter = new RateLimiterRedis({
  storeClient:   redis,
  keyPrefix:     "rl",
  points:        20,        // 20 req
  duration:      1,         // por segundo por UID
  blockDuration: 30,        // bloqueia 30s
})

export async function rateLimiter(req: AuthReq, res: Response, next: NextFunction) {
  try {
    await limiter.consume(req.uid ?? req.ip ?? "anon")
    next()
  } catch {
    res.status(429).json({ error: "Muitas requisições — aguarde 30 segundos" })
  }
}
