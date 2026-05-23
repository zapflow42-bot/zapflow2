import { Router, type Response } from "express"
import { z } from "zod"
import { supabase, type AuthReq } from "@zapflow/shared"
import { tgQueue, getQueueStats } from "./queue"

export const router = Router()

router.use((req: AuthReq, _res, next) => {
  req.uid      = req.headers["x-internal-uid"]    as string
  req.role     = req.headers["x-internal-role"]   as string
  req.tenantId = req.headers["x-internal-tenant"] as string
  next()
})

router.get("/health", (_req, res) => res.json({ status: "ok", module: "telegram" }))

router.get("/contacts", async (_req, res) => {
  const { data } = await supabase
    .from("telegram_contacts")
    .select("*")
    .eq("active", true)
    .not("confirmed_at", "is", null)
    .limit(1000)
  res.json({ contacts: data ?? [], total: data?.length ?? 0 })
})

const EnqueueSchema = z.object({
  campaignId: z.string().min(1),
  messages: z.array(z.object({
    jobId:       z.string(),
    to:          z.string().min(1),
    contactName: z.string().max(100),
    message:     z.string().min(1).max(4096),
    delay:       z.number().min(0).max(300_000),
  })).max(50_000),
})

router.post("/enqueue", async (req: AuthReq, res: Response) => {
  const p = EnqueueSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() })
  for (const msg of p.data.messages) {
    await tgQueue.add("send", {
      jobId: msg.jobId, campaignId: p.data.campaignId,
      ownerId: req.uid!, tenantId: req.tenantId ?? "",
      to: msg.to, contactName: msg.contactName,
      message: msg.message, senderId: "bot",
      channelType: "telegram", attempt: 0,
    }, { jobId: msg.jobId, delay: msg.delay })
  }
  res.json({ enqueued: p.data.messages.length })
})

router.get("/stats", async (_req, res) => res.json(await getQueueStats()))
