import { Router, type Response } from "express"
import { z } from "zod"
import { requireInternalAuth, type AuthReq } from "@zapflow/shared"
import { createSession, getQR, getActive } from "./sessionManager"
import { waQueue, getQueueStats } from "./queue"

export const router = Router()
router.use(requireInternalAuth)

router.get("/health", (_req, res) =>
  res.json({ status: "ok", module: "whatsapp", sessions: getActive().length }))

router.get("/qr/:sessionId", async (req: AuthReq, res: Response) => {
  if (!req.params.sessionId.startsWith(req.uid!))
    return res.status(403).json({ error: "Acesso negado" })
  const qr = await getQR(req.params.sessionId)
  if (!qr) return res.status(404).json({ error: "QR não disponível" })
  res.json({ qr })
})

router.post("/session", async (req: AuthReq, res: Response) => {
  const { sessionId } = req.body
  if (!sessionId?.startsWith(req.uid!))
    return res.status(403).json({ error: "sessionId inválido" })
  await createSession(sessionId, req.uid!)
  res.json({ message: "Sessão iniciada — escaneie o QR" })
})

const EnqueueSchema = z.object({
  campaignId: z.string().min(1),
  messages: z.array(z.object({
    jobId:       z.string(),
    to:          z.string().min(10),
    contactName: z.string().max(100),
    message:     z.string().min(1).max(4096),
    senderId:    z.string(),
    delay:       z.number().min(0).max(300_000),
  })).min(1).max(10_000),
})

router.post("/enqueue", async (req: AuthReq, res: Response) => {
  const p = EnqueueSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() })
  for (const msg of p.data.messages) {
    await waQueue.add("send", {
      jobId: msg.jobId, campaignId: p.data.campaignId,
      ownerId: req.uid!, tenantId: req.tenantId!,
      to: msg.to, contactName: msg.contactName,
      message: msg.message, senderId: msg.senderId,
      channelType: "whatsapp", attempt: 0,
    }, { jobId: msg.jobId, delay: msg.delay })
  }
  res.json({ enqueued: p.data.messages.length })
})

router.get("/stats",    async (_req, res) => res.json(await getQueueStats()))
router.get("/sessions", async (req: AuthReq, res: Response) =>
  res.json({ sessions: getActive().filter(s => s.startsWith(req.uid!)) }))
