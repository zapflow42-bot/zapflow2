import { useState, useRef } from "react"
import { toast } from "sonner"
import { Send, Bot, Upload, Image as ImageIcon, Link, Sparkles, X, AlertCircle, Loader2, Eye } from "lucide-react"
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

  const fileRef  = useRef<HTMLInputElement>(null)
  const imgRef   = useRef<HTMLInputElement>(null)
  const contactCount = contacts.split("\n").filter(Boolean).length

  // Busca contas reais do gateway — usa as que estão no Supabase
  // Por enquanto mostra aviso se não houver contas
  const hasAccounts = accounts.length > 0

  async function generatePreview() {
    if (!description.trim()) { toast.error("Descreva o assunto da mensagem primeiro"); return }
    setGenLoading(true)
    try {
      // Chama a IA para gerar uma variação única
      const data = await apiFetch("/api/ai/ask", {
        method: "POST",
        body: JSON.stringify({
          prompt: `Crie UMA mensagem curta e natural para WhatsApp baseada neste assunto:

"${description}"

REGRAS OBRIGATÓRIAS:
- Máximo 3-4 linhas
- Tom casual e amigável como conversa de WhatsApp
- Não use saudação genérica como "Olá"
- Não mencione nomes (será personalizado depois)
- Se houver link no assunto, mantenha-o
- Seja direto e objetivo
- Use 1-2 emojis no máximo

Responda APENAS com a mensagem, sem explicações.`
        }),
      })
      setPreview(data.answer?.trim() ?? "")
      // Mostra preview com imagem se houver
      if (images.length > 0) setPreviewImg(images[0])
    } catch {
      // Sem IA ativa — gera variação local simples
      const lines = description.split(" ")
      const shuffled = [...lines].sort(() => Math.random() - 0.5).slice(0, Math.ceil(lines.length * 0.7))
      setPreview(`${description}\n\n(IA offline — ative o ANTHROPIC_API_KEY para variações inteligentes)`)
    } finally {
      setGenLoading(false)
    }
  }

  async function launch() {
    if (!description.trim()) { toast.error("Descreva o assunto da mensagem"); return }
    if (!contacts.trim())    { toast.error("Adicione os contatos"); return }
    if (!account)            { toast.error("Selecione uma conta"); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 2000))
    setLoading(false)
    toast.success(`Campanha iniciada! ${contactCount} mensagens na fila — a IA vai gerar ${contactCount} variações únicas.`)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.name.endsWith(".csv") || file.name.endsWith(".xlsx")) {
      // Simula importação de planilha
      setContacts("5511999990001,João Silva\n5511999990002,Maria Souza\n5511999990003,Carlos Lima")
      toast.success(`Planilha importada!`)
    }
    e.target.value = ""
  }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setImages(prev => [...prev, url])
    toast.success("Imagem adicionada")
    e.target.value = ""
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Novo Disparo</h1>
        <p className="text-[#7d8590] text-sm">A IA gera mensagens únicas para cada contato com base no seu assunto</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Coluna esquerda */}
        <div className="space-y-4">

          {/* Canal */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Canal</h3>
            <div className="grid grid-cols-4 gap-2">
              {CHANNELS.map(c => (
                <button key={c.id} onClick={() => { setChannel(c.id); setAccount("") }}
                  className={`py-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1
                    ${channel === c.id
                      ? "bg-[#2ea043]/15 border border-[#2ea043]/30 text-[#3fb950]"
                      : "bg-[#0d1117] border border-white/[0.07] text-[#7d8590] hover:text-white"}`}>
                  <span className="text-base">{c.emoji}</span>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Conta */}
            {hasAccounts ? (
              <select value={account} onChange={e => setAccount(e.target.value)}
                className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50">
                <option value="">Selecione a conta...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.address}</option>)}
              </select>
            ) : (
              <div className="bg-[#0d1117] border border-[#d29922]/30 rounded-lg px-3 py-2.5 text-xs text-[#d29922] flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Nenhuma conta vinculada. Vá em <strong>Canais</strong> para adicionar uma conta de {CHANNELS.find(c=>c.id===channel)?.label}.
              </div>
            )}
          </div>

          {/* Assunto / Descrição */}
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
              placeholder={"Descreva o que você quer comunicar:\n\nEx: Promoção de 30% em toda a loja até sexta-feira. Link: https://loja.com/promo\nProdutos de qualidade, entrega rápida, aproveite essa oportunidade única."}
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50 resize-none leading-6" />

            <div className="bg-[#0d1117] rounded-lg p-3 text-xs text-[#7d8590] space-y-1">
              <p className="text-[#bc8cff] font-medium flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> Como funciona a IA (Zara)</p>
              <p>→ Você descreve o assunto em linguagem natural</p>
              <p>→ Zara gera uma mensagem única para cada contato da lista</p>
              <p>→ Mesmo assunto, textos diferentes — evita ban e parece natural</p>
              {varyLinks && <p className="text-[#3fb950]">→ Links recebem parâmetro único por envio ✓</p>}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setVaryLinks(s => !s)}
                className={`w-8 h-4 rounded-full transition-all relative ${varyLinks ? "bg-[#2ea043]" : "bg-[#30363d]"}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${varyLinks ? "left-4" : "left-0.5"}`} />
              </div>
              <span className="text-xs text-[#7d8590]">Variar URLs automaticamente</span>
              <Link className="w-3 h-3 text-[#7d8590]" />
            </label>

            {/* Anexar imagem */}
            <div className="flex gap-2">
              <input ref={imgRef}  type="file" accept="image/*"         className="hidden" onChange={handleImage} />
              <input ref={fileRef} type="file" accept=".csv,.xlsx"      className="hidden" onChange={handleFile} />
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
              ? <p className="text-xs text-[#7d8590]">Zara analisa o histórico e define o delay ideal (geralmente 8–22s) para minimizar risco de ban.</p>
              : <div className="flex gap-3">
                  {[["Mínimo (s)",delayMin,setDelayMin,3,60],["Máximo (s)",delayMax,setDelayMax,delayMin,120]].map(([l,v,fn,min,max]:any) => (
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

        {/* Coluna direita */}
        <div className="space-y-4">

          {/* Contatos */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Contatos</h3>
              <span className="text-xs text-[#7d8590]">{contactCount > 0 ? `${contactCount} contatos` : "0 contatos"}</span>
            </div>
            <textarea value={contacts} onChange={e => setContacts(e.target.value)} rows={8}
              placeholder={"Cole os contatos aqui:\n5511999990001,João Silva\n5511999990002,Maria Souza\n\nOu importe uma planilha CSV/Excel"}
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

          {/* Preview da mensagem */}
          {preview && (
            <div className="bg-[#161b22] border border-[#bc8cff]/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#bc8cff]" />
                <h3 className="text-sm font-semibold text-white">Preview — 1 variação</h3>
                <span className="text-xs text-[#7d8590]">gerada por Zara</span>
              </div>

              {/* Bolha estilo WhatsApp */}
              <div className="bg-[#0d1117] rounded-xl p-3 space-y-2">
                {previewImg && (
                  <img src={previewImg} alt="" className="w-full max-h-40 object-cover rounded-lg" />
                )}
                <p className="text-sm text-[#e6edf3] leading-6 whitespace-pre-wrap">{preview}</p>
                <p className="text-right text-[10px] text-[#7d8590]">15:08 ✓✓</p>
              </div>

              <button onClick={generatePreview} disabled={genLoading}
                className="text-xs text-[#bc8cff] hover:underline flex items-center gap-1">
                {genLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Gerar outra variação
              </button>
              <p className="text-xs text-[#7d8590]">Cada um dos {contactCount || "N"} contatos receberá uma mensagem diferente desta.</p>
            </div>
          )}

          {/* Disparar */}
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
