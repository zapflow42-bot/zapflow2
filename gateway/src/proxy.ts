import type { Response } from "express"
import type { AuthReq } from "@zapflow/shared"
import { logger, buildInternalHeaders } from "@zapflow/shared"
import { MODULES, type ModuleName } from "./moduleRegistry"

type ProxyAuthReq = AuthReq & {
  method: string
  body?: unknown
}

export async function proxyToModule(
  module: ModuleName,
  path: string,
  req: ProxyAuthReq,
  res: Response
): Promise<void> {
  const url = `${MODULES[module]}${path}`
  const method = req.method.toUpperCase()
  const bodyForSignature = method === "GET" ? "" : req.body

  try {
    const upstream = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...buildInternalHeaders(
          req.uid!,
          req.role!,
          req.tenantId ?? req.uid ?? "",
          bodyForSignature
        ),
      },
      body: method === "GET" ? undefined : JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(15_000),
    })

    const data = await upstream
      .json()
      .catch(() => ({ error: "Resposta inválida" }))

    if (upstream.status >= 400) {
      logger.warn(
        {
          module,
          path,
          upstreamStatus: upstream.status,
          errorBody: data,
        },
        "proxy: upstream retornou erro"
      )
    }

    res.status(upstream.status).json(data)
  } catch (err: any) {
    logger.error(
      { module, path, err: err?.message },
      "Módulo indisponível"
    )

    res.status(503).json({
      error: "Módulo temporariamente indisponível",
      module,
      message: "Os outros canais continuam funcionando normalmente.",
    })
  }
}