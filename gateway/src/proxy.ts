import type { Response } from "express"
import type { AuthReq } from "@zapflow/shared"
import { logger, buildInternalHeaders } from "@zapflow/shared"
import { MODULES, type ModuleName } from "./moduleRegistry"

export async function proxyToModule(
  module: ModuleName,
  path: string,
  req: AuthReq,
  res: Response,
): Promise<void> {
  const url  = `${MODULES[module]}${path}`
  const body = req.method !== "GET" ? req.body : ""

  try {
    const upstream = await fetch(url, {
      method:  req.method,
      headers: {
        "Content-Type": "application/json",
        ...buildInternalHeaders(req.uid!, req.role!, req.tenantId ?? "", body),
      },
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })

    const data = await upstream.json().catch(() => ({ error: "Resposta inválida" }))
    res.status(upstream.status).json(data)
  } catch (err: any) {
    logger.error({ module, path, err: err?.message }, "Módulo indisponível")
    res.status(503).json({
      error:   "Módulo temporariamente indisponível",
      module,
      message: "Os outros canais continuam funcionando normalmente.",
    })
  }
}
