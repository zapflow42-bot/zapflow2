import makeWASocket, { DisconnectReason, type WASocket } from "@whiskeysockets/baileys"
import { redis, supabase, logger } from "@zapflow/shared"
import { useRedisAuthState, deleteSession } from "./redisAuthState"

const sessions = new Map<string, WASocket>()

export async function createSession(sessionId: string, ownerId: string): Promise<void> {
  const { state, saveCreds } = await useRedisAuthState(sessionId)

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: { level: "silent" } as any,
    connectTimeoutMs: 30_000,
    retryRequestDelayMs: 500,
    browser: ["ZapFlow", "Chrome", "1.0.0"],
    syncFullHistory: false,
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      await redis.set(`qr:${sessionId}`, qr, "EX", 60)
      logger.info({ sessionId }, "QR disponivel")
    }

    if (connection === "open") {
      sessions.set(sessionId, sock)
      await setStatus(sessionId, ownerId, "connected")
      await redis.del(`qr:${sessionId}`)
      logger.info({ sessionId }, "Sessao conectada")
    }

    if (connection === "close") {
      const code     = (lastDisconnect?.error as any)?.output?.statusCode
      const banned   = code === DisconnectReason.loggedOut
      const conflict = code === DisconnectReason.connectionReplaced
      sessions.delete(sessionId)

      if (banned) {
        await deleteSession(sessionId)
        await setStatus(sessionId, ownerId, "banned")
        logger.warn({ sessionId }, "Numero banido")
        return
      }
      if (conflict) {
        await setStatus(sessionId, ownerId, "disconnected")
        return
      }
      await setStatus(sessionId, ownerId, "disconnected")
      logger.warn({ sessionId }, "Desconectado — reconectando em 5s")
      setTimeout(() => createSession(sessionId, ownerId), 5_000)
    }
  })

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message) {
        const from = msg.key.remoteJid?.replace("@s.whatsapp.net", "") ?? ""
        await supabase.from("dispatch_logs")
          .select("campaign_id").eq("channel", "whatsapp").like("to_masked", `${from.slice(0,4)}%`)
          .limit(1)
          .then(async ({ data }) => {
            if (data?.[0]?.campaign_id) {
              const { data: camp } = await supabase.from("campaigns").select("reply_count").eq("id", data[0].campaign_id).single()
              if (camp) await supabase.from("campaigns").update({ reply_count: (camp.reply_count ?? 0) + 1 }).eq("id", data[0].campaign_id)
            }
          })
          .catch(() => {})
      }
    }
  })
}

export async function sendMessage(sessionId: string, to: string, text: string): Promise<boolean> {
  const sock = sessions.get(sessionId)
  if (!sock) { logger.error({ sessionId }, "Sessao nao encontrada"); return false }
  try {
    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`
    await sock.sendMessage(jid, { text })
    return true
  } catch (err) {
    logger.error({ sessionId, err: (err as Error).message }, "Falha ao enviar")
    return false
  }
}

export const getQR     = (id: string) => redis.get(`qr:${id}`)
export const getActive = ()           => Array.from(sessions.keys())

async function setStatus(id: string, ownerId: string, status: string) {
  await supabase.from("wa_sessions").upsert({
    session_id: id, owner_id: ownerId, status, updated_at: new Date().toISOString(),
    ...(status === "connected" ? { connected_at: new Date().toISOString() } : {}),
  }).catch(e => logger.error(e, "setStatus falhou"))
}
