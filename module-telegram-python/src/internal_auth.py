"""
internal_auth.py

Replica EXATA do requireInternalAuth do @zapflow/shared (Node.js).
O gateway assina as requisições com HMAC-SHA256; este módulo verifica.

Algoritmo:
  payload  = f"{timestamp}.{json.dumps(body or '')}"
  sig      = hmac_sha256(INTERNAL_SECRET, payload).hexdigest()

Headers esperados:
  X-Internal-Uid        — uid do usuário
  X-Internal-Role       — role
  X-Internal-Tenant     — tenantId
  X-Internal-Timestamp  — unix ms
  X-Internal-Signature  — hex do HMAC
"""
import hashlib
import hmac
import json
import time
from typing import Any, Optional

from fastapi import Header, HTTPException, Request
from pydantic import BaseModel

from config import settings


# ── Model injetado nas rotas ─────────────────────────────────────────────────
class InternalUser(BaseModel):
    uid: str
    role: str
    tenant_id: str


def _sign(body: Any, timestamp: int) -> str:
    """Mesma lógica do signRequest() do Node."""
    body_str = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
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
    """
    FastAPI dependency — injeta InternalUser nas rotas autenticadas.
    /health é isento (verificado antes de chegar aqui via router separado).
    """
    if not x_internal_uid or not x_internal_timestamp or not x_internal_signature:
        raise HTTPException(status_code=401, detail="Nao autenticado")

    try:
        timestamp = int(x_internal_timestamp)
    except ValueError:
        raise HTTPException(status_code=401, detail="Timestamp invalido")

    age_ms = int(time.time() * 1000) - timestamp
    if age_ms > 30_000 or age_ms < -5_000:
        raise HTTPException(status_code=401, detail="Timestamp invalido")

    # Reconstrói o body da mesma forma que o Node faz no proxyToModule:
    # GET → string vazia, outros → body JSON
    if request.method.upper() == "GET":
        body_for_sig: Any = ""
    else:
        try:
            body_for_sig = await request.json()
        except Exception:
            body_for_sig = {}

    expected = _sign(body_for_sig, timestamp)

    # timingSafeEqual equivalente
    if not hmac.compare_digest(
        bytes.fromhex(x_internal_signature),
        bytes.fromhex(expected),
    ):
        raise HTTPException(status_code=401, detail="Assinatura invalida")

    return InternalUser(
        uid=x_internal_uid,
        role=x_internal_role or "",
        tenant_id=x_internal_tenant or x_internal_uid,
    )
