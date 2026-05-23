import { createClient } from "@supabase/supabase-js"
import ws from "ws"
const url = process.env.SUPABASE_URL ?? ""
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
if (!url || !key) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias no .env")
}

export const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})
