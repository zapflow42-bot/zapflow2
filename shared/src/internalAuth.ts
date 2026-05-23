import { createHmac, timingSafeEqual } from "crypto"
import type { Response, NextFunction } from "express"
import type { AuthReq } from "./auth"
const SECRET = process.env.INTERNAL_SECRET ?? "dev-secret-change-in-prod"
export function signRequest(body: unknown, timestamp: number): string {
  const payload = `${timestamp}.${JSON.stringify(body ?? "")}`
  return createHmac("sha256", SECRET).update(payload).digest("hex")
}
export function buildInternalHeaders(uid: string, role: string, tenantId: string, body: unknown): Record<string, string> {
  const ts = Date.now()
  const sig = signRequest(body, ts)
  return {
    "X-Internal-Uid": uid,
    "X-Internal-Role": role,
    "X-Internal-Tenant": tenantId,
    "X-Internal-Timestamp": String(ts),
    "X-Internal-Signature": sig,
  }
}
export function requireInternalAuth(req: AuthReq, res: Response, next: NextFunction): void {
  const uid = req.headers["x-internal-uid"] as string
  const sig = req.headers["x-internal-signature"] as string
  const ts  = req.headers["x-internal-timestamp"] as string
  if (req.path === "/health") { next(); return }
  if (!uid || !sig || !ts) { res.status(401).json({ error: "Nao autenticado" }); return }
  const age = Date.now() - Number(ts)
  if (age > 30_000 || age < -5_000) { res.status(401).json({ error: "Timestamp invalido" }); return }
  try {
    const expected = signRequest(req.body, Number(ts))
    const a = Buffer.from(sig, "hex")
    const b = Buffer.from(expected, "hex")
    if (a.length !== b.length || !timingSafeEqual(a, b)) { res.status(401).json({ error: "Assinatura invalida" }); return }
  } catch { res.status(401).json({ error: "Erro" }); return }
  req.uid      = uid
  req.role     = req.headers["x-internal-role"] as string
  req.tenantId = req.headers["x-internal-tenant"] as string
  next()
}
