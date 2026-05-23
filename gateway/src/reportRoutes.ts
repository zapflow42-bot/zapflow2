import { Router, type Response } from "express"
import { z } from "zod"
import { type AuthReq } from "@zapflow/shared"
import { generateReport } from "./reportService"
export const reportRouter = Router()

const GenerateSchema = z.object({
  scope:       z.enum(["individual","team"]),
  period:      z.enum(["week","month","3weeks","custom"]),
  userId:      z.string().optional(),
  channels:    z.array(z.enum(["whatsapp","email","telegram","sms"])).optional(),
  customStart: z.string().datetime().optional(),
  customEnd:   z.string().datetime().optional(),
  withAI:      z.boolean().default(false),
})

reportRouter.post("/generate", async (req: AuthReq, res: Response) => {
  const p = GenerateSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() })
  if (req.role === "disparador" && p.data.scope === "team")
    return res.status(403).json({ error: "Acesso negado" })
  if (req.role === "disparador") p.data.userId = req.uid
  try {
const report = await generateReport({
      tenantId: req.tenantId!, scope: p.data.scope, period: p.data.period,
      userId: p.data.userId, channels: p.data.channels as any,
      customStart: p.data.customStart ? new Date(p.data.customStart) : undefined,
      customEnd:   p.data.customEnd   ? new Date(p.data.customEnd)   : undefined,
    })
res.json({ report })
  } catch { res.status(500).json({ error: "Erro ao gerar relatorio" }) }
})
reportRouter.get("/", async (req: AuthReq, res: Response) => {
  try {
 const { supabase } = await import("@zapflow/shared")
const { data } = await supabase.from("reports").select("*")
.eq("tenant_id", req.tenantId).order("generated_at", { ascending: false }).limit(20)
    res.json({ reports: data ?? [] })
  } catch { res.json({ reports: [] }) }
})
