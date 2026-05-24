import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Plus, Smartphone, Mail, Send, MessageSquare, Trash2, Wifi, WifiOff, Flame, Loader2, RefreshCw } from "lucide-react"
import { apiFetch } from "../../lib/api"
import { useAuthStore } from "../../store/authStore"
import QRCode from "react-qr-code"

type ChannelType = "whatsapp" | "email" | "telegram" | "sms"
type Status = "connected" | "disconnected" | "warming" | "banned" | "pending"

interface Channel {
  id: string; type: ChannelType; alias: string; address: string
  status: Status; sent: number; limit: number; sessionId?: string
}

const CHANNEL_CONFIG = {
  whatsapp: { icon: Smartphone, color: "#25d366", label: "WhatsApp", emoji: "📱" },
  email:    { icon: Mail,       color: "#58a6ff", label: "Email",    emoji: "📧" },
  telegram: { icon: Send,       color: "#229ed9", label: "Telegram", emoji: "✈️"  },
  sms:      { icon: MessageSquare, color: "#d29922", label: "SMS",   emoji: "💬" },
}

const statusMap = {
  connected:    { icon: Wifi,    color: "text-[#3fb950]", bg: "bg-[#2ea043]/20", label: "conectado"    },
  disconnected: { icon: WifiOff, color: "text-[#f85149]", bg: "bg-[#f85149]/20", label: "desconectado" },
  warming:      { icon: Flame,   color: "text-[#d29922]", bg: "bg-[#d29922]/20", label: "aquecendo"    },
  banned:       { icon: WifiOff, color: "text-[#f85149]", bg: "bg-[#f85149]/20", label: "banido"       },
  pending:      { icon: Loader2, color: "text-[#58a6ff]", bg: "bg-[#58a6ff]/20", label: "aguardando QR" },
}

export function ChannelsPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab]   = useState<ChannelType>("whatsapp")
  const [channels,  setChannels]    = useState<Channel[]>([])
  const [showModal, setShowModal]   = useState(false)
  const [qrData,    setQrData]      = useState<string | null>(null)
  const [qrLoading, setQrLoading]   = useState(false)
  const [form,      setForm]        = useState({ address: "", alias: "" })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Carrega sessões ativas ao montar
  useEffect(() => {
    loadActiveSessions()
  }, [])

  async function loadActiveSessions() {
    try {
      const data = await apiFetch("/api/whatsapp/sessions")
      const sessions: string[] = data.sessions ?? []
      if (sessions.length > 0) {
        const waChannels: Channel[] = sessions.map((sessionId, i) => ({
          id: sessionId, type: "whatsapp", alias: `Chip ${i + 1}`,
          address: sessionId.split("-").slice(-1)[0] || "Conectado",
          status: "connected", sent: 0, limit: 150, sessionId,
        }))
        setChannels(prev => {
          const existing = prev.filter(c => c.type !== "whatsapp")
          return [...existing, ...waChannels]
        })
      }
    } catch {}
  }

  const filtered = channels.filter(c => c.type === activeTab)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function startWASession() {
    if (!user) return
    setQrLoading(true)
    setQrData(null)
    const sessionId = `${user.uid}-${Date.now()}`

    try {
      await apiFetch("/api/whatsapp/session", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      })

      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        if (attempts > 40) {
          stopPolling()
          setQrLoading(false)
          toast.error("QR expirou — tente novamente")
          return
        }
        try {
          const data = await apiFetch(`/api/whatsapp/qr/${sessionId}`)
          if (data.qr) {
            setQrData(data.qr)
            setQrLoading(false)
          }
        } catch {
          // Verifica se conectou
          try {
            const sessions = await apiFetch("/api/whatsapp/sessions")
            if ((sessions.sessions ?? []).includes(sessionId)) {
              stopPolling()
              setShowModal(false)
              setQrData(null)
              setChannels(p => [...p, {
                id: sessionId, type: "whatsapp",
                alias: form.alias || `Chip ${filtered.length + 1}`,
                address: "Conectado", status: "connected",
                sent: 0, limit: 150, sessionId,
              }])
              toast.success("WhatsApp conectado!")
            }
          } catch {}
        }
      }, 2000)
    } catch (err: any) {
      setQrLoading(false)
      toast.error(err.message)
    }
  }

  function closeModal() {
    stopPolling()
    setShowModal(false)
    setQrData(null)
    setQrLoading(false)
  }

  function addOther() {
    if (!form.address) return
    setChannels(p => [...p, {
      id: `c-${Date.now()}`, type: activeTab, alias: form.alias || form.address,
      address: form.address, status: "connected", sent: 0, limit: 1000,
    }])
    setForm({ address: "", alias: "" })
    setShowModal(false)
    toast.success("Canal adicionado!")
  }

  function startWarm(id: string) {
    setChannels(p => p.map(c => c.id === id ? { ...c, status: "warming" } : c))
    toast.success("Aquecimento iniciado por 7 dias")
  }

  function removeChannel(id: string) {
    setChannels(p => p.filter(c => c.id !== id))
  }

  useEffect(() => () => stopPolling(), [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Canais</h1>
          <p className="text-[#7d8590] text-sm">Gerencie seus canais de disparo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadActiveSessions}
            className="flex items-center gap-2 border border-white/10 hover:border-white/20 text-[#7d8590] hover:text-white text-sm px-3 py-2 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#2ea043] hover:bg-[#238636] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
            Adicionar {CHANNEL_CONFIG[activeTab].label}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[#161b22] border border-white/[0.07] rounded-xl w-fit">
        {(Object.keys(CHANNEL_CONFIG) as ChannelType[]).map(t => {
          const count = channels.filter(c => c.type === t).length
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${activeTab === t ? "bg-[#21262d] text-white" : "text-[#7d8590] hover:text-white"}`}>
              {CHANNEL_CONFIG[t].emoji} {CHANNEL_CONFIG[t].label}
              {count > 0 && <span className="text-[10px] bg-[#30363d] text-[#7d8590] px-1.5 py-0.5 rounded-full">{count}</span>}
            </button>
          )
        })}
      </div>

      {activeTab === "whatsapp" && (
        <div className="bg-[#d29922]/10 border border-[#d29922]/20 rounded-xl p-4 text-xs text-[#7d8590] space-y-1">
          <p className="text-[#d29922] font-semibold mb-1">⚠️ Boas práticas anti-ban</p>
          <p>✓ Aqueça chips novos por 7 dias antes de disparar massivamente</p>
          <p>✓ Máximo 150 mensagens/dia por número nos primeiros 30 dias</p>
          <p>✓ Use delay de 8–22s entre mensagens</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-[#161b22] border border-dashed border-white/10 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">{CHANNEL_CONFIG[activeTab].emoji}</div>
          <p className="text-[#7d8590] text-sm">Nenhum {CHANNEL_CONFIG[activeTab].label} adicionado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ch => {
            const s = statusMap[ch.status]
            const pct = Math.min((ch.sent / ch.limit) * 100, 100)
            return (
              <div key={ch.id} className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: `${CHANNEL_CONFIG[ch.type].color}15`, border: `1px solid ${CHANNEL_CONFIG[ch.type].color}30` }}>
                  {CHANNEL_CONFIG[ch.type].emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-white">{ch.alias}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${s.bg} ${s.color}`}>
                      {ch.status === "pending" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                      {s.label}
                    </span>
                  </div>
                  <div className="text-xs text-[#7d8590] font-mono">{ch.sessionId || ch.address}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-[#21262d] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct < 60 ? "bg-[#2ea043]" : pct < 85 ? "bg-[#d29922]" : "bg-[#f85149]"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-[#7d8590] font-mono">{ch.sent}/{ch.limit}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeTab === "whatsapp" && ch.status === "connected" && (
                    <button onClick={() => startWarm(ch.id)}
                      className="flex items-center gap-1.5 text-xs text-[#d29922] border border-[#d29922]/30 hover:bg-[#d29922]/10 px-2.5 py-1.5 rounded-lg transition-colors">
                      <Flame className="w-3.5 h-3.5" /> Aquecer
                    </button>
                  )}
                  <button onClick={() => removeChannel(ch.id)}
                    className="text-[#7d8590] hover:text-[#f85149] p-1.5 rounded-lg hover:bg-[#f85149]/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#161b22] border border-white/10 rounded-2xl p-6 w-96 space-y-4 shadow-2xl">
            {activeTab === "whatsapp" ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xl">📱</span>
                  <h3 className="font-bold text-white">Vincular WhatsApp</h3>
                </div>
                <input value={form.alias} onChange={e => setForm(p => ({...p, alias: e.target.value}))}
                  placeholder="Apelido (ex: Chip Principal)"
                  className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50" />
                {!qrLoading && !qrData && (
                  <button onClick={startWASession}
                    className="w-full flex items-center justify-center gap-2 bg-[#25d366] hover:bg-[#1da851] text-white font-semibold py-3 rounded-xl transition-colors">
                    <span>📲</span> Gerar QR Code
                  </button>
                )}
                {qrLoading && !qrData && (
                  <div className="text-center py-6 space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#25d366] mx-auto" />
                    <p className="text-sm text-[#7d8590]">Gerando QR Code...</p>
                  </div>
                )}
                {qrData && (
                  <div className="space-y-3">
                    <p className="text-xs text-[#7d8590] text-center">WhatsApp → Aparelhos Conectados → Conectar aparelho</p>
                    <div className="bg-white p-4 rounded-xl mx-auto w-fit">
                      <QRCode value={qrData} size={200} />
                    </div>
                    <p className="text-center text-xs text-[#7d8590]">QR expira em 60 segundos</p>
                    <button onClick={() => { setQrData(null); startWASession() }}
                      className="w-full flex items-center justify-center gap-2 text-sm text-[#7d8590] border border-white/10 hover:text-white py-2 rounded-lg transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" /> Atualizar QR
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="font-bold text-white">Adicionar {CHANNEL_CONFIG[activeTab].label}</h3>
                <input value={form.address} onChange={e => setForm(p => ({...p, address: e.target.value}))}
                  placeholder={activeTab === "email" ? "email@dominio.com" : activeTab === "telegram" ? "@username do bot" : "+5511..."}
                  className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50" />
                <input value={form.alias} onChange={e => setForm(p => ({...p, alias: e.target.value}))}
                  placeholder="Apelido"
                  className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50" />
                <button onClick={addOther}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-[#2ea043] hover:bg-[#238636] rounded-lg transition-colors">
                  Adicionar
                </button>
              </>
            )}
            <button onClick={closeModal} className="w-full py-2 text-sm text-[#7d8590] hover:text-white transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
