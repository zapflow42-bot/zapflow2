import { Router, type Response } from "express"
import { z } from "zod"
import { requireInternalAuth, type AuthReq } from "@zapflow/shared"
import { askClaude } from "./claudeService"

export const router = Router()
router.use(requireInternalAuth)

router.get("/health", (_req, res) => res.json({ status: "ok", module: "ai" }))

const AskSchema = z.object({ prompt: z.string().min(1).max(2000) })

router.post("/ask", async (req: AuthReq, res: Response) => {
  if (req.role !== "gestor")
    return res.status(403).json({ error: "Apenas gestores acessam a IA" })
  const p = AskSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() })
  try {
    const answer = await askClaude(p.data.prompt, req.tenantId ?? req.uid!)
    res.json({ answer })
  } catch {
    res.status(500).json({ error: "Erro ao consultar IA" })
  }
})
