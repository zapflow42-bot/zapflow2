import "dotenv/config"
import express from "express"
import cors from "cors"
import { requireAuth, rateLimiter, logger } from "@zapflow/shared"
import { redis } from "@zapflow/shared"
import { proxyToModule } from "./proxy"
import { startHealthLoop } from "./health"
import { userRouter } from "./userRoutes"
import { reportRouter } from "./reportRoutes"

const app  = express()
const PORT = process.env.PORT ?? 4000

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3000", credentials: true }))
app.use(express.json({ limit: "5mb" }))
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  next()
})

app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }))
app.get("/health/modules", async (_req, res) => {
  const cached = await redis.get("modules:health")
  res.json(cached ? JSON.parse(cached) : [])
})

app.use("/api/users", userRouter)

app.use("/api", requireAuth, rateLimiter)
app.all("/api/whatsapp/*", (req, res) => proxyToModule("whatsapp", req.path.replace("/api/whatsapp",""), req, res))
app.all("/api/email/*",    (req, res) => proxyToModule("email",    req.path.replace("/api/email",""),    req, res))
app.all("/api/telegram/*", (req, res) => proxyToModule("telegram", req.path.replace("/api/telegram",""), req, res))
app.all("/api/ai/*",       (req, res) => proxyToModule("ai",       req.path.replace("/api/ai",""),       req, res))
app.use("/api/reports", reportRouter)

app.listen(PORT, () => {
  logger.info(`Gateway ZapFlow -> http://localhost:${PORT}`)
  startHealthLoop()
})
