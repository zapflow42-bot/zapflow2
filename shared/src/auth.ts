import type { Request, Response, NextFunction } from "express"
import { supabase } from "./supabase"
import { redis } from "./redis"
import { logger } from "./logger"

export interface AuthReq extends Request {
  uid?: string; role?: string; tenantId?: string
}

export async function requireAuth(req: AuthReq, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token não fornecido" }); return
  }
  const token    = header.slice(7)
  const cacheKey = `auth:${token.slice(-20)}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      const u = JSON.parse(cached)
      if (u.active === false) { res.status(403).json({ error: "Conta desativada" }); return }
      req.uid = u.uid; req.role = u.role; req.tenantId = u.tenantId
      next(); return
    }
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) { res.status(401).json({ error: "Token inválido" }); return }
    const meta = user.user_metadata ?? {}
    const { data: row } = await supabase.from("users").select("active").eq("id", user.id).single()
    if (row?.active === false) {
      await redis.set(cacheKey, JSON.stringify({ active: false }), "EX", 60)
      res.status(403).json({ error: "Conta desativada" }); return
    }
    await redis.set(cacheKey, JSON.stringify({ uid: user.id, role: meta.role, tenantId: meta.tenantId, active: true }), "EX", 60)
    req.uid = user.id; req.role = meta.role; req.tenantId = meta.tenantId
    next()
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Erro ao verificar token")
    res.status(401).json({ error: "Token inválido" })
  }
}

export function requireRole(role: string) {
  return (req: AuthReq, res: Response, next: NextFunction) => {
    if (req.role !== role) { res.status(403).json({ error: "Acesso negado" }); return }
    next()
  }
}

export async function invalidateUserCache(uid: string): Promise<void> {
  logger.info({ uid }, "Cache expirará em 60s")
}
