"""
session_manager.py

Gerencia sessões Telegram via Telethon (MTProto User API, NÃO bot).
As sessões são serializadas como string e armazenadas no Redis —
igual ao padrão do module-whatsapp que salva credenciais no Redis.

Fluxo (idêntico ao WhatsApp):
  1. POST /session        → startLogin()   → envia código SMS/app
  2. POST /session/confirm → confirmCode() → autentica e persiste sessão
  3. GET  /qr/:sessionId  → getSessionStatus()
  4. Worker chama         → sendMessage()

Chaves Redis usadas:
  tg:session:<sessionId>   → StringSession serializada (sem TTL — persiste)
  tg:pending:<sessionId>   → phone_hash aguardando código (TTL 300s)
  tg:owner:<sessionId>     → owner_id mapeado (TTL 7 dias)
  tg:phone:<sessionId>     → número do chip (TTL 7 dias)
"""
import asyncio
import logging
from typing import Optional

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import (
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    SessionPasswordNeededError,
    AuthKeyUnregisteredError,
    UserDeactivatedBanError,
)
from telethon.tl.functions.auth import SendCodeRequest
from telethon.tl.types import CodeSettings

from config import settings
from redis_client import get_redis
from supabase_client import get_supabase

logger = logging.getLogger("telegram.session")

# ── Sessões vivas em memória ─────────────────────────────────────────────────
# sessionId → TelegramClient autenticado
_sessions: dict[str, TelegramClient] = {}

# Sessões no meio do login (aguardando código)
# sessionId → {"client": TelegramClient, "phone": str, "phone_hash": str, "owner_id": str}
_pending: dict[str, dict] = {}

TTL_PENDING = 300       # 5 min para digitar o código
TTL_SESSION = 7 * 86400 # 7 dias para owner/phone lookup


# ── Fábrica de cliente ───────────────────────────────────────────────────────
def _make_client(session_str: str = "") -> TelegramClient:
    return TelegramClient(
        StringSession(session_str),
        settings.telegram_api_id,
        settings.telegram_api_hash,
        device_model="ZapFlow",
        system_version="Linux",
        app_version="2.0.0",
        lang_code="pt",
        system_lang_code="pt-BR",
    )


# ── Persistência Redis ───────────────────────────────────────────────────────
async def _save_session(session_id: str, session_str: str) -> None:
    r = get_redis()
    await r.set(f"tg:session:{session_id}", session_str)  # sem TTL — persiste


async def _load_session(session_id: str) -> Optional[str]:
    r = get_redis()
    return await r.get(f"tg:session:{session_id}")


async def _delete_session(session_id: str) -> None:
    r = get_redis()
    await r.delete(
        f"tg:session:{session_id}",
        f"tg:owner:{session_id}",
        f"tg:phone:{session_id}",
        f"tg:pending:{session_id}",
    )


async def _save_meta(session_id: str, owner_id: str, phone: str) -> None:
    r = get_redis()
    pipe = r.pipeline()
    pipe.set(f"tg:owner:{session_id}", owner_id, ex=TTL_SESSION)
    pipe.set(f"tg:phone:{session_id}", phone,    ex=TTL_SESSION)
    await pipe.execute()


async def _load_meta(session_id: str) -> tuple[Optional[str], Optional[str]]:
    r = get_redis()
    owner_id, phone = await asyncio.gather(
        r.get(f"tg:owner:{session_id}"),
        r.get(f"tg:phone:{session_id}"),
    )
    # fallback: Supabase se Redis expirou
    if not owner_id or not phone:
        sb = get_supabase()
        row = (
            sb.table("telegram_sessions")
            .select("owner_id,phone_number")
            .eq("session_id", session_id)
            .maybe_single()
            .execute()
        )
        if row.data:
            owner_id = owner_id or row.data.get("owner_id")
            phone    = phone    or row.data.get("phone_number")
    return owner_id, phone


# ── Supabase — status ────────────────────────────────────────────────────────
async def _set_status(session_id: str, owner_id: str, phone: str, status: str) -> None:
    from datetime import datetime, timezone
    sb = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    payload: dict = {
        "session_id":   session_id,
        "owner_id":     owner_id,
        "phone_number": phone,
        "status":       status,
        "updated_at":   now,
    }
    if status == "connected":
        payload["connected_at"] = now

    try:
        sb.table("telegram_sessions").upsert(payload, on_conflict="session_id").execute()
    except Exception as exc:
        logger.warning("setStatus falhou session=%s err=%s", session_id, exc)


# ── Passo 1 — iniciar login ──────────────────────────────────────────────────
async def start_login(session_id: str, owner_id: str, phone: str) -> None:
    """
    Envia o código de verificação para o número.
    Se a sessão já está ativa (Redis tem StringSession válida), restaura direto.
    """
    if session_id in _sessions:
        logger.info("Sessão já ativa em memória session=%s", session_id)
        return

    session_str = await _load_session(session_id)
    client = _make_client(session_str or "")

    await client.connect()

    if await client.is_user_authorized():
        # Sessão Redis ainda válida — restaura sem pedir código
        _sessions[session_id] = client
        await _save_meta(session_id, owner_id, phone)
        await _set_status(session_id, owner_id, phone, "connected")
        logger.info("Sessão Telegram restaurada do Redis session=%s phone=%s", session_id, phone)
        return

    # Solicita o código
    result = await client(SendCodeRequest(
        phone_number=phone,
        api_id=settings.telegram_api_id,
        api_hash=settings.telegram_api_hash,
        settings=CodeSettings(),
    ))

    _pending[session_id] = {
        "client":     client,
        "phone":      phone,
        "phone_hash": result.phone_code_hash,
        "owner_id":   owner_id,
    }

    r = get_redis()
    await r.set(f"tg:pending:{session_id}", phone, ex=TTL_PENDING)

    logger.info("Código Telegram enviado session=%s phone=%s", session_id, _mask(phone))


# ── Passo 2 — confirmar código ───────────────────────────────────────────────
async def confirm_code(session_id: str, code: str) -> None:
    """
    Confirma o código recebido no app/SMS e persiste a sessão no Redis.
    Lança exceções descritivas para o caller tratar via HTTP 400.
    """
    pending = _pending.get(session_id)
    if not pending:
        raise ValueError("Nenhum login pendente para esta sessão")

    client: TelegramClient = pending["client"]
    phone: str             = pending["phone"]
    phone_hash: str        = pending["phone_hash"]
    owner_id: str          = pending["owner_id"]

    try:
        await client.sign_in(phone=phone, code=code, phone_code_hash=phone_hash)

    except PhoneCodeInvalidError:
        raise ValueError("Código inválido. Verifique e tente novamente.")
    except PhoneCodeExpiredError:
        raise ValueError("Código expirado. Inicie o login novamente.")
    except SessionPasswordNeededError:
        # 2FA — por enquanto não suportado (decisão do usuário)
        await client.disconnect()
        _pending.pop(session_id, None)
        r = get_redis()
        await r.delete(f"tg:pending:{session_id}")
        raise ValueError(
            "Esta conta tem verificação em dois fatores (2FA). "
            "Desative o 2FA no Telegram ou use um número sem 2FA."
        )

    # Serializa e salva no Redis
    session_str = client.session.save()
    await _save_session(session_id, session_str)
    await _save_meta(session_id, owner_id, phone)

    _sessions[session_id] = client
    _pending.pop(session_id, None)

    r = get_redis()
    await r.delete(f"tg:pending:{session_id}")

    await _set_status(session_id, owner_id, phone, "connected")
    logger.info("Sessão Telegram conectada session=%s phone=%s", session_id, _mask(phone))


# ── Enviar mensagem ──────────────────────────────────────────────────────────
async def send_message(session_id: str, to: str, text: str) -> bool:
    """
    Envia mensagem usando a sessão do chip.
    Restaura automaticamente do Redis se não estiver em memória.
    Retorna True em sucesso, False em falha (worker lança exceção se False).
    """
    client = _sessions.get(session_id)

    if client is None:
        session_str = await _load_session(session_id)
        if not session_str:
            logger.warning("Sessão não encontrada session=%s", session_id)
            return False

        owner_id, phone = await _load_meta(session_id)
        if not owner_id:
            logger.warning("owner_id não encontrado session=%s", session_id)
            return False

        client = _make_client(session_str)
        await client.connect()

        if not await client.is_user_authorized():
            logger.warning("Sessão expirada session=%s", session_id)
            await _set_status(session_id, owner_id, phone or "", "disconnected")
            await _delete_session(session_id)
            return False

        _sessions[session_id] = client
        logger.info("Sessão Telegram restaurada para envio session=%s", session_id)

    try:
        # Telethon aceita número E.164 com ou sem +
        recipient = to if to.startswith("+") else f"+{to}"
        await client.send_message(recipient, text)
        logger.info("✓ Telegram enviado session=%s to=%s", session_id, _mask(to))
        return True

    except (AuthKeyUnregisteredError, UserDeactivatedBanError) as exc:
        logger.error("Sessão revogada session=%s err=%s", session_id, exc)
        _sessions.pop(session_id, None)
        owner_id, phone = await _load_meta(session_id)
        if owner_id:
            await _set_status(session_id, owner_id, phone or "", "disconnected")
        await _delete_session(session_id)
        return False

    except Exception as exc:
        logger.error("✗ Falha Telegram session=%s to=%s err=%s", session_id, _mask(to), exc)
        return False


# ── Utilitários ──────────────────────────────────────────────────────────────
def get_active() -> list[str]:
    return list(_sessions.keys())


async def get_session_status(session_id: str) -> Optional[str]:
    r = get_redis()

    if await r.exists(f"tg:pending:{session_id}"):
        return "pending_code"

    if session_id in _sessions:
        return "connected"

    session_str = await _load_session(session_id)
    if session_str:
        return "disconnected"  # existe no Redis mas não na memória

    return None


async def disconnect_all() -> None:
    """Chamado no shutdown — desconecta todos os clientes graciosamente."""
    for sid, client in list(_sessions.items()):
        try:
            await client.disconnect()
            logger.info("Sessão desconectada no shutdown session=%s", sid)
        except Exception:
            pass
    _sessions.clear()


def _mask(n: str) -> str:
    if not n or len(n) <= 6:
        return "****"
    return n[:4] + "****" + n[-2:]
