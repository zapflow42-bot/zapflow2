import { createHmac, timingSafeEqual } from "crypto"
import type { Response, NextFunction } from "express"
import type { AuthReq } from "./auth"

const SECRET = process.env.INTERNAL_SECRET ?? "dev-secret-change-in-prod"

type HeaderValue = string | string[] | undefined

type InternalAuthReq = AuthReq & {
  path: string
  method: string
  body?: unknown
  headers: Record<string, HeaderValue>
}

function getHeader(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function getBodyForSignature(method: string, body: unknown): unknown {
  return method.toUpperCase() === "GET" ? "" : body
}

export function signRequest(body: unknown, timestamp: number): string {
  const payload = `${timestamp}.${JSON.stringify(body ?? "")}`
  return createHmac("sha256", SECRET).update(payload).digest("hex")
}

export function buildInternalHeaders(
  uid: string,
  role: string,
  tenantId: string,
  body: unknown
): Record<string, string> {
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

export function requireInternalAuth(
  req: InternalAuthReq,
  res: Response,
  next: NextFunction
): void {
  if (req.path === "/health") {
    next()
    return
  }

  const uid = getHeader(req.headers["x-internal-uid"])
  const role = getHeader(req.headers["x-internal-role"])
  const tenantId = getHeader(req.headers["x-internal-tenant"])
  const sig = getHeader(req.headers["x-internal-signature"])
  const ts = getHeader(req.headers["x-internal-timestamp"])

  if (!uid || !sig || !ts) {
    res.status(401).json({ error: "Nao autenticado" })
    return
  }

  const timestamp = Number(ts)

  if (!Number.isFinite(timestamp)) {
    res.status(401).json({ error: "Timestamp invalido" })
    return
  }

  const age = Date.now() - timestamp

  if (age > 30_000 || age < -5_000) {
    res.status(401).json({ error: "Timestamp invalido" })
    return
  }

  try {
    const bodyForSignature = getBodyForSignature(req.method, req.body)
    const expected = signRequest(bodyForSignature, timestamp)

    const receivedBuffer = Buffer.from(sig, "hex")
    const expectedBuffer = Buffer.from(expected, "hex")

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      res.status(401).json({ error: "Assinatura invalida" })
      return
    }
  } catch {
    res.status(401).json({ error: "Erro" })
    return
  }

  req.uid = uid
  req.role = role ?? ""
  req.tenantId = tenantId ?? uid

  next()
}