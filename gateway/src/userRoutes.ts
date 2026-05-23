import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { supabase, requireAuth, type AuthReq } from "@zapflow/shared"
import { randomUUID } from "crypto"

export const userRouter = Router()

const CreateSchema = z.object({
  email:       z.string().email(),
  displayName: z.string().min(2).max(80),
  password:    z.string().min(8),
})

userRouter.post("/setup", async (req: Request, res: Response) => {
  if (process.env.SETUP_DONE === "true")
    return res.status(403).json({ error: "Setup ja concluido" })
  const p = CreateSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() })
  const tenantId = randomUUID()
  await supabase.from("tenants").insert({ id: tenantId, name: p.data.displayName })
  const { data: authData, error } = await supabase.auth.admin.createUser({
    email: p.data.email, password: p.data.password, email_confirm: true,
    user_metadata: { role: "gestor", tenantId, displayName: p.data.displayName },
  })
  if (error) return res.status(400).json({ error: error.message })
  await supabase.from("users").insert({
    id: authData.user.id, email: p.data.email, display_name: p.data.displayName,
    role: "gestor", tenant_id: tenantId, active: true,
  })
  res.status(201).json({ uid: authData.user.id, tenantId, message: "Gestor criado com sucesso" })
})

userRouter.use(requireAuth)

userRouter.get("/", async (req: AuthReq, res: Response) => {
  const { data } = await supabase.from("users").select("*")
    .eq("tenant_id", req.tenantId).order("created_at", { ascending: false })
  res.json({ users: data ?? [] })
})

userRouter.post("/dispatcher", async (req: AuthReq, res: Response) => {
  const p = CreateSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: p.error.format() })
  const { data: authData, error } = await supabase.auth.admin.createUser({
    email: p.data.email, password: p.data.password, email_confirm: true,
    user_metadata: { role: "disparador", tenantId: req.tenantId, displayName: p.data.displayName },
  })
  if (error) return res.status(400).json({ error: error.message })
  await supabase.from("users").insert({
    id: authData.user.id, email: p.data.email, display_name: p.data.displayName,
    role: "disparador", tenant_id: req.tenantId, active: true, created_by: req.uid,
  })
  res.status(201).json({ uid: authData.user.id, message: "Disparador criado" })
})

userRouter.patch("/:uid/toggle", async (req: AuthReq, res: Response) => {
  const { data: user } = await supabase.from("users")
    .select("active,tenant_id").eq("id", req.params.uid).single()
  if (!user) return res.status(404).json({ error: "Usuario nao encontrado" })
  if (user.tenant_id !== req.tenantId) return res.status(403).json({ error: "Acesso negado" })
  await supabase.from("users").update({ active: !user.active }).eq("id", req.params.uid)
  res.json({ uid: req.params.uid, active: !user.active })
})
