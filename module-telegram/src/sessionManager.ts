/**
 * module-telegram/src/sessionManager.ts
 *
 * Gerencia sessões Telegram via MTProto (GramJS) — User API, não Bot.
 * Fluxo idêntico ao WhatsApp:
 *   1. Frontend pede /session → gera código SMS/app
 *   2. Frontend envia /session/confirm com o código → sessão conecta
 *   3. /qr/:sessionId → retorna status + phone number confirmado
 *   4. sendMessage(sessionId, phone, text) → envia como usuário real
 */

import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions"
import { Api } from "telegram"
import { redis, supabase, logger } from "@zapflow/shared"
import path from "path"
import fs from "fs"

// ── Armazenamento em memória ────────────────────────────────────────────────
const sessions = new Map<string, TelegramClient>()

// Sessões aguardando confirmação do código SMS
const pendingAuth = new Map<string, {
  client:      TelegramClient
  phoneNumber: string
  phoneHash:   string
  ownerId:     string
}>()

const SESSION_DIR = process.env.TG_SESSION_DIR
  ?? path.join(process.cwd(), ".tg-sessions")

fs.mkdirSync(SESSION_DIR, { recursive: true })

function sessionFilePath(sessionId: string): string {
  return path.join(SESSION_DIR, `${sessionId}.session`)
}

function loadStringSession(sessionId: string): string {
  const fp = sessionFilePath(sessionId)
  if (fs.existsSync(fp)) return fs.readFileSync(fp, "utf8").trim()
  return ""
}

function saveStringSession(sessionId: string, str: string): void {
  fs.writeFileSync(sessionFilePath(sessionId), str, "utf8")
}

// ── Criar cliente GramJS ────────────────────────────────────────────────────
function makeClient(sessionStr = ""): TelegramClient {
  const apiId   = Number(process.env.TELEGRAM_API_ID)
  const apiHash = process.env.TELEGRAM_API_HASH ?? ""

  if (!apiId || !apiHash) {
    throw new Error("TELEGRAM_API_ID e TELEGRAM_API_HASH são obrigatórios no .env")
  }

  return new TelegramClient(
    new StringSession(sessionStr),
    apiId,
    apiHash,
    {
      connectionRetries: 5,
      deviceModel:       "ZapFlow",
      systemVersion:     "Linux",
      appVersion:        "2.0.0",
      langCode:          "pt",
    }
  )
}

// ── Passo 1 — iniciar login (envia código para o celular) ───────────────────
export async function startLogin(
  sessionId: string,
  ownerId:   string,
  phone:     string
): Promise<void> {
  // Se já existe sessão ativa, não faz nada
  if (sessions.has(sessionId)) {
    logger.info({ sessionId }, "Sessão Telegram já ativa")
    return
  }

  const savedStr = loadStringSession(sessionId)
  const client   = makeClient(savedStr)

  await client.connect()

  if (await client.isUserAuthorized()) {
    // Sessão salva em disco ainda é válida — restaura direto
    sessions.set(sessionId, client)
    await setStatus(sessionId, ownerId, phone, "connected")
    logger.info({ sessionId, phone }, "Sessão Telegram restaurada do disco")
    return
  }

  // Solicita o código ao Telegram
  const { phoneCodeHash } = await client.sendCode(
    { apiId: Number(process.env.TELEGRAM_API_ID), apiHash: process.env.TELEGRAM_API_HASH! },
    phone
  )

  pendingAuth.set(sessionId, { client, phoneNumber: phone, phoneHash: phoneCodeHash, ownerId })

  // Salva no Redis para o frontend saber que está aguardando código
  await redis.set(`tg:pending:${sessionId}`, phone, "EX", 300)

  logger.info({ sessionId, phone }, "Código Telegram enviado — aguardando confirmação")
}

// ── Passo 2 — confirmar código recebido no celular/app ──────────────────────
export async function confirmCode(
  sessionId: string,
  code:      string,
  password?: string   // 2FA — se a conta tiver senha de dois fatores
): Promise<void> {
  const pending = pendingAuth.get(sessionId)
  if (!pending) throw new Error("Nenhum login pendente para esta sessão")

  const { client, phoneNumber, phoneHash, ownerId } = pending

  try {
    await client.invoke(new Api.auth.SignIn({
      phoneNumber,
      phoneCodeHash: phoneHash,
      phoneCode:     code,
    }))
  } catch (err: any) {
    // Conta com 2FA — envia senha
    if (err?.message?.includes("SESSION_PASSWORD_NEEDED")) {
      if (!password) throw new Error("Esta conta tem 2FA. Envie a senha no campo 'password'.")
      const { SRPParams } = await client.invoke(new Api.account.GetPassword())
      // @ts-ignore — computeCheck existe no gramjs mas falta tipagem
      const check = await (client as any).computePasswordSRP(SRPParams, password)
      await client.invoke(new Api.auth.CheckPassword({ password: check }))
    } else {
      throw err
    }
  }

  // Persiste a session string em disco (como o WhatsApp persiste .wa-auth)
  const sessionStr = (client.session as StringSession).save()
  saveStringSession(sessionId, sessionStr)

  sessions.set(sessionId, client)
  pendingAuth.delete(sessionId)
  await redis.del(`tg:pending:${sessionId}`)

  await setStatus(sessionId, ownerId, phoneNumber, "connected")
  logger.info({ sessionId, phoneNumber }, "Sessão Telegram conectada com sucesso")
}

// ── Enviar mensagem por número de telefone ──────────────────────────────────
export async function sendMessage(
  sessionId: string,
  to:        string,   // número E.164: 5581994900228
  text:      string
): Promise<boolean> {
  let client = sessions.get(sessionId)

  if (!client) {
    // Tenta restaurar do disco
    const savedStr = loadStringSession(sessionId)
    if (!savedStr) {
      logger.warn({ sessionId }, "Sessão Telegram não encontrada")
      return false
    }

    const { data } = await supabase
      .from("telegram_sessions")
      .select("owner_id,phone_number")
      .eq("session_id", sessionId)
      .maybeSingle()

    if (!data?.owner_id) {
      logger.warn({ sessionId }, "owner_id não encontrado no Supabase")
      return false
    }

    client = makeClient(savedStr)
    await client.connect()

    if (!(await client.isUserAuthorized())) {
      logger.warn({ sessionId }, "Sessão expirada — reconectar necessário")
      await setStatus(sessionId, data.owner_id, data.phone_number, "disconnected")
      sessions.delete(sessionId)
      return false
    }

    sessions.set(sessionId, client)
    logger.info({ sessionId }, "Sessão Telegram restaurada para envio")
  }

  try {
    // GramJS aceita o número com + ou sem — normaliza aqui
    const recipient = to.startsWith("+") ? to : `+${to}`
    await client.sendMessage(recipient, { message: text })
    logger.info({ sessionId, to: maskPhone(to) }, "✓ Telegram MTProto enviado")
    return true
  } catch (err: any) {
    logger.error({ sessionId, to: maskPhone(to), err: err.message }, "✗ Falha Telegram")

    // Sessão revogada remotamente
    if (err?.message?.includes("AUTH_KEY_UNREGISTERED") ||
        err?.message?.includes("SESSION_REVOKED")) {
      sessions.delete(sessionId)
      const { data } = await supabase
        .from("telegram_sessions")
        .select("owner_id,phone_number")
        .eq("session_id", sessionId)
        .maybeSingle()
      if (data) await setStatus(sessionId, data.owner_id, data.phone_number, "disconnected")
    }

    return false
  }
}

// ── Utilitários ─────────────────────────────────────────────────────────────
export function getActive(): string[] {
  return Array.from(sessions.keys())
}

export async function getSessionStatus(sessionId: string): Promise<string | null> {
  const pending = await redis.get(`tg:pending:${sessionId}`)
  if (pending) return "pending_code"

  if (sessions.has(sessionId)) return "connected"

  const savedStr = loadStringSession(sessionId)
  if (savedStr) return "disconnected"   // existe em disco mas não na memória

  return null
}

async function setStatus(
  sessionId:   string,
  ownerId:     string,
  phoneNumber: string,
  status:      string
): Promise<void> {
  const { error } = await supabase.from("telegram_sessions").upsert({
    session_id:   sessionId,
    owner_id:     ownerId,
    phone_number: phoneNumber,
    status,
    updated_at:   new Date().toISOString(),
    ...(status === "connected"
      ? { connected_at: new Date().toISOString() }
      : {}),
  }, { onConflict: "session_id" })

  if (error) logger.error({ error, sessionId }, "setStatus Telegram falhou")
}

const maskPhone = (n: string) =>
  n.length <= 6 ? "****" : n.slice(0, 4) + "****" + n.slice(-2)
