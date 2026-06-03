"""
supabase_client.py — cliente Supabase singleton (service key = acesso total).
Mesmas tabelas que o module-whatsapp usa:
  dispatch_logs      — logs de envio
  telegram_sessions  — status das sessões (espelho de sessions do WA)
"""
from supabase import create_client, Client
from config import settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            settings.supabase_url,
            settings.supabase_service_key,
        )
    return _client
