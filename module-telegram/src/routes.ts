/**
 * module-telegram/src/routes.ts
 *
 * Endpoints espelham exatamente o padrão do módulo WhatsApp:
 *   GET  /health
 *   POST /session          → inicia login (envia código SMS)
 *   POST /session/confirm  → confirma código e conecta
 *   GET  /qr/:sessionId    → status da sessão (reutiliza a rota "qr" do frontend)
 *   GET  /sessions         → lista sessões ativas do usuário
 *   POST /enqueue          → enfileira disparos
 *   GET  /stats            → estatísticas da fila
 */

import { Router, type Response } from "express"
import { z } from "zod"
import { requireInternalAuth, type AuthReq } from "@zapflow/shared"
import {
  startLogin,
  confirmCode,
  getSessionStatus,
  getActive,
} from "./sessionManager"
import { tgQueue, getQueueStats } from "./queue"

export const router = Router()
router.use(requireInternalAuth)

// ── Saúde ──────────────────────────────────────────────────────────────────
router.get("/health", (_req, res) =>
  res.json({ status: "ok", module: "telegram-mtproto", sessions: getActive().length })
)

// ── Passo 1 — inicia login: envia código para o celular ────────────────────
router.post("/session", async (req: AuthReq, res: Response) => {
  const schema = z.object({
    sessionId:   z.string().min(1),
    phoneNumber: z.string().min(8),  // ex: "5581994900228"
  })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() }) as any

  const { sessionId, phoneNumber } = p.data

  // sessionId deve pertencer ao uid do usuário (mesmo padrão do WhatsApp)
  if (!sessionId.startsWith(req.uid!))
    return res.status(403).json({ error: "sessionId inválido" }) as any

  try {
    await startLogin(sessionId, req.uid!, phoneNumber)
    res.json({ message: "Código enviado para o celular — aguardando confirmação" })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Passo 2 — confirma código recebido ─────────────────────────────────────
router.post("/session/confirm", async (req: AuthReq, res: Response) => {
  const schema = z.object({
    sessionId: z.string().min(1),
    code:      z.string().min(4),
    password:  z.string().optional(),  // 2FA se necessário
  })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() }) as any

  try {
    await confirmCode(p.data.sessionId, p.data.code, p.data.password)
    res.json({ message: "Sessão Telegram conectada com sucesso!" })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ── Status da sessão — reutiliza rota /qr/:sessionId do frontend ───────────
// (o frontend do WhatsApp usa esta rota; reaproveitamos para Telegram)
router.get("/qr/:sessionId", async (req: AuthReq, res: Response) => {
  if (!req.params.sessionId.startsWith(req.uid!))
    return res.status(403).json({ error: "Acesso negado" }) as any

  const status = await getSessionStatus(req.params.sessionId)
  if (!status) return res.status(404).json({ error: "Sessão não encontrada" }) as any

  res.json({ status })   // "connected" | "pending_code" | "disconnected"
})

// ── Lista sessões do usuário ────────────────────────────────────────────────
router.get("/sessions", async (req: AuthReq, res: Response) =>
  res.json({ sessions: getActive().filter(s => s.startsWith(req.uid!)) })
)

// ── Enfileirar disparos ─────────────────────────────────────────────────────
const EnqueueSchema = z.object({
  campaignId: z.string().min(1),
  messages: z.array(z.object({
    jobId:       z.string(),
    to:          z.string().min(8),   // número: 5581994900228
    contactName: z.string().max(100),
    message:     z.string().min(1).max(4096),
    senderId:    z.string(),          // sessionId do chip Telegram
    delay:       z.number().min(0).max(300_000),
  })).min(1).max(10_000),
})

router.post("/enqueue", async (req: AuthReq, res: Response) => {
  const p = EnqueueSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() }) as any

  for (const msg of p.data.messages) {
    await tgQueue.add("send", {
      jobId:       msg.jobId,
      campaignId:  p.data.campaignId,
      ownerId:     req.uid!,
      tenantId:    req.tenantId ?? "",
      to:          msg.to,
      contactName: msg.contactName,
      message:     msg.message,
      senderId:    msg.senderId,    // ← sessionId do chip, igual ao WhatsApp
      channelType: "telegram",
      attempt:     0,
    }, { jobId: msg.jobId, delay: msg.delay })
  }

  res.json({ enqueued: p.data.messages.length })
})

// ── Estatísticas da fila ────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => res.json(await getQueueStats()))
