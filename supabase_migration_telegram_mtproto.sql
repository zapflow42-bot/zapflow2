-- ============================================================
-- ZapFlow – Migration: Telegram MTProto Sessions
-- Cole no SQL Editor do Supabase e execute
-- ============================================================

-- Tabela de sessões Telegram (espelha a tabela "sessions" do WhatsApp)
CREATE TABLE IF NOT EXISTS telegram_sessions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id    text UNIQUE NOT NULL,       -- uid-timestamp
  owner_id      text NOT NULL,              -- uid do usuário
  phone_number  text NOT NULL,              -- ex: 5581994900228
  status        text DEFAULT 'disconnected',-- connected | disconnected | pending_code
  connected_at  timestamptz,
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_sessions_owner
  ON telegram_sessions (owner_id);

CREATE INDEX IF NOT EXISTS idx_tg_sessions_status
  ON telegram_sessions (status)
  WHERE status = 'connected';

-- RPC para incrementar contadores de campanha (reutilizada pelo worker)
-- (pode já existir se você rodou o migration anterior — o CREATE OR REPLACE é seguro)
CREATE OR REPLACE FUNCTION telegram_increment_count(
  p_campaign_id text,
  p_field       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_field = 'sent_count' THEN
    UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = p_campaign_id;
  ELSIF p_field = 'fail_count' THEN
    UPDATE campaigns SET fail_count = fail_count + 1 WHERE id = p_campaign_id;
  END IF;
END;
$$;
