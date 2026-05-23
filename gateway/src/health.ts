import { redis } from "@zapflow/shared"
import { MODULES } from "./moduleRegistry"
import type { ModuleHealth } from "@zapflow/shared"

export async function checkModules(): Promise<ModuleHealth[]> {
  const results = await Promise.all(
    Object.entries(MODULES).map(async ([name, url]) => {
      const start = Date.now()
      try {
        const res = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(3_000),
        })
        return {
          name, url,
          status:    res.ok ? "ok" : "degraded",
          latencyMs: Date.now() - start,
          lastCheck: new Date().toISOString(),
        } as ModuleHealth
      } catch {
        return { name, url, status: "down", latencyMs: null, lastCheck: new Date().toISOString() } as ModuleHealth
      }
    })
  )
  // Publica no Redis — frontend lê via polling
  await redis.set("modules:health", JSON.stringify(results), "EX", 30)
  return results
}

// Health check a cada 10s
export function startHealthLoop() {
  checkModules().catch(() => {})
  setInterval(() => checkModules().catch(() => {}), 10_000)
  console.log("✓ Health check loop iniciado (10s)")
}
