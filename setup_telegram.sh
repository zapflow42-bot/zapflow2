#!/usr/bin/env bash
# ============================================================
# setup_telegram.sh
# Roda na raiz do monorepo: ~/zapflow2/
# Instala dependências do sistema, cria o módulo e sobe no PM2
# ============================================================
set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

log()  { echo -e "${GREEN}[SETUP]${RESET} $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
die()  { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

# ── 0. Garantir que estamos na raiz do monorepo ──────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

[[ -f "ecosystem.config.js" ]] || die "Rode este script na raiz do zapflow2 (onde está o ecosystem.config.js)"
log "Diretório: $(pwd)"

# ── 1. Instalar dependências do sistema ──────────────────────────────────────
log "Instalando python3-venv, python3-pip e python3-full..."
sudo apt-get update -qq
sudo apt-get install -y python3-venv python3-pip python3-full

PYTHON=$(command -v python3) || die "python3 não encontrado após instalação"
log "Python: $($PYTHON --version)"

# ── 2. Criar pasta do módulo se não existir ──────────────────────────────────
MODULE_DIR="$SCRIPT_DIR/module-telegram-python"
SRC_DIR="$MODULE_DIR/src"

if [[ -d "$MODULE_DIR" ]]; then
    warn "Pasta $MODULE_DIR já existe — pulando criação de arquivos (não sobrescreve)."
else
    log "Criando estrutura de pastas..."
    mkdir -p "$SRC_DIR"
fi

# ── 3. Criar requirements.txt ────────────────────────────────────────────────
cat > "$MODULE_DIR/requirements.txt" << 'REQS'
telethon==1.36.0
fastapi==0.111.0
uvicorn[standard]==0.30.1
redis[asyncio]==5.0.4
supabase==2.4.6
python-dotenv==1.0.1
pydantic==2.7.1
pydantic-settings==2.3.0
cryptg==0.4.0
REQS
log "requirements.txt criado."

# ── 4. Criar/atualizar todos os arquivos Python ──────────────────────────────
log "Escrevendo arquivos do módulo..."

# config.py
cat > "$SRC_DIR/config.py" << 'PYEOF'
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    telegram_api_id: int = Field(..., env="TELEGRAM_API_ID")
    telegram_api_hash: str = Field(..., env="TELEGRAM_API_HASH")
    redis_url: str = Field("redis://localhost:6379", env="REDIS_URL")
    supabase_url: str = Field(..., env="SUPABASE_URL")
    supabase_service_key: str = Field(..., env="SUPABASE_SERVICE_KEY")
    internal_secret: str = Field("dev-secret-change-in-prod", env="INTERNAL_SECRET")
    port: int = Field(4003, env="TELEGRAM_PORT")
    log_level: str = Field("info", env="LOG_LEVEL")
    node_env: str = Field("development", env="NODE_ENV")

    model_config = {"env_file": "../../.env", "extra": "ignore"}

settings = Settings()
PYEOF

# redis_client.py
cat > "$SRC_DIR/redis_client.py" << 'PYEOF'
import redis.asyncio as aioredis
from config import settings

_pool: aioredis.Redis | None = None

def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
            health_check_interval=30,
        )
    return _pool

async def close_redis() -> None:
    global _pool
    if _pool:
        await _pool.aclose()
        _pool = None
PYEOF

# supabase_client.py
cat > "$SRC_DIR/supabase_client.py" << 'PYEOF'
from supabase import create_client, Client
from config import settings

_client: Client | None = None

def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client
PYEOF

# internal_auth.py
cat > "$SRC_DIR/internal_auth.py" << 'PYEOF'
"""
Replica EXATA do requireInternalAuth do @zapflow/shared Node.js.
Algoritmo: HMAC-SHA256( INTERNAL_SECRET, f"{timestamp}.{json(body)}" )
"""
import hashlib
import hmac
import json
import time
from typing import Any, Optional

from fastapi import Header, HTTPException, Request
from pydantic import BaseModel
from config import settings


class InternalUser(BaseModel):
    uid: str
    role: str
    tenant_id: str


def _sign(body: Any, timestamp: int) -> str:
    body_str = "" if body == "" else json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    payload = f"{timestamp}.{body_str}"
    return hmac.new(
        settings.internal_secret.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()


async def require_internal_auth(
    request: Request,
    x_internal_uid: Optional[str] = Header(default=None),
    x_internal_role: Optional[str] = Header(default=None),
    x_internal_tenant: Optional[str] = Header(default=None),
    x_internal_timestamp: Optional[str] = Header(default=None),
    x_internal_signature: Optional[str] = Header(default=None),
) -> InternalUser:
    if not x_internal_uid or not x_internal_timestamp or not x_internal_signature:
        raise HTTPException(status_code=401, detail="Nao autenticado")

    try:
        timestamp = int(x_internal_timestamp)
    except ValueError:
        raise HTTPException(status_code=401, detail="Timestamp invalido")

    age_ms = int(time.time() * 1000) - timestamp
    if age_ms > 30_000 or age_ms < -5_000:
        raise HTTPException(status_code=401, detail="Timestamp invalido")

    if request.method.upper() == "GET":
        body_for_sig: Any = ""
    else:
        try:
            body_for_sig = await request.json()
        except Exception:
            body_for_sig = {}

    expected = _sign(body_for_sig, timestamp)

    try:
        if not hmac.compare_digest(
            bytes.fromhex(x_internal_signature),
            bytes.fromhex(expected),
        ):
            raise HTTPException(status_code=401, detail="Assinatura invalida")
    except ValueError:
        raise HTTPException(status_code=401, detail="Assinatura invalida")

    return InternalUser(
        uid=x_internal_uid,
        role=x_internal_role or "",
        tenant_id=x_internal_tenant or x_internal_uid,
    )
PYEOF

# session_manager.py
cat > "$SRC_DIR/session_manager.py" << 'PYEOF'
"""
session_manager.py
Gerencia sessões Telegram via Telethon (MTProto User API).
Sessões persistidas no Redis como StringSession.
"""
import asyncio
import logging
from datetime import datetime, timezone
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

_sessions: dict[str, TelegramClient] = {}
_pending:  dict[str, dict] = {}

TTL_PENDING = 300
TTL_META    = 7 * 86400


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


async def _save_session(session_id: str, session_str: str) -> None:
    await get_redis().set(f"tg:session:{session_id}", session_str)

async def _load_session(session_id: str) -> Optional[str]:
    return await get_redis().get(f"tg:session:{session_id}")

async def _delete_session(session_id: str) -> None:
    await get_redis().delete(
        f"tg:session:{session_id}",
        f"tg:owner:{session_id}",
        f"tg:phone:{session_id}",
        f"tg:pending:{session_id}",
    )

async def _save_meta(session_id: str, owner_id: str, phone: str) -> None:
    pipe = get_redis().pipeline()
    pipe.set(f"tg:owner:{session_id}", owner_id, ex=TTL_META)
    pipe.set(f"tg:phone:{session_id}", phone,    ex=TTL_META)
    await pipe.execute()

async def _load_meta(session_id: str) -> tuple[Optional[str], Optional[str]]:
    r = get_redis()
    owner_id, phone = await asyncio.gather(
        r.get(f"tg:owner:{session_id}"),
        r.get(f"tg:phone:{session_id}"),
    )
    if not owner_id or not phone:
        try:
            row = (
                get_supabase()
                .table("telegram_sessions")
                .select("owner_id,phone_number")
                .eq("session_id", session_id)
                .maybe_single()
                .execute()
            )
            if row.data:
                owner_id = owner_id or row.data.get("owner_id")
                phone    = phone    or row.data.get("phone_number")
        except Exception:
            pass
    return owner_id, phone

async def _set_status(session_id: str, owner_id: str, phone: str, status: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    payload: dict = {
        "session_id": session_id, "owner_id": owner_id,
        "phone_number": phone, "status": status, "updated_at": now,
    }
    if status == "connected":
        payload["connected_at"] = now
    try:
        get_supabase().table("telegram_sessions").upsert(
            payload, on_conflict="session_id"
        ).execute()
    except Exception as exc:
        logger.warning("setStatus falhou session=%s err=%s", session_id, exc)


async def start_login(session_id: str, owner_id: str, phone: str) -> None:
    if session_id in _sessions:
        logger.info("Sessão já ativa session=%s", session_id)
        return

    session_str = await _load_session(session_id)
    client = _make_client(session_str or "")
    await client.connect()

    if await client.is_user_authorized():
        _sessions[session_id] = client
        await _save_meta(session_id, owner_id, phone)
        await _set_status(session_id, owner_id, phone, "connected")
        logger.info("Sessão restaurada do Redis session=%s", session_id)
        return

    result = await client(SendCodeRequest(
        phone_number=phone,
        api_id=settings.telegram_api_id,
        api_hash=settings.telegram_api_hash,
        settings=CodeSettings(),
    ))

    _pending[session_id] = {
        "client": client, "phone": phone,
        "phone_hash": result.phone_code_hash, "owner_id": owner_id,
    }
    await get_redis().set(f"tg:pending:{session_id}", phone, ex=TTL_PENDING)
    logger.info("Código enviado session=%s phone=%s", session_id, _mask(phone))


async def confirm_code(session_id: str, code: str) -> None:
    pending = _pending.get(session_id)
    if not pending:
        raise ValueError("Nenhum login pendente para esta sessão")

    client: TelegramClient = pending["client"]
    phone      = pending["phone"]
    phone_hash = pending["phone_hash"]
    owner_id   = pending["owner_id"]

    try:
        await client.sign_in(phone=phone, code=code, phone_code_hash=phone_hash)
    except PhoneCodeInvalidError:
        raise ValueError("Código inválido. Verifique e tente novamente.")
    except PhoneCodeExpiredError:
        raise ValueError("Código expirado. Inicie o login novamente.")
    except SessionPasswordNeededError:
        await client.disconnect()
        _pending.pop(session_id, None)
        await get_redis().delete(f"tg:pending:{session_id}")
        raise ValueError(
            "Esta conta tem 2FA ativo. Desative o 2FA no Telegram ou use um número sem 2FA."
        )

    session_str = client.session.save()
    await _save_session(session_id, session_str)
    await _save_meta(session_id, owner_id, phone)
    _sessions[session_id] = client
    _pending.pop(session_id, None)
    await get_redis().delete(f"tg:pending:{session_id}")
    await _set_status(session_id, owner_id, phone, "connected")
    logger.info("Sessão conectada session=%s phone=%s", session_id, _mask(phone))


async def send_message(session_id: str, to: str, text: str) -> bool:
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
        logger.info("Sessão restaurada para envio session=%s", session_id)

    try:
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


def get_active() -> list[str]:
    return list(_sessions.keys())

async def get_session_status(session_id: str) -> Optional[str]:
    r = get_redis()
    if await r.exists(f"tg:pending:{session_id}"):
        return "pending_code"
    if session_id in _sessions:
        return "connected"
    if await _load_session(session_id):
        return "disconnected"
    return None

async def disconnect_all() -> None:
    for sid, client in list(_sessions.items()):
        try:
            await client.disconnect()
        except Exception:
            pass
    _sessions.clear()

def _mask(n: str) -> str:
    if not n or len(n) <= 6:
        return "****"
    return n[:4] + "****" + n[-2:]
PYEOF

# queue.py
cat > "$SRC_DIR/queue.py" << 'PYEOF'
"""
queue.py — Worker que consome a fila BullMQ "zf-telegram" do Redis.
Compatível com jobs enfileirados pelo Node via bullmq.
"""
import asyncio
import json
import logging
import time

from redis_client import get_redis
from session_manager import send_message
from supabase_client import get_supabase

logger = logging.getLogger("telegram.queue")

QUEUE_NAME    = "zf-telegram"
_WAIT_KEY     = f"bull:{QUEUE_NAME}:wait"
_ACTIVE_KEY   = f"bull:{QUEUE_NAME}:active"
_FAILED_KEY   = f"bull:{QUEUE_NAME}:failed"
_COMPLETE_KEY = f"bull:{QUEUE_NAME}:completed"

MAX_ATTEMPTS  = 3
RATE_MAX      = 30
RATE_WINDOW   = 60
POLL_INTERVAL = 0.5
BACKOFF_BASE  = 3

_running   = False
_sent_ts: list[float] = []


def _mask(n: str) -> str:
    if not n or len(n) <= 6:
        return "****"
    return n[:4] + "****" + n[-2:]


async def _log_supabase(data: dict, ok: bool, attempt: int) -> None:
    field = "sent_count" if ok else "fail_count"
    try:
        sb = get_supabase()
        sb.table("dispatch_logs").insert({
            "campaign_id":  data["campaignId"],
            "owner_id":     data["ownerId"],
            "tenant_id":    data.get("tenantId", ""),
            "channel":      "telegram",
            "to_masked":    _mask(data["to"]),
            "contact_name": data.get("contactName", ""),
            "status":       "sent" if ok else "failed",
            "attempt":      attempt,
        }).execute()
        sb.rpc("telegram_increment_count", {
            "p_campaign_id": data["campaignId"],
            "p_field": field,
        }).execute()
    except Exception as exc:
        logger.warning("Falha silenciosa log/contador err=%s", exc)


async def _process_job(job_id: str, job: dict) -> None:
    data    = job.get("data", job)
    to      = data["to"]
    text    = data["message"]
    sender  = data["senderId"]
    cid     = data.get("campaignId", "")
    attempt = int(data.get("attempt", 0)) + 1

    logger.info("Processando jobId=%s campaignId=%s to=%s attempt=%d",
                job_id, cid, _mask(to), attempt)

    ok = await send_message(sender, to, text)
    await _log_supabase(data, ok, attempt)

    if not ok:
        raise RuntimeError(f"Falha no envio para {_mask(to)}")
    logger.info("✓ Telegram enviado jobId=%s to=%s", job_id, _mask(to))


async def _wait_rate() -> None:
    global _sent_ts
    while True:
        now = time.monotonic()
        _sent_ts = [t for t in _sent_ts if now - t < RATE_WINDOW]
        if len(_sent_ts) < RATE_MAX:
            break
        sleep_for = RATE_WINDOW - (now - _sent_ts[0]) + 0.1
        logger.info("Rate limit — aguardando %.1f s", sleep_for)
        await asyncio.sleep(sleep_for)


async def _worker_loop() -> None:
    global _running, _sent_ts
    r = get_redis()
    logger.info("✈️  Telegram Worker iniciado (Telethon/Python)")

    while _running:
        # peek sem mover
        if not await r.llen(_WAIT_KEY):
            await asyncio.sleep(POLL_INTERVAL)
            continue

        await _wait_rate()

        raw = await r.lmove(_WAIT_KEY, _ACTIVE_KEY, "LEFT", "RIGHT")
        if not raw:
            continue

        try:
            job = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("Job malformado: %s", raw[:100])
            await r.lrem(_ACTIVE_KEY, 0, raw)
            continue

        job_id = job.get("id", "unknown")
        attempts_made = int(job.get("attemptsMade", 0))

        try:
            await _process_job(job_id, job)
            # ack completed
            now_ms = int(time.time() * 1000)
            pipe = r.pipeline()
            pipe.lrem(_ACTIVE_KEY, 0, raw)
            pipe.zadd(_COMPLETE_KEY, {raw: now_ms})
            pipe.zremrangebyrank(_COMPLETE_KEY, 0, -1001)
            await pipe.execute()
            _sent_ts.append(time.monotonic())

        except Exception as exc:
            attempts_made += 1
            logger.error("Job falhou jobId=%s attempt=%d err=%s", job_id, attempts_made, exc)
            await r.lrem(_ACTIVE_KEY, 0, raw)

            if attempts_made < MAX_ATTEMPTS:
                delay = BACKOFF_BASE ** attempts_made
                job["attemptsMade"] = attempts_made
                if "data" in job:
                    job["data"]["attempt"] = attempts_made
                updated = json.dumps(job, ensure_ascii=False)
                logger.info("Reagendando jobId=%s em %ds", job_id, delay)
                await asyncio.sleep(delay)
                await r.rpush(_WAIT_KEY, updated)
            else:
                now_ms = int(time.time() * 1000)
                pipe = r.pipeline()
                pipe.zadd(_FAILED_KEY, {raw: now_ms})
                pipe.zremrangebyrank(_FAILED_KEY, 0, -501)
                await pipe.execute()
                logger.error("Job esgotou tentativas jobId=%s", job_id)


async def start_worker() -> None:
    global _running
    _running = True
    asyncio.create_task(_worker_loop())


async def stop_worker() -> None:
    global _running
    _running = False


async def get_queue_stats() -> dict:
    r = get_redis()
    return {
        "waiting":   await r.llen(_WAIT_KEY),
        "active":    await r.llen(_ACTIVE_KEY),
        "completed": await r.zcard(_COMPLETE_KEY),
        "failed":    await r.zcard(_FAILED_KEY),
    }
PYEOF

# routes.py
cat > "$SRC_DIR/routes.py" << 'PYEOF'
"""
routes.py — Endpoints HTTP espelhando 100% o module-whatsapp Node.
"""
import json
import time
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, field_validator

from internal_auth import InternalUser, require_internal_auth
from session_manager import start_login, confirm_code, get_session_status, get_active
from queue import get_queue_stats
from redis_client import get_redis

logger = logging.getLogger("telegram.routes")
router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "module": "telegram-telethon", "sessions": len(get_active())}


@router.get("/sessions")
async def list_sessions(user: InternalUser = Depends(require_internal_auth)):
    return {"sessions": [s for s in get_active() if s.startswith(user.uid)]}


class StartLoginBody(BaseModel):
    sessionId:   str
    phoneNumber: str

    @field_validator("phoneNumber")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) < 8:
            raise ValueError("phoneNumber deve ter pelo menos 8 dígitos")
        return digits


@router.post("/session")
async def session_start(body: StartLoginBody, user: InternalUser = Depends(require_internal_auth)):
    if not body.sessionId.startswith(user.uid):
        raise HTTPException(status_code=403, detail="sessionId inválido")
    try:
        await start_login(body.sessionId, user.uid, body.phoneNumber)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"message": "Código enviado para o celular — aguardando confirmação"}


class ConfirmCodeBody(BaseModel):
    sessionId: str
    code:      str
    password:  Optional[str] = None


@router.post("/session/confirm")
async def session_confirm(body: ConfirmCodeBody, user: InternalUser = Depends(require_internal_auth)):
    if not body.sessionId.startswith(user.uid):
        raise HTTPException(status_code=403, detail="sessionId inválido")
    try:
        await confirm_code(body.sessionId, body.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"message": "Sessão Telegram conectada com sucesso!"}


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
    return {"status": status}


class MessageItem(BaseModel):
    jobId:       str
    to:          str
    contactName: str
    message:     str
    senderId:    str
    delay:       int

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


@router.post("/enqueue")
async def enqueue(body: EnqueueBody, user: InternalUser = Depends(require_internal_auth)):
    r = get_redis()
    queue_key   = "bull:zf-telegram:wait"
    delayed_key = "bull:zf-telegram:delayed"
    now_ms = int(time.time() * 1000)

    pipe = r.pipeline()
    for msg in body.messages:
        payload = json.dumps({
            "id": msg.jobId, "attemptsMade": 0, "timestamp": now_ms,
            "opts": {"delay": msg.delay, "attempts": 3, "backoff": {"type": "exponential", "delay": 3000}},
            "data": {
                "jobId": msg.jobId, "campaignId": body.campaignId,
                "ownerId": user.uid, "tenantId": user.tenant_id,
                "to": msg.to, "contactName": msg.contactName,
                "message": msg.message, "senderId": msg.senderId,
                "channelType": "telegram", "attempt": 0,
            },
        }, ensure_ascii=False)

        if msg.delay > 0:
            pipe.zadd(delayed_key, {payload: now_ms + msg.delay})
        else:
            pipe.rpush(queue_key, payload)

    await pipe.execute()
    return {"enqueued": len(body.messages)}


@router.get("/stats")
async def stats(_user: InternalUser = Depends(require_internal_auth)):
    return await get_queue_stats()
PYEOF

# main.py
cat > "$SRC_DIR/main.py" << 'PYEOF'
import asyncio
import logging
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from config import settings
from redis_client import close_redis
from session_manager import disconnect_all
from queue import start_worker, stop_worker
from routes import router

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("telegram.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("✈️  Module Telegram Telethon → http://0.0.0.0:%d", settings.port)
    await start_worker()
    yield
    logger.info("Encerrando module-telegram…")
    await stop_worker()
    await disconnect_all()
    await close_redis()


app = FastAPI(
    title="ZapFlow — Module Telegram",
    version="2.0.0",
    docs_url="/docs" if settings.node_env != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)
app.include_router(router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=settings.port,
                log_level=settings.log_level.lower(), access_log=True)
PYEOF

log "Todos os arquivos Python escritos."

# ── 5. Criar virtualenv e instalar pacotes ───────────────────────────────────
log "Criando virtualenv em $MODULE_DIR/venv..."
$PYTHON -m venv "$MODULE_DIR/venv"

log "Instalando pacotes Python (pode levar 1-2 min)..."
"$MODULE_DIR/venv/bin/pip" install --upgrade pip -q
"$MODULE_DIR/venv/bin/pip" install -r "$MODULE_DIR/requirements.txt"

log "Pacotes instalados:"
"$MODULE_DIR/venv/bin/pip" list --format=columns | grep -E "telethon|fastapi|uvicorn|redis|supabase|pydantic"

# ── 6. Atualizar ecosystem.config.js ────────────────────────────────────────
VENV_PYTHON="$MODULE_DIR/venv/bin/python"

log "Atualizando ecosystem.config.js (entrada module-telegram)..."

# Faz backup do original
cp ecosystem.config.js ecosystem.config.js.bak

# Substitui a entrada module-telegram usando node inline
node - << JSEOF
const fs   = require("fs")
const path = require("path")
const file = path.join(process.cwd(), "ecosystem.config.js")
let src = fs.readFileSync(file, "utf8")

// Substitui o bloco do module-telegram
const newBlock = \`    {
      // ── module-telegram — Python + Telethon ──────────────────────────
      name:            "module-telegram",
      script:          "src/main.py",
      cwd:             "./module-telegram-python",
      interpreter:     "./module-telegram-python/venv/bin/python",
      env_file:        ".env",
      env:             { TELEGRAM_PORT: 4003 },
      autorestart:     true,
      max_restarts:    10,
      restart_delay:   3000,
      watch:           false,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    }\`

// Regex que pega o bloco inteiro do module-telegram (entre { e o }, seguinte)
src = src.replace(
  /\{[^{}]*name\s*:\s*["']module-telegram["'][^{}]*\}/s,
  newBlock
)
fs.writeFileSync(file, src, "utf8")
console.log("ecosystem.config.js atualizado.")
JSEOF

# ── 7. Reiniciar o módulo no PM2 ─────────────────────────────────────────────
log "Reiniciando module-telegram no PM2..."
pm2 delete module-telegram 2>/dev/null || true
pm2 start ecosystem.config.js --only module-telegram
pm2 save

# ── 8. Status final ──────────────────────────────────────────────────────────
echo ""
log "✅  Setup completo! Status dos processos:"
pm2 status

echo ""
echo -e "${BOLD}Próximos passos:${RESET}"
echo -e "  1. Verifique que ${YELLOW}TELEGRAM_API_ID${RESET} e ${YELLOW}TELEGRAM_API_HASH${RESET} estão no .env"
echo -e "     Obtenha em: https://my.telegram.org/apps"
echo -e "  2. Acompanhe os logs:"
echo -e "     ${YELLOW}pm2 logs module-telegram --lines 50${RESET}"
echo -e "  3. Se o módulo travar, verifique: ${YELLOW}pm2 monit${RESET}"