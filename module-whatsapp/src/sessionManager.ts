import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
} from "@whiskeysockets/baileys"
import { redis, supabase, logger } from "@zapflow/shared"
import pino from "pino"
import path from "path"
import fs from "fs"

const sessions = new Map<string, WASocket>()
const reconnectTimers = new Map<string, NodeJS.Timeout>()

const PROJECT_ROOT = process.cwd()

const AUTH_ROOT = path.resolve(
  process.env.WA_AUTH_DIR && !process.env.WA_AUTH_DIR.includes("/root/")
    ? process.env.WA_AUTH_DIR
    : path.join(PROJECT_ROOT, ".wa-auth")
)

function ensureAuthDir(sessionId: string): string {
  fs.mkdirSync(AUTH_ROOT, { recursive: true })
  const authDir = path.join(AUTH_ROOT, sessionId)
  fs.mkdirSync(authDir, { recursive: true })
  return authDir
}

function authDirHasCreds(sessionId: string): boolean {
  const authDir = path.join(AUTH_ROOT, sessionId)
  if (!fs.existsSync(authDir)) return false

  const credsFile = path.join(authDir, "creds.json")
  return fs.existsSync(credsFile)
}

function scheduleReconnect(sessionId: string, ownerId: string, delayMs: number) {
  if (reconnectTimers.has(sessionId)) return

  const timer = setTimeout(() => {
    reconnectTimers.delete(sessionId)
    void createSession(sessionId, ownerId)
  }, delayMs)

  reconnectTimers.set(sessionId, timer)
}

export async function createSession(
  sessionId: string,
  ownerId: string
): Promise<void> {
  if (sessions.has(sessionId)) return

  const authDir = ensureAuthDir(sessionId)
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()

  logger.info({ version, authRoot: AUTH_ROOT, authDir }, "Baileys version")

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: ["ZapFlow", "Chrome", "120.0.0"],
    syncFullHistory: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
  })

  sessions.set(sessionId, sock)

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.update", updates => {
    for (const update of updates) {
      logger.info({ sessionId, update }, "WA message status update")
    }
  })

  sock.ev.on("message-receipt.update", receipts => {
    for (const receipt of receipts) {
      logger.info({ sessionId, receipt }, "WA receipt update")
    }
  })

  sock.ev.on("connection.update", async update => {
    const { connection, lastDisconnect, qr } = update

    logger.info({ sessionId, connection, hasQr: !!qr }, "connection.update")

    if (qr) {
      await redis.set(`qr:${sessionId}`, qr, "EX", 180)
      logger.info({ sessionId }, "QR salvo no Redis")
    }

    if (connection === "open") {
      await redis.del(`qr:${sessionId}`)
      await setStatus(sessionId, ownerId, "connected")
      logger.info({ sessionId }, "Sessao conectada")
      return
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as any)?.output?.statusCode

      logger.warn({ sessionId, code }, "Sessao fechada")
      sessions.delete(sessionId)

      if (code === DisconnectReason.loggedOut) {
        await redis.del(`qr:${sessionId}`)
        await setStatus(sessionId, ownerId, "logged_out")

        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true })
          logger.info({ sessionId }, "Credenciais removidas apos loggedOut")
        }

        return
      }

      await setStatus(sessionId, ownerId, "disconnected")

      const delay = code === 515 || code === 408 ? 2_000 : 5_000
      logger.info({ sessionId, code, delay }, "Agendando reconexao")
      scheduleReconnect(sessionId, ownerId, delay)
    }
  })
}

async function restoreSessionFromStorage(
  sessionId: string
): Promise<WASocket | undefined> {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId) || null
  }

  if (!authDirHasCreds(sessionId)) {
    logger.warn({ sessionId, authRoot: AUTH_ROOT }, "Sem credenciais locais para restaurar sessao")
    return undefined
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("owner_id,status")
    .eq("session_id", sessionId)
    .maybeSingle()

  if (error) {
    logger.error({ sessionId, error }, "Erro ao buscar sessao no Supabase")
    return undefined
  }

  const ownerId = data?.owner_id

  if (!ownerId) {
    logger.warn({ sessionId }, "Sessao sem owner_id no Supabase")
    return undefined
  }

  logger.info({ sessionId, status: data?.status }, "Restaurando sessao WhatsApp pelo auth local")

  await createSession(sessionId, ownerId)
  await new Promise(resolve => setTimeout(resolve, 3_000))

  return sessions.get(sessionId) || null
}

export async function getQR(sessionId: string): Promise<string | null> {
  return await redis.get(`qr:${sessionId}`)
}

export async function sendMessage(
  sessionId: string,
  to: string,
  text: string
): Promise<boolean> {
  let sock = sessions.get(sessionId)
  let resolvedId = sessionId

  if (!sock) {
    const ownerPrefix = sessionId.split("-").slice(0, 5).join("-")

    for (const [sid, s] of sessions.entries()) {
      if (sid.startsWith(ownerPrefix)) {
        sock = s
        resolvedId = sid
        break
      }
    }
  }

  if (!sock) {
    logger.warn({ sessionId }, "Sessao nao encontrada em memoria, tentando restaurar")
    sock = await restoreSessionFromStorage(sessionId)

    if (sock) {
      resolvedId = sessionId
      logger.info({ sessionId }, "Sessao restaurada para envio")
    }
  }

  if (!sock) {
    logger.warn({ sessionId }, "Sessao nao encontrada")
    return false
  }

  logger.info({ sessionId, resolvedId }, "sessao resolvida")

  try {
    const original = to.replace(/\D/g, "")
    const candidates: string[] = [original]

    if (original.startsWith("55") && original.length === 12) {
      candidates.unshift(original.slice(0, 4) + "9" + original.slice(4))
    }

    if (
      original.startsWith("55") &&
      original.length === 13 &&
      original[4] === "9"
    ) {
      candidates.push(original.slice(0, 4) + original.slice(5))
    }

    let jid = ""

    for (const candidate of [...new Set(candidates)]) {
      const testJid = `${candidate}@s.whatsapp.net`
      const existsList = await sock.onWhatsApp(testJid)
      const exists = existsList?.[0]

      logger.info(
        {
          candidate,
          testJid,
          existsJid: exists?.jid,
          existsFlag: exists?.exists,
        },
        "checando WhatsApp"
      )

      if (exists?.exists) {
        jid = exists.jid || testJid
        break
      }
    }

    if (!jid) {
      logger.warn({ to: original, candidates }, "Nenhum JID valido encontrado")
      return false
    }

    const result = await sock.sendMessage(jid, { text })
    logger.info({ jid, msgId: result?.key?.id }, "whatsapp enviado")

    return true
  } catch (err) {
    logger.error({ sessionId, err: (err as Error).message }, "Falha ao enviar")
    return false
  }
}

export function getActive(): string[] {
  return Array.from(sessions.keys())
}

async function setStatus(
  sessionId: string,
  ownerId: string,
  status: string
): Promise<void> {
  const { error } = await supabase.from("sessions").upsert({
    session_id: sessionId,
    owner_id: ownerId,
    status,
    updated_at: new Date().toISOString(),
    ...(status === "connected"
      ? { connected_at: new Date().toISOString() }
      : {}),
  })

  if (error) {
    logger.error({ error, sessionId }, "setStatus falhou")
  }
}