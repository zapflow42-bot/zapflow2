"""
routes.py — Endpoints HTTP do module-telegram Python.

Espelham 100% o contrato do module-whatsapp Node:
  GET  /health
  GET  /sessions
  POST /session          → inicia login (envia código)
  POST /session/confirm  → confirma código
  GET  /qr/:sessionId    → status da sessão (rota /qr reutilizada pelo frontend)
  POST /enqueue          → enfileira disparos
  GET  /stats            → estatísticas da fila
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, field_validator

from internal_auth import InternalUser, require_internal_auth
from session_manager import (
    start_login,
    confirm_code,
    get_session_status,
    get_active,
)
from worker import get_queue_stats, start_worker
from redis_client import get_redis

logger = logging.getLogger("telegram.routes")
router = APIRouter()


# ── /health ──────────────────────────────────────────────────────────────────
@router.get("/health")
async def health():
    """Isento de auth interna — igual ao Node."""
    return {
        "status":   "ok",
        "module":   "telegram-telethon",
        "sessions": len(get_active()),
    }


# ── /sessions ────────────────────────────────────────────────────────────────
@router.get("/sessions")
async def list_sessions(user: InternalUser = Depends(require_internal_auth)):
    active = get_active()
    return {"sessions": [s for s in active if s.startswith(user.uid)]}


# ── POST /session — passo 1 ──────────────────────────────────────────────────
class StartLoginBody(BaseModel):
    sessionId:   str
    phoneNumber: str

    @field_validator("phoneNumber")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) < 8:
            raise ValueError("phoneNumber deve ter pelo menos 8 dígitos")
        return digits   # normaliza: apenas dígitos


@router.post("/session")
async def session_start(
    body: StartLoginBody,
    user: InternalUser = Depends(require_internal_auth),
):
    if not body.sessionId.startswith(user.uid):
        raise HTTPException(status_code=403, detail="sessionId inválido")

    try:
        await start_login(body.sessionId, user.uid, body.phoneNumber)
    except Exception as exc:
        logger.error("startLogin falhou session=%s err=%s", body.sessionId, exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return {"message": "Código enviado para o celular — aguardando confirmação"}


# ── POST /session/confirm — passo 2 ──────────────────────────────────────────
class ConfirmCodeBody(BaseModel):
    sessionId: str
    code:      str
    password:  Optional[str] = None   # ignorado (sem 2FA por ora)


@router.post("/session/confirm")
async def session_confirm(
    body: ConfirmCodeBody,
    user: InternalUser = Depends(require_internal_auth),
):
    if not body.sessionId.startswith(user.uid):
        raise HTTPException(status_code=403, detail="sessionId inválido")

    try:
        await confirm_code(body.sessionId, body.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("confirmCode falhou session=%s err=%s", body.sessionId, exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return {"message": "Sessão Telegram conectada com sucesso!"}


# ── GET /qr/:sessionId — status (rota reutilizada pelo frontend) ──────────────
@router.get("/qr/{session_id}")
async def session_status(
    session_id: str = Path(...),
    user: InternalUser = Depends(require_internal_auth),
):
    if not session_id.startswith(user.uid):
        raise HTTPException(status_code=403, detail="Acesso negado")

    status = await get_session_status(session_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    return {"status": status}  # "connected" | "pending_code" | "disconnected"


# ── POST /enqueue ────────────────────────────────────────────────────────────
class MessageItem(BaseModel):
    jobId:       str
    to:          str
    contactName: str
    message:     str
    senderId:    str    # sessionId do chip Telegram
    delay:       int    # ms

    @field_validator("to")
    @classmethod
    def validate_to(cls, v: str) -> str:
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) < 8:
            raise ValueError("'to' deve ter pelo menos 8 dígitos")
        return digits


class EnqueueBody(BaseModel):
    campaignId: str
    messages:   list[MessageItem]

    @field_validator("messages")
    @classmethod
    def validate_messages(cls, v: list) -> list:
        if not v:
            raise ValueError("messages não pode ser vazio")
        if len(v) > 10_000:
            raise ValueError("máximo de 10.000 mensagens por lote")
        return v


@router.post("/enqueue")
async def enqueue(
    body: EnqueueBody,
    user: InternalUser = Depends(require_internal_auth),
):
    import asyncio, json, time
    r = get_redis()
    queue_key = "bull:zf-telegram:wait"
    now_ms = int(time.time() * 1000)

    pipe = r.pipeline()
    for msg in body.messages:
        job_payload = json.dumps({
            "id":          msg.jobId,
            "attemptsMade": 0,
            "timestamp":   now_ms,
            "opts": {
                "delay":    msg.delay,
                "attempts": 3,
                "backoff":  {"type": "exponential", "delay": 3000},
            },
            "data": {
                "jobId":       msg.jobId,
                "campaignId":  body.campaignId,
                "ownerId":     user.uid,
                "tenantId":    user.tenant_id,
                "to":          msg.to,
                "contactName": msg.contactName,
                "message":     msg.message,
                "senderId":    msg.senderId,
                "channelType": "telegram",
                "attempt":     0,
            },
        }, ensure_ascii=False)

        if msg.delay > 0:
            # Jobs com delay: usa sorted set "delayed" do BullMQ
            delayed_key = "bull:zf-telegram:delayed"
            score = now_ms + msg.delay
            pipe.zadd(delayed_key, {job_payload: score})
        else:
            pipe.rpush(queue_key, job_payload)

    await pipe.execute()
    return {"enqueued": len(body.messages)}


# ── GET /stats ────────────────────────────────────────────────────────────────
@router.get("/stats")
async def stats(_user: InternalUser = Depends(require_internal_auth)):
    return await get_queue_stats()
