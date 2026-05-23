import { Router, type Response } from "express"
import { z } from "zod"
import { requireInternalAuth, type AuthReq } from "@zapflow/shared"
import { emailQueue, getQueueStats } from "./queue"

export const router = Router()
router.use(requireInternalAuth)

router.get("/health", (_req, res) => res.json({ status: "ok", module: "email" }))

const EnqueueSchema = z.object({
  campaignId: z.string().min(1),
  messages: z.array(z.object({
    jobId:       z.string(),
    to:          z.string().email(),
    contactName: z.string().max(100),
    message:     z.string().min(1).max(10_000),
    subject:     z.string().min(1).max(200),
    delay:       z.number().min(0).max(300_000),
  })).min(1).max(50_000),
})

router.post("/enqueue", async (req: AuthReq, res: Response) => {
  const p = EnqueueSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() })
  for (const msg of p.data.messages) {
    await emailQueue.add("send", {
      jobId: msg.jobId, campaignId: p.data.campaignId, ownerId: req.uid!,
      tenantId: req.tenantId!, to: msg.to, contactName: msg.contactName,
      message: msg.message, subject: msg.subject,
      senderId: process.env.BREVO_SENDER_EMAIL ?? "",
      channelType: "email", attempt: 0,
    }, { jobId: msg.jobId, delay: msg.delay })
  }
  res.json({ enqueued: p.data.messages.length })
})

router.get("/stats", async (_req, res) => res.json(await getQueueStats()))

router.post("/webhook", (req, res) => { res.sendStatus(200) })
