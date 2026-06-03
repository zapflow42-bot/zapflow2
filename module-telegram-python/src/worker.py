"""
queue.py — Worker que consome a fila BullMQ "zf-telegram" do Redis.

O gateway Node.js/BullMQ enfileira jobs com este schema (DispatchJob):
  jobId, campaignId, ownerId, tenantId, to, contactName,
  message, senderId (= sessionId do chip), channelType, attempt

Este worker Python lê a fila diretamente do Redis usando o protocolo
BullMQ (chaves bull:<queue>:*) e chama send_message() do session_manager.

Limites espelham o module-whatsapp:
  concurrency = 1 (um envio por vez por worker)
  rate        = 30 mensagens / 60 s por fila

Nota: usamos bullmq-python (wrapper oficial) para compatibilidade total
com o formato de job do BullMQ Node, incluindo retry exponencial.
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from redis_client import get_redis
from session_manager import send_message
from supabase_client import get_supabase

logger = logging.getLogger("telegram.queue")

QUEUE_NAME = "zf-telegram"

# Chaves BullMQ no Redis
_WAIT_KEY    = f"bull:{QUEUE_NAME}:wait"
_ACTIVE_KEY  = f"bull:{QUEUE_NAME}:active"
_FAILED_KEY  = f"bull:{QUEUE_NAME}:failed"
_COMPLETE_KEY = f"bull:{QUEUE_NAME}:completed"


def _mask(n: str) -> str:
    if not n or len(n) <= 6:
        return "****"
    return n[:4] + "****" + n[-2:]


async def _log_to_supabase(data: dict, ok: bool, attempt: int) -> None:
    field = "sent_count" if ok else "fail_count"
    sb = get_supabase()
    try:
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
            "p_field":       field,
        }).execute()
    except Exception as exc:
        logger.warning("Falha silenciosa ao gravar log/contador err=%s", exc)


async def _process_job(job_id: str, job_data: dict) -> None:
    """Processa um job individual."""
    data   = job_data.get("data", job_data)   # BullMQ embute em .data
    to     = data["to"]
    msg    = data["message"]
    sender = data["senderId"]
    cid    = data.get("campaignId", "")
    attempt = int(data.get("attempt", 0)) + 1

    masked = _mask(to)
    logger.info("Processando envio Telegram jobId=%s campaignId=%s to=%s attempt=%d",
                job_id, cid, masked, attempt)

    ok = await send_message(sender, to, msg)

    await _log_to_supabase(data, ok, attempt)

    if ok:
        logger.info("✓ Telegram enviado jobId=%s campaignId=%s to=%s", job_id, cid, masked)
    else:
        raise RuntimeError(f"Falha no envio para {masked}")


# ── Worker loop ──────────────────────────────────────────────────────────────
class TelegramWorker:
    """
    Worker assíncrono que consome a fila BullMQ diretamente do Redis.

    Implementa o protocolo BullMQ v4/v5:
      - LMOVE wait → active  (move job atomicamente)
      - EXPIRE active key    (lock duration = 120 s)
      - Processa job
      - LREM active / ZADD completed|failed
      - Retry com backoff exponencial (max 3 tentativas)

    rate_limit: max 30 jobs por janela de 60 s (igual ao worker Node).
    """

    MAX_ATTEMPTS    = 3
    LOCK_DURATION   = 120      # segundos
    RATE_MAX        = 30
    RATE_WINDOW     = 60       # segundos
    POLL_INTERVAL   = 0.5      # s — intervalo quando fila vazia
    BACKOFF_BASE    = 3        # s — backoff exponencial inicial

    def __init__(self) -> None:
        self._running   = False
        self._sent_ts: list[float] = []   # timestamps dos últimos envios (rate limiter)

    async def start(self) -> None:
        self._running = True
        logger.info("✈️  Telegram Worker iniciado (Telethon / Python)")
        await self._loop()

    async def stop(self) -> None:
        self._running = False

    # ── Rate limiter em memória ──────────────────────────────────────────
    async def _wait_for_rate(self) -> None:
        while True:
            now = time.monotonic()
            self._sent_ts = [t for t in self._sent_ts if now - t < self.RATE_WINDOW]
            if len(self._sent_ts) < self.RATE_MAX:
                break
            sleep_for = self.RATE_WINDOW - (now - self._sent_ts[0]) + 0.1
            logger.info("Rate limit atingido — aguardando %.1f s", sleep_for)
            await asyncio.sleep(sleep_for)

    # ── Protocolo BullMQ (simplificado mas compatível) ───────────────────
    async def _pop_job(self) -> tuple[str | None, dict | None]:
        """Move o próximo job de wait → active e retorna (job_id, job_data)."""
        r = get_redis()
        raw = await r.lmove(_WAIT_KEY, _ACTIVE_KEY, "LEFT", "RIGHT")
        if raw is None:
            return None, None
        try:
            job = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("Job malformado raw=%s", raw[:200])
            return None, None
        return job.get("id", "unknown"), job

    async def _ack_job(self, job_id: str, raw_job: str, success: bool, err_msg: str = "") -> None:
        r = get_redis()
        now_ms = int(time.time() * 1000)
        pipe = r.pipeline()
        # Remove do active
        pipe.lrem(_ACTIVE_KEY, 0, raw_job)
        # Adiciona ao completed ou failed (sorted set por timestamp)
        dest = _COMPLETE_KEY if success else _FAILED_KEY
        pipe.zadd(dest, {raw_job: now_ms})
        # Limpa listas grandes (mantém 1000 completos / 500 falhos)
        if success:
            pipe.zremrangebyrank(_COMPLETE_KEY, 0, -1001)
        else:
            pipe.zremrangebyrank(_FAILED_KEY, 0, -501)
        await pipe.execute()

    async def _loop(self) -> None:
        r = get_redis()
        while self._running:
            raw = await r.lindex(_WAIT_KEY, 0)  # peek sem mover
            if raw is None:
                await asyncio.sleep(self.POLL_INTERVAL)
                continue

            await self._wait_for_rate()

            job_id, job = await self._pop_job()
            if job is None:
                continue

            raw_str = json.dumps(job, ensure_ascii=False)
            attempts_made = int((job.get("attemptsMade") or job.get("data", {}).get("attempt", 0)))

            try:
                await _process_job(job_id, job)
                await self._ack_job(job_id, raw_str, success=True)
                self._sent_ts.append(time.monotonic())

            except Exception as exc:
                attempts_made += 1
                logger.error("Job falhou jobId=%s attempt=%d err=%s", job_id, attempts_made, exc)

                if attempts_made < self.MAX_ATTEMPTS:
                    # Backoff exponencial: 3s, 9s, 27s
                    delay = self.BACKOFF_BASE ** attempts_made
                    logger.info("Reagendando jobId=%s em %ds", job_id, delay)
                    # Atualiza tentativas e devolve para wait após delay
                    if isinstance(job, dict):
                        if "data" in job:
                            job["data"]["attempt"] = attempts_made
                        job["attemptsMade"] = attempts_made
                    updated_raw = json.dumps(job, ensure_ascii=False)
                    await r.lrem(_ACTIVE_KEY, 0, raw_str)
                    await asyncio.sleep(delay)
                    await r.rpush(_WAIT_KEY, updated_raw)
                else:
                    await self._ack_job(job_id, raw_str, success=False, err_msg=str(exc))
                    logger.error("Job esgotou tentativas jobId=%s", job_id)


_worker: TelegramWorker | None = None


async def start_worker() -> None:
    global _worker
    _worker = TelegramWorker()
    asyncio.create_task(_worker.start())


async def stop_worker() -> None:
    if _worker:
        await _worker.stop()


async def get_queue_stats() -> dict:
    r = get_redis()
    waiting   = await r.llen(_WAIT_KEY)
    active    = await r.llen(_ACTIVE_KEY)
    completed = await r.zcard(_COMPLETE_KEY)
    failed    = await r.zcard(_FAILED_KEY)
    return {
        "waiting":   waiting,
        "active":    active,
        "completed": completed,
        "failed":    failed,
    }
