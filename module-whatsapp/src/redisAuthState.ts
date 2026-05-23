import { redis } from "@zapflow/shared"
import { initAuthCreds } from "@whiskeysockets/baileys"
const TTL = 45 * 24 * 60 * 60
xport async function useRedisAuthState(sessionId: string) {
  const prefix = `wa:sess:${sessionId}`
  async function read(key: string): Promise<any> {
    const raw = await redis.get(`${prefix}:${key}`)
    if (!raw) return null
    try { return JSON.parse(raw, reviver) } catch { return null }
  }
async function write(key: string, value: unknown): Promise<void> {
    await redis.set(`${prefix}:${key}`, JSON.stringify(value, replacer), "EX", TTL)
  }
async function remove(key: string): Promise<void> { await redis.del(`${prefix}:${key}`) }
  const creds = (await read("creds")) ?? initAuthCreds()
  const keys = {
get: async (type: string, ids: string[]) => {
      const data: Record<string, any> = {}
      await Promise.all(ids.map(async id => { const v = await read(`${type}:${id}`); if (v) data[id] = v }))
      return data
    },
set: async (data: Record<string, Record<string, unknown>>) => {
      await Promise.all(Object.entries(data).flatMap(([type, entries]) =>
        Object.entries(entries).map(([id, value]) => value ? write(`${type}:${id}`, value) : remove(`${type}:${id}`))
      ))
    },
  }
return { state: { creds, keys }, saveCreds: async () => write("creds", creds) }
}
export async function deleteSession(sessionId: string): Promise<void> {
  const keys = await redis.keys(`wa:sess:${sessionId}:*`)
  if (keys.length > 0) await redis.del(...keys)
}
function replacer(_k: string, v: any) {
  if (Buffer.isBuffer(v) || v instanceof Uint8Array || v?.type === "Buffer")
    return { type: "Buffer", data: Array.from(v?.data ?? v) }
  return v
}
function reviver(_k: string, v: any) {
  if (v?.type === "Buffer" && Array.isArray(v.data)) return Buffer.from(v.data)
  return v
}
