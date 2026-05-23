import { useState } from "react"
import { toast } from "sonner"
import { Plus, Smartphone, Mail, Send, MessageSquare, QrCode, Trash2, Wifi, WifiOff, Flame } from "lucide-react"

type ChannelType = "whatsapp" | "email" | "telegram" | "sms"

interface Channel {
  id: string; type: ChannelType; name: string; address: string
  status: "connected" | "disconnected" | "warming" | "banned"
  sent: number; limit: number; alias: string
}

const CHANNEL_CONFIG = {
  whatsapp: { icon: Smartphone, color: "#25d366", label: "WhatsApp", emoji: "📱" },
  email:    { icon: Mail,       color: "#58a6ff", label: "Email",    emoji: "📧" },
  telegram: { icon: Send,       color: "#229ed9", label: "Telegram", emoji: "✈️"  },
  sms:      { icon: MessageSquare, color: "#d29922", label: "SMS",   emoji: "💬" },
}

export function ChannelsPage() {
  const [activeTab, setActiveTab] = useState<ChannelType>("whatsapp")
  const [channels, setChannels] = useState<Channel[]>([
    { id:"w1", type:"whatsapp", name:"Chip Principal", address:"5511999990001", status:"connected", sent:87, limit:150, alias:"Principal" },
    { id:"w2", type:"whatsapp", name:"Chip Backup",    address:"5511988880002", status:"warming",   sent:12, limit:150, alias:"Backup"    },
    { id:"e1", type:"email",    name:"Marketing",      address:"mkt@empresa.com", status:"connected", sent:440, limit:1000, alias:"Marketing" },
  ])
  const [showQR,  setShowQR]  = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState({ address:"", alias:"" })

  const filtered = channels.filter(c => c.type === activeTab)

  function addWA() {
    const phone = "5511" + Math.floor(900000000 + Math.random() * 99999999)
    setChannels(p => [...p, { id:`w-${Date.now()}`, type:"whatsapp", name:`Chip ${filtered.length+1}`, address:phone, status:"connected", sent:0, limit:150, alias:`Chip ${filtered.length+1}` }])
    setShowQR(false)
    toast.success("Número vinculado!")
  }

  function addChannel() {
    if (!form.address) return
    setChannels(p => [...p, { id:`c-${Date.now()}`, type:activeTab, name:form.alias||form.address, address:form.address, status:"connected", sent:0, limit:activeTab==="email"?1000:500, alias:form.alias||form.address }])
    setForm({ address:"", alias:"" })
    setShowAdd(false)
    toast.success("Canal adicionado!")
  }

  function startWarm(id: string) {
    setChannels(p => p.map(c => c.id===id ? { ...c, status:"warming" } : c))
    toast.success("Aquecimento iniciado — chip enviando mensagens automaticamente por 7 dias")
  }

  function removeChannel(id: string) {
    setChannels(p => p.filter(c => c.id !== id))
    toast.success("Canal removido")
  }

  const statusMap = {
    connected:    { icon: Wifi,    color: "text-[#3fb950]", bg: "bg-[#2ea043]/20", label: "conectado"   },
    disconnected: { icon: WifiOff, color: "text-[#f85149]", bg: "bg-[#f85149]/20", label: "desconectado" },
    warming:      { icon: Flame,   color: "text-[#d29922]", bg: "bg-[#d29922]/20", label: "aquecendo"   },
    banned:       { icon: WifiOff, color: "text-[#f85149]", bg: "bg-[#f85149]/20", label: "banido"      },
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Canais</h1>
          <p className="text-[#7d8590] text-sm">Gerencie todos os seus canais de disparo</p>
        </div>
        <button onClick={() => activeTab === "whatsapp" ? setShowQR(true) : setShowAdd(true)}
          className="flex items-center gap-2 bg-[#2ea043] hover:bg-[#238636] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Adicionar {CHANNEL_CONFIG[activeTab].label}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[#161b22] border border-white/[0.07] rounded-xl w-fit">
        {(Object.keys(CHANNEL_CONFIG) as ChannelType[]).map(t => {
          const cfg = CHANNEL_CONFIG[t]
          const count = channels.filter(c => c.type === t).length
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${activeTab === t ? "bg-[#21262d] text-white shadow-sm" : "text-[#7d8590] hover:text-white"}`}>
              <span>{cfg.emoji}</span>
              {cfg.label}
              {count > 0 && <span className="text-[10px] bg-[#30363d] text-[#7d8590] px-1.5 py-0.5 rounded-full font-mono">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* WhatsApp tips */}
      {activeTab === "whatsapp" && (
        <div className="bg-[#d29922]/10 border border-[#d29922]/20 rounded-xl p-4 text-sm">
          <div className="font-semibold text-[#d29922] mb-2">⚠️ Boas práticas anti-ban</div>
          <div className="grid grid-cols-3 gap-2 text-xs text-[#7d8590]">
            <span>✓ Aqueça chips por 7 dias antes de disparar</span>
            <span>✓ Máximo 150 msgs/dia por número</span>
            <span>✓ Use delay de 8–22 segundos entre mensagens</span>
          </div>
        </div>
      )}

      {/* Channel list */}
      {filtered.length === 0 ? (
        <div className="bg-[#161b22] border border-dashed border-white/[0.1] rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">{CHANNEL_CONFIG[activeTab].emoji}</div>
          <p className="text-[#7d8590] text-sm">Nenhum {CHANNEL_CONFIG[activeTab].label} cadastrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ch => {
            const s = statusMap[ch.status]
            const pct = (ch.sent / ch.limit) * 100
            return (
              <div key={ch.id} className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 flex items-center gap-4 hover:border-white/[0.12] transition-colors">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: `${CHANNEL_CONFIG[ch.type].color}15`, border: `1px solid ${CHANNEL_CONFIG[ch.type].color}30` }}>
                  {CHANNEL_CONFIG[ch.type].emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-sm text-white">{ch.address}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${s.bg} ${s.color}`}>
                      <s.icon className="w-2.5 h-2.5" /> {s.label}
                    </span>
                  </div>
                  <div className="text-xs text-[#7d8590]">{ch.alias}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-[#21262d] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct < 60 ? "bg-[#2ea043]" : pct < 85 ? "bg-[#d29922]" : "bg-[#f85149]"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-[#7d8590] font-mono whitespace-nowrap">{ch.sent}/{ch.limit}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeTab === "whatsapp" && ch.status !== "warming" && (
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

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#161b22] border border-white/10 rounded-2xl p-6 w-80 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#25d366]" />
              <h3 className="font-bold text-white">Vincular WhatsApp</h3>
            </div>
            <p className="text-[#7d8590] text-xs leading-5">Abra o WhatsApp → Aparelhos Conectados → Conectar aparelho → Escaneie o QR Code abaixo</p>
            <div className="w-44 h-44 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-lg">
              <div className="w-36 h-36 rounded" style={{ background:"repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0 0/10px 10px" }} />
            </div>
            <p className="text-center text-xs text-[#7d8590]">QR Code expira em 45 segundos</p>
            <div className="flex gap-2">
              <button onClick={() => setShowQR(false)} className="flex-1 py-2 text-sm text-[#7d8590] border border-white/10 rounded-lg hover:text-white transition-colors">Cancelar</button>
              <button onClick={addWA} className="flex-1 py-2 text-sm font-semibold text-white bg-[#25d366] hover:bg-[#1da851] rounded-lg transition-colors">✓ Simular Scan</button>
            </div>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#161b22] border border-white/10 rounded-2xl p-6 w-80 space-y-4">
            <h3 className="font-bold text-white">Adicionar {CHANNEL_CONFIG[activeTab].label}</h3>
            <input value={form.address} onChange={e => setForm(p => ({...p, address:e.target.value}))}
              placeholder={activeTab === "email" ? "email@dominio.com" : activeTab === "telegram" ? "@username do bot" : "+5511..."}
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50" />
            <input value={form.alias} onChange={e => setForm(p => ({...p, alias:e.target.value}))}
              placeholder="Apelido (ex: Principal, Backup...)"
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50" />
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 text-sm text-[#7d8590] border border-white/10 rounded-lg hover:text-white transition-colors">Cancelar</button>
              <button onClick={addChannel} className="flex-1 py-2 text-sm font-semibold text-white bg-[#2ea043] hover:bg-[#238636] rounded-lg transition-colors">Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
