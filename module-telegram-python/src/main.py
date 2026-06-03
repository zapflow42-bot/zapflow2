"""
main.py — Entrypoint do module-telegram Python.

Sobe FastAPI na porta 4003 (TELEGRAM_PORT), registra as rotas,
inicia o worker BullMQ e gerencia o ciclo de vida da aplicação.
"""
import asyncio
import logging
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from config import settings
from redis_client import close_redis
from session_manager import disconnect_all
from worker import start_worker, stop_worker
from routes import router

# ── Logging ──────────────────────────────────────────────────────────────────
log_level = settings.log_level.upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("telegram.main")


# ── Lifespan (startup / shutdown) ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("✈️  Module Telegram Telethon → http://0.0.0.0:%d", settings.port)

    # Startup
    await start_worker()

    yield

    # Shutdown — desconecta sessões graciosamente
    logger.info("Encerrando module-telegram…")
    await stop_worker()
    await disconnect_all()
    await close_redis()
    logger.info("Module Telegram encerrado.")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ZapFlow — Module Telegram",
    version="2.0.0",
    docs_url="/docs" if settings.node_env != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.include_router(router)


# ── Entrypoint ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.port,
        log_level=settings.log_level.lower(),
        access_log=True,
    )
