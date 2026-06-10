"""
worker.py — Worker BullMQ corrigido.
Fix 3: _pop_job retorna raw original — lrem() funciona corretamente
Fix 4: _promote_delayed() move jobs vencidos de :delayed para :wait
Fix 5: backoff exponencial com jitter +-20% evita thundering herd
"""
import asyncio
import json
import logging
import random
import time

from redis_client import get_redis
from session_manager import send_message
from supabase_client import get_supabase

logger = logging.getLogger("telegram.queue")

QUEUE_NAME    = "zf-telegram"
_WAIT_KEY     = f"bull:{QUEUE_NAME}:wait"
_ACTIVE_KEY   = f"bull:{QUEUE_NAME}:active"
_DELAYED_KEY  = f"bull:{QUEUE_NAME}:delayed"
_FAILED_KEY   = f"bull:{QUEUE_NAME}:failed"
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
    data    = job_data.get("data", job_data)
    to      = data["to"]
    msg     = data["message"]
    sender  = data["senderId"]
    cid     = data.get("campaignId", "")
    attempt = int(data.get("attempt", 0)) + 1
    image_base64 = data.get("imageBase64")
    image_mime   = data.get("imageMime")
    masked  = _mask(to)
    logger.info("Processando envio Telegram jobId=%s campaignId=%s to=%s attempt=%d hasImage=%s",
                job_id, cid, masked, attempt, bool(image_base64))
    ok = await send_message(sender, to, msg, image_base64, image_mime)
    await _log_to_supabase(data, ok, attempt)
    if ok:
        logger.info("Telegram enviado jobId=%s campaignId=%s to=%s", job_id, cid, masked)
    else:
        raise RuntimeError(f"Falha no envio para {masked}")


class TelegramWorker:
    MAX_ATTEMPTS  = 3
    RATE_MAX      = 30
    RATE_WINDOW   = 60
    POLL_INTERVAL = 0.5
    BACKOFF_BASE  = 3
    JITTER_FACTOR = 0.4

    def __init__(self) -> None:
        self._running = False
        self._sent_ts: list[float] = []

    async def start(self) -> None:
        self._running = True
        logger.info("Telegram Worker iniciado (Telethon / Python)")
        await self._loop()

    async def stop(self) -> None:
        self._running = False

    async def _wait_for_rate(self) -> None:
        while True:
            now = time.monotonic()
            self._sent_ts = [t for t in self._sent_ts if now - t < self.RATE_WINDOW]
            if len(self._sent_ts) < self.RATE_MAX:
                break
            sleep_for = self.RATE_WINDOW - (now - self._sent_ts[0]) + 0.1
            logger.info("Rate limit atingido aguardando %.1f s", sleep_for)
            await asyncio.sleep(sleep_for)

    async def _promote_delayed(self) -> None:
        r = get_redis()
        now_ms = int(time.time() * 1000)
        jobs = await r.zrangebyscore(_DELAYED_KEY, 0, now_ms)
        if not jobs:
            return
        pipe = r.pipeline()
        for raw_job in jobs:
            pipe.zrem(_DELAYED_KEY, raw_job)
            pipe.rpush(_WAIT_KEY, raw_job)
        await pipe.execute()
        logger.info("Promovidos %d jobs de delayed para wait", len(jobs))

    async def _pop_job(self) -> tuple[str | None, dict | None, str | None]:
        r = get_redis()
        raw = await r.lmove(_WAIT_KEY, _ACTIVE_KEY, "LEFT", "RIGHT")
        if raw is None:
            return None, None, None
        try:
            job = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("Job malformado raw=%s", raw[:200])
            await r.lrem(_ACTIVE_KEY, 0, raw)
            return None, None, None
        return job.get("id", "unknown"), job, raw

    async def _ack_job(self, job_id: str, raw_original: str,
                       success: bool, err_msg: str = "") -> None:
        r = get_redis()
        now_ms = int(time.time() * 1000)
        pipe = r.pipeline()
        pipe.lrem(_ACTIVE_KEY, 0, raw_original)
        dest = _COMPLETE_KEY if success else _FAILED_KEY
        pipe.zadd(dest, {raw_original: now_ms})
        if success:
            pipe.zremrangebyrank(_COMPLETE_KEY, 0, -1001)
        else:
            pipe.zremrangebyrank(_FAILED_KEY, 0, -501)
        await pipe.execute()

    async def _loop(self) -> None:
        r = get_redis()
        while self._running:
            await self._promote_delayed()
            raw_peek = await r.lindex(_WAIT_KEY, 0)
            if raw_peek is None:
                await asyncio.sleep(self.POLL_INTERVAL)
                continue
            await self._wait_for_rate()
            job_id, job, raw_original = await self._pop_job()
            if job is None:
                continue
            attempts_made = int(
                job.get("attemptsMade") or job.get("data", {}).get("attempt", 0)
            )
            try:
                await _process_job(job_id, job)
                await self._ack_job(job_id, raw_original, success=True)
                self._sent_ts.append(time.monotonic())
            except Exception as exc:
                attempts_made += 1
                logger.error("Job falhou jobId=%s attempt=%d err=%s",
                             job_id, attempts_made, exc)
                if attempts_made < self.MAX_ATTEMPTS:
                    base_delay = self.BACKOFF_BASE ** attempts_made
                    jitter     = base_delay * self.JITTER_FACTOR * (random.random() - 0.5)
                    delay      = max(1.0, base_delay + jitter)
                    logger.info("Reagendando jobId=%s em %.1fs", job_id, delay)
                    if isinstance(job, dict):
                        if "data" in job:
                            job["data"]["attempt"] = attempts_made
                        job["attemptsMade"] = attempts_made
                    updated_raw = json.dumps(job, ensure_ascii=False,
                                            separators=(",", ":"))
                    await r.lrem(_ACTIVE_KEY, 0, raw_original)
                    await asyncio.sleep(delay)
                    await r.rpush(_WAIT_KEY, updated_raw)
                else:
                    await self._ack_job(job_id, raw_original,
                                        success=False, err_msg=str(exc))
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
    delayed   = await r.zcard(_DELAYED_KEY)
    completed = await r.zcard(_COMPLETE_KEY)
    failed    = await r.zcard(_FAILED_KEY)
    return {
        "waiting":   waiting,
        "active":    active,
        "delayed":   delayed,
        "completed": completed,
        "failed":    failed,
    }
