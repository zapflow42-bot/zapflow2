import makeWASocket, {
  DisconnectReason, useMultiFileAuthState, type WASocket,
} from "@whiskeysockets/baileys"
import { redis, db, logger } from "@zapflow/shared"

const sessions = new Map<string, WASocket>()

export async function createSession(sessionId: string, ownerId: string): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${sessionId}`)

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: { level: "silent" } as any,
    connectTimeoutMs: 30_000,
    browser: ["ZapFlow", "Chrome", "1.0.0"],
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      await redis.set(`qr:${sessionId}`, qr, "EX", 60)
      logger.info({ sessionId }, "QR disponível")
    }
    if (connection === "open") {
      sessions.set(sessionId, sock)
      await setStatus(sessionId, ownerId, "connected")
      logger.info({ sessionId }, "Sessão conectada")
    }
    if (connection === "close") {
      const code = (lastDisconnect?.error as any)?.output?.statusCode
      sessions.delete(sessionId)
      const banned = code === DisconnectReason.loggedOut
      await setStatus(sessionId, ownerId, banned ? "banned" : "disconnected")
      if (!banned) {
        logger.warn({ sessionId }, "Desconectado — reconectando em 5s")
        setTimeout(() => createSession(sessionId, ownerId), 5_000)
      }
    }
  })
}

export async function sendMessage(sessionId: string, to: string, text: string): Promise<boolean> {
  const sock = sessions.get(sessionId)
  if (!sock) return false
  try {
    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`
    await sock.sendMessage(jid, { text })
    return true
  } catch (err) {
    logger.error({ sessionId, err: (err as Error).message }, "Falha ao enviar WA")
    return false
  }
}

export const getQR      = (id: string) => redis.get(`qr:${id}`)
export const getActive  = () => Array.from(sessions.keys())

async function setStatus(sessionId: string, ownerId: string, status: string) {
  await db.collection("sessions").doc(sessionId).set(
    { sessionId, ownerId, status, updatedAt: new Date(), ...(status === "connected" ? { connectedAt: new Date() } : {}) },
    { merge: true }
  ).catch(e => logger.error(e, "Firestore setStatus falhou"))
}
