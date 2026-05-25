import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Send, AlertCircle, Loader2, RefreshCw, Users, Bot } from "lucide-react"
import { apiFetch } from "../../lib/api"

interface TelegramContact {
  id: string
  chat_id: string
  username?: string
  first_name?: string
  last_name?: string
  active: boolean
}

export function TelegramPage() {
  const [contacts,    setContacts]    = useState<TelegramContact[]>([])
  const [loading,     setLoading]     = useState(false)
  const [loadingCtcs, setLoadingCtcs] = useState(false)
  const [message,     setMessage]     = useState("")
  const [delay,       setDelay]       = useState(3)

  useEffect(() => { loadContacts() }, [])

  async function loadContacts() {
    setLoadingCtcs(true)
    try {
      const data = await apiFetch("/api/telegram/contacts")
      setContacts(data.contacts ?? [])
    } catch { toast.error("Erro ao carregar contatos") }
    finally { setLoadingCtcs(false) }
  }

  async function launch() {
    if (!message.trim()) { toast.error("Digite uma mensagem"); return }
    if (contacts.length === 0) { toast.error("Nenhum contato Telegram disponível"); return }
    setLoading(true)
    try {
      const campaignId = `tg-camp-${Date.now()}`
      const messages = contacts.map((c, i) => ({
        jobId:       `${campaignId}-${i}`,
        to:          c.chat_id,
        contactName: c.first_name || c.username || "Contato",
        message:     message.replace(/\[\[nome\]\]/gi, c.first_name || ""),
        delay:       i * delay * 1000,
      }))
      await apiFetch("/api/telegram/enqueue", {
        method: "POST",
        body: JSON.stringify({ campaignId, messages }),
      })
      toast.success(`✅ ${messages.length} mensagens Telegram na fila!`)
      setMessage("")
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao disparar")
    } finally { setLoading(false) }
  }

  const botUsername = "zapflow_bot"
  const botLink = `https://t.me/${botUsername}?start=zapflow`

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Disparar Telegram</h1>
        <p className="text-[#7d8590] text-sm">Envie mensagens para seus contatos do Telegram</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Bot Info */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#229ed9]" />
              <h3 className="text-sm font-semibold text-white">Seu Bot Telegram</h3>
            </div>
            <div className="bg-[#0d1117] rounded-lg p-3 space-y-2">
              <p className="text-xs text-[#7d8590]">Compartilhe o link para seus contatos se cadastrarem:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#229ed9] bg-[#161b22] px-2 py-1 rounded flex-1 truncate">{botLink}</code>
                <button onClick={() => { navigator.clipboard.writeText(botLink); toast.success("Link copiado!") }}
                  className="text-xs text-[#7d8590] hover:text-white border border-white/10 px-2 py-1 rounded transition-colors">
                  Copiar
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#7d8590] bg-[#229ed9]/10 border border-[#229ed9]/20 rounded-lg p-2">
              <AlertCircle className="w-3.5 h-3.5 text-[#229ed9] flex-shrink-0" />
              O contato precisa iniciar conversa com o bot para receber mensagens.
            </div>
          </div>

          {/* Mensagem */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Mensagem</h3>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
              placeholder={"Digite sua mensagem:\n\nEx: Olá [[nome]], temos uma novidade especial! 🎉"}
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#229ed9]/50 resize-none leading-6" />
            <p className="text-xs text-[#7d8590]">Use <code className="text-[#229ed9]">[[nome]]</code> para personalizar.</p>
            <div className="flex items-center gap-3">
              <label className="text-xs text-[#7d8590]">Delay entre envios (s):</label>
              <input type="number" value={delay} onChange={e => setDelay(+e.target.value)} min={1} max={60}
                className="w-16 bg-[#0d1117] border border-white/10 rounded-lg px-2 py-1 text-white text-sm outline-none" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Contatos */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#229ed9]" />
                <h3 className="text-sm font-semibold text-white">Contatos cadastrados</h3>
              </div>
              <button onClick={loadContacts} className="text-[#7d8590] hover:text-white transition-colors">
                <RefreshCw className={`w-4 h-4 ${loadingCtcs ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loadingCtcs ? (
              <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#7d8590]" /></div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-[#7d8590] text-sm">Nenhum contato cadastrado ainda.</p>
                <p className="text-xs text-[#7d8590]">Compartilhe o link do bot para que as pessoas se cadastrem.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {contacts.map(c => (
                  <div key={c.id} className="flex items-center gap-3 bg-[#0d1117] rounded-lg px-3 py-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#229ed9] to-[#1a7ab0] flex items-center justify-center text-xs font-bold text-white">
                      {(c.first_name || c.username || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{c.first_name} {c.last_name}</p>
                      <p className="text-xs text-[#7d8590]">{c.username ? `@${c.username}` : c.chat_id}</p>
                    </div>
                    <span className="text-[10px] text-[#3fb950] bg-[#2ea043]/20 px-1.5 py-0.5 rounded-full">ativo</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-[#7d8590] text-right">{contacts.length} contatos</p>
          </div>

          {/* Preview */}
          {message && (
            <div className="bg-[#161b22] border border-[#229ed9]/20 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-white">Preview</h3>
              <div className="bg-[#0d1117] rounded-xl p-3">
                <p className="text-sm text-[#e6edf3] whitespace-pre-wrap leading-6">
                  {message.replace(/\[\[nome\]\]/gi, "João")}
                </p>
                <p className="text-right text-[10px] text-[#7d8590] mt-1">15:08 ✓</p>
              </div>
            </div>
          )}

          <button onClick={launch} disabled={loading || contacts.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#229ed9] to-[#1a7ab0] hover:from-[#1a7ab0] hover:to-[#145f8a] disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all">
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
              : <><Send className="w-4 h-4" /> Disparar para {contacts.length} contatos</>}
          </button>

          <div className="bg-[#0d1117] border border-white/[0.07] rounded-xl p-3 text-xs text-[#7d8590] space-y-1">
            <div className="flex items-center gap-1.5 text-[#229ed9] mb-1"><AlertCircle className="w-3.5 h-3.5" /> Vantagens do Telegram</div>
            <p>• Sem limite de mensagens por dia</p>
            <p>• Não precisa de aquecimento</p>
            <p>• Taxa de abertura muito maior que WhatsApp</p>
            <p>• Contato precisa ter iniciado o bot</p>
          </div>
        </div>
      </div>
    </div>
  )
}