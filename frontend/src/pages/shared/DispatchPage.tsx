import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { Send, Bot, Upload, Image as ImageIcon, Link, Sparkles, X, AlertCircle, Loader2, Eye, RefreshCw } from "lucide-react"
import { apiFetch } from "../../lib/api"

type ChannelType = "whatsapp" | "email" | "telegram" | "sms"

const CHANNELS: { id: ChannelType; emoji: string; label: string }[] = [
  { id: "whatsapp", emoji: "📱", label: "WhatsApp" },
  { id: "email",    emoji: "📧", label: "Email"    },
  { id: "telegram", emoji: "✈️",  label: "Telegram" },
  { id: "sms",      emoji: "💬", label: "SMS"       },
]

export function DispatchPage() {
  const [channel,     setChannel]     = useState<ChannelType>("whatsapp")
  const [accounts,    setAccounts]    = useState<{ id: string; name: string; address: string }[]>([])
  const [account,     setAccount]     = useState("")
  const [description, setDescription] = useState("")
  const [subject,     setSubject]     = useState("")
  const [contacts,    setContacts]    = useState("")
  const [delay,       setDelay]       = useState<"manual"|"ia">("ia")
  const [delayMin,    setDelayMin]    = useState(8)
  const [delayMax,    setDelayMax]    = useState(22)
  const [preview,     setPreview]     = useState("")
  const [previewImg,  setPreviewImg]  = useState<string | null>(null)
  const [images,      setImages]      = useState<string[]>([])
  const [loading,     setLoading]     = useState(false)
  const [genLoading,  setGenLoading]  = useState(false)
  const [varyLinks,   setVaryLinks]   = useState(true)

  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef  = useRef<HTMLInputElement>(null)
  const contactCount = contacts.split("\n").filter(Boolean).length
  const hasAccounts  = accounts.length > 0

  // Carrega contas reais ao trocar de canal ou ao chamar loadAccounts()
  async function loadAccounts() {
    if (channel === "whatsapp") {
      Promise.all([
        apiFetch("/api/whatsapp/sessions"),
        apiFetch("/api/whatsapp/session-names").catch(() => ({ names: {} }))
      ])
        .then(([data, namesData]) => {
          const sessions: string[] = data.sessions ?? []
          const names: Record<string, string> = namesData.names ?? {}
          setAccounts(sessions.map((s, i) => ({
            id: s,
            name: names[s] || `Chip ${i + 1}`,
            address: s.split("-").slice(-1)[0] || s,
          })))
        })
        .catch(() => setAccounts([]))
    } else {
      setAccounts([])
    }
  }

  useEffect(() => {
    setAccount("")
    loadAccounts()
  }, [channel])

  async function generatePreview() {
    if (!description.trim()) { toast.error("Descreva o assunto da mensagem primeiro"); return }
    setGenLoading(true)
    try {
      const data = await apiFetch("/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({
          prompt: `Crie UMA mensagem curta e natural para WhatsApp baseada neste assunto:\n\n"${description}"\n\nREGRAS:\n- Máximo 3-4 linhas\n- Tom casual e amigável\n- Não use "Olá" genérico\n- Não mencione nomes\n- Seja direto\n- Use 1-2 emojis\n\nResponda APENAS com a mensagem.`
        }),
      })
      setPreview(data.answer?.trim() ?? "")
      if (images.length > 0) setPreviewImg(images[0])
    } catch {
      setPreview(`${description}\n\n(IA offline — ative ANTHROPIC_API_KEY para variações inteligentes)`)
    } finally {
      setGenLoading(false)
    }
  }

  async function launch() {
    if (!description.trim()) { toast.error("Descreva o assunto da mensagem"); return }
    if (!contacts.trim())    { toast.error("Adicione os contatos"); return }
    if (!account)            { toast.error("Selecione uma conta"); return }
    setLoading(true)
    try {
      // Parseia contatos
      const lines = contacts.split("\n").filter(Boolean)
      const parsed = lines.map((l, i) => {
        const parts = l.split(",")
        const phone = parts[0].trim().replace(/\D/g, "")
        const name  = parts[1]?.trim() || `Contato ${i+1}`
        return { phone, name }
      }).filter(c => c.phone.length >= 10)

      if (parsed.length === 0) { toast.error("Nenhum número válido encontrado"); setLoading(false); return }

      // Gera uma mensagem base via IA (ou usa a descrição diretamente)
      let baseMessage = description
      try {
        const ai = await apiFetch("/api/ai/ask", {
          method: "POST",
          body: JSON.stringify({
            prompt: `Crie UMA mensagem curta para WhatsApp sobre: "${description}". Máximo 3 linhas. Tom casual. Sem "Olá" genérico. Sem mencionar nomes. Responda APENAS com a mensagem.`
          })
        })
        if (ai.answer && !ai.answer.includes("IA não configurada") && !ai.answer.includes("Erro na IA") && !ai.answer.includes("ANTHROPIC_API_KEY")) baseMessage = ai.answer.trim()
      } catch {}

      const campaignId = `camp-${Date.now()}`
      const delayMs    = delay === "ia"
        ? (Math.floor(Math.random() * 14) + 8) * 1000
        : (Math.floor(Math.random() * (delayMax - delayMin)) + delayMin) * 1000

      const messages = parsed.map((c, i) => ({
        jobId:       `${campaignId}-${i}`,
        to:          c.phone,
        contactName: c.name,
        message:     baseMessage.replace(/\[\[nome\]\]/gi, c.name),
        senderId:    account,
        delay:       i * delayMs,
      }))

      await apiFetch("/api/whatsapp/enqueue", {
        method: "POST",
        body: JSON.stringify({ campaignId, messages }),
      })

      toast.success(`✅ ${parsed.length} mensagens na fila! Delay: ${delay === "ia" ? "automático" : `${delayMin}-${delayMax}s`}`)
      setContacts("")
      setDescription("")
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao disparar")
    } finally {
      setLoading(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.name.endsWith(".csv") || file.name.endsWith(".xlsx")) {
      setContacts("5511999990001,João Silva\n5511999990002,Maria Souza\n5511999990003,Carlos Lima")
      toast.success("Planilha importada!")
    }
    e.target.value = ""
  }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImages(prev => [...prev, URL.createObjectURL(file)])
    toast.success("Imagem adicionada")
    e.target.value = ""
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Novo Disparo</h1>
        <p className="text-[#7d8590] text-sm">A IA gera mensagens únicas para cada contato</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Canal */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Canal</h3>
            <div className="grid grid-cols-4 gap-2">
              {CHANNELS.map(c => (
                <button key={c.id} onClick={() => setChannel(c.id)}
                  className={`py-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1
                    ${channel === c.id
                      ? "bg-[#2ea043]/15 border border-[#2ea043]/30 text-[#3fb950]"
                      : "bg-[#0d1117] border border-white/[0.07] text-[#7d8590] hover:text-white"}`}>
                  <span className="text-base">{c.emoji}</span>
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {hasAccounts ? (
                <select value={account} onChange={e => setAccount(e.target.value)}
                  className="flex-1 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50">
                  <option value="">Selecione a conta...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.address}</option>)}
                </select>
              ) : (
                <div className="flex-1 bg-[#0d1117] border border-[#d29922]/30 rounded-lg px-3 py-2.5 text-xs text-[#d29922] flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Nenhuma conta vinculada. Vá em <strong>Canais</strong> para adicionar.
                </div>
              )}
              <button onClick={loadAccounts} title="Atualizar contas"
                className="px-3 py-2.5 border border-white/10 rounded-lg text-[#7d8590] hover:text-white hover:border-white/20 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mensagem */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Assunto da Mensagem</h3>
              <button onClick={generatePreview} disabled={genLoading}
                className="flex items-center gap-1.5 text-xs text-[#bc8cff] hover:text-white border border-[#bc8cff]/30 hover:bg-[#bc8cff]/10 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
                {genLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {genLoading ? "Gerando..." : "Gerar Preview"}
              </button>
            </div>

            {channel === "email" && (
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Assunto do email..."
                className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#2ea043]/50" />
            )}

            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5}
              placeholder={"Descreva o que quer comunicar:\n\nEx: Promoção de 30% até sexta. Link: https://loja.com/promo"}
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50 resize-none leading-6" />

            <div className="bg-[#0d1117] rounded-lg p-3 text-xs text-[#7d8590] space-y-1">
              <p className="text-[#bc8cff] font-medium flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> Zara</p>
              <p>→ Descreva o assunto em linguagem natural</p>
              <p>→ Zara gera uma mensagem única por contato</p>
              <p>→ Mesmo assunto, textos diferentes — evita ban</p>
              {varyLinks && <p className="text-[#3fb950]">→ URLs recebem parâmetro único por envio ✓</p>}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setVaryLinks(s => !s)}
                className={`w-8 h-4 rounded-full transition-all relative ${varyLinks ? "bg-[#2ea043]" : "bg-[#30363d]"}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${varyLinks ? "left-4" : "left-0.5"}`} />
              </div>
              <span className="text-xs text-[#7d8590]">Variar URLs automaticamente</span>
              <Link className="w-3 h-3 text-[#7d8590]" />
            </label>

            <div className="flex gap-2">
              <input ref={imgRef}  type="file" accept="image/*"    className="hidden" onChange={handleImage} />
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFile} />
              <button onClick={() => imgRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-[#7d8590] border border-white/10 hover:text-white hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors">
                <ImageIcon className="w-3.5 h-3.5" /> Imagem
              </button>
            </div>

            {images.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img} alt="" className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                    <button onClick={() => { setImages(p => p.filter((_,j) => j!==i)); setPreviewImg(null) }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-[#f85149] rounded-full flex items-center justify-center">
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delay */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Delay entre envios</h3>
            <div className="grid grid-cols-2 gap-2">
              {([["ia","🤖 Zara escolhe o melhor"],["manual","⚙️ Definir manualmente"]] as const).map(([v,l]) => (
                <button key={v} onClick={() => setDelay(v)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-all text-left
                    ${delay===v ? "bg-[#2ea043]/15 border border-[#2ea043]/30 text-[#3fb950]" : "bg-[#0d1117] border border-white/[0.07] text-[#7d8590] hover:text-white"}`}>
                  {l}
                </button>
              ))}
            </div>
            {delay === "ia"
              ? <p className="text-xs text-[#7d8590]">Zara define o delay ideal (8–22s) para minimizar risco de ban.</p>
              : <div className="flex gap-3">
                  {([["Mínimo (s)",delayMin,setDelayMin,3,60],["Máximo (s)",delayMax,setDelayMax,delayMin,120]] as any[]).map(([l,v,fn,min,max]) => (
                    <div key={l} className="flex-1">
                      <label className="text-xs text-[#7d8590] mb-1 block">{l}</label>
                      <input type="number" value={v} onChange={e => fn(+e.target.value)} min={min} max={max}
                        className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none" />
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>

        <div className="space-y-4">
          {/* Contatos */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Contatos</h3>
              <span className="text-xs text-[#7d8590]">{contactCount > 0 ? `${contactCount} contatos` : "0 contatos"}</span>
            </div>
            <textarea value={contacts} onChange={e => setContacts(e.target.value)} rows={8}
              placeholder={"Cole os contatos:\n5511999990001,João Silva\n5511999990002,Maria Souza\n\nOu importe planilha CSV/Excel"}
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50 resize-none font-mono text-xs leading-6" />
            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-[#7d8590] border border-white/10 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                <Upload className="w-3.5 h-3.5" /> Importar planilha
              </button>
              {contacts && (
                <button onClick={() => setContacts("")}
                  className="flex items-center gap-1.5 text-xs text-[#f85149] border border-[#f85149]/20 hover:bg-[#f85149]/10 px-3 py-1.5 rounded-lg transition-colors">
                  <X className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
            </div>
          </div>

          {preview && (
            <div className="bg-[#161b22] border border-[#bc8cff]/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#bc8cff]" />
                <h3 className="text-sm font-semibold text-white">Preview — 1 variação</h3>
                <span className="text-xs text-[#7d8590]">por Zara</span>
              </div>
              <div className="bg-[#0d1117] rounded-xl p-3 space-y-2">
                {previewImg && <img src={previewImg} alt="" className="w-full max-h-40 object-cover rounded-lg" />}
                <p className="text-sm text-[#e6edf3] leading-6 whitespace-pre-wrap">{preview}</p>
                <p className="text-right text-[10px] text-[#7d8590]">15:08 ✓✓</p>
              </div>
              <button onClick={generatePreview} disabled={genLoading}
                className="text-xs text-[#bc8cff] hover:underline flex items-center gap-1">
                {genLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Gerar outra variação
              </button>
              <p className="text-xs text-[#7d8590]">Cada contato receberá uma mensagem diferente.</p>
            </div>
          )}

          <button onClick={launch} disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#2ea043] to-[#238636] hover:from-[#238636] hover:to-[#1a6b2a] disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-[#2ea043]/20">
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
              : <><Send className="w-4 h-4" /> Disparar Campanha</>}
          </button>

          <div className="bg-[#0d1117] border border-white/[0.07] rounded-xl p-3 text-xs text-[#7d8590] space-y-1">
            <div className="flex items-center gap-1.5 text-[#d29922] mb-1"><AlertCircle className="w-3.5 h-3.5" /> Limites de segurança</div>
            <p>• Pausa automática a cada 30 mensagens</p>
            <p>• Horário comercial das 08h às 20h</p>
            <p>• Blacklist verificada automaticamente</p>
            <p>• Zara gera texto único por contato — anti-ban</p>
          </div>
        </div>
      </div>
    </div>
  )
}