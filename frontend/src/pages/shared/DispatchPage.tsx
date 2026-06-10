import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { Send, Upload, Image as ImageIcon, Link, X, AlertCircle, RefreshCw } from "lucide-react"
import { apiFetch } from "../../lib/api"
import * as XLSX from "xlsx"

type ChannelType = "whatsapp" | "email" | "telegram" | "sms"

const CHANNELS: { id: ChannelType; emoji: string; label: string }[] = [
  { id: "whatsapp", emoji: "📱", label: "WhatsApp" },
  { id: "email",    emoji: "📧", label: "Email"    },
  { id: "telegram", emoji: "✈️", label: "Telegram" },
  { id: "sms",      emoji: "💬", label: "SMS"      },
]

interface ImageAttachment {
  objectUrl: string
  base64: string
  mime: string
  name: string
}

export function DispatchPage() {
  const [channel,     setChannel]     = useState<ChannelType>("whatsapp")
  const [accounts,    setAccounts]    = useState<{ id: string; name: string; address: string }[]>([])
  const [account,     setAccount]     = useState("")
  const [description, setDescription] = useState("")
  const [subject,     setSubject]     = useState("")
  const [contacts,    setContacts]    = useState("")
  const [delayMin,    setDelayMin]    = useState(8)
  const [delayMax,    setDelayMax]    = useState(22)
  const [images,      setImages]      = useState<ImageAttachment[]>([])
  const [loading,     setLoading]     = useState(false)
  const [varyLinks,   setVaryLinks]   = useState(true)

  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef  = useRef<HTMLInputElement>(null)

  const contactCount = contacts.split("\n").filter(Boolean).length
  const hasAccounts  = accounts.length > 0

  // ── Carrega chips disponíveis para o canal selecionado ──────────────────
  async function loadAccounts() {
    if (channel === "whatsapp") {
      apiFetch("/api/whatsapp/sessions")
        .then(data => {
          const sessions: string[] = data.sessions ?? []
          setAccounts(sessions.map((s, i) => ({
            id:      s,
            name:    `Chip ${i + 1}`,
            address: s.split("-").slice(-1)[0] || s,
          })))
        })
        .catch(() => setAccounts([]))
    } else if (channel === "telegram") {
      apiFetch("/api/telegram/sessions")
        .then(data => {
          const sessions: string[] = data.sessions ?? []
          setAccounts(sessions.map((s, i) => ({
            id:      s,
            name:    `Chip TG ${i + 1}`,
            address: s.split("-").slice(-1)[0] || s,
          })))
        })
        .catch(() => setAccounts([]))
    } else {
      setAccounts([])
    }
  }

  useEffect(() => { setAccount(""); loadAccounts() }, [channel])

  // ── Disparar ────────────────────────────────────────────────────────────
  async function launch() {
    if (!description.trim() && images.length === 0) { toast.error("Digite a mensagem ou adicione uma imagem"); return }
    if (!contacts.trim())    { toast.error("Adicione os contatos"); return }
    if (!account)            { toast.error("Selecione um chip");    return }

    setLoading(true)
    try {
      const lines  = contacts.split("\n").filter(Boolean)
      const parsed = lines
        .map((line, i) => {
          const parts = line.split(",")
          const phone = parts[0].trim().replace(/\D/g, "")
          const name  = parts[1]?.trim() || `Contato ${i + 1}`
          return { phone, name }
        })
        .filter(c => c.phone.length >= 8)

      if (parsed.length === 0) { toast.error("Nenhum número válido encontrado"); return }

      let freshSenderId = account
      if (channel === "whatsapp") {
        try {
          const freshData   = await apiFetch("/api/whatsapp/sessions")
          const freshSessions: string[] = freshData.sessions ?? []
          const ownerPrefix = account.split("-").slice(0, 5).join("-")
          freshSenderId     = freshSessions.find(s => s.startsWith(ownerPrefix)) ?? account
        } catch {}
      } else if (channel === "telegram") {
        try {
          const freshData   = await apiFetch("/api/telegram/sessions")
          const freshSessions: string[] = freshData.sessions ?? []
          const ownerPrefix = account.split("-").slice(0, 5).join("-")
          freshSenderId     = freshSessions.find(s => s.startsWith(ownerPrefix)) ?? account
        } catch {}
      }

      const campaignId = `camp-${Date.now()}`
      const safeMin    = Math.max(3, delayMin)
      const safeMax    = Math.max(safeMin + 1, delayMax)
      const delayMs    = (Math.floor(Math.random() * (safeMax - safeMin)) + safeMin) * 1000

      // Pega a primeira imagem se houver
      const img = images[0] ?? null

      const messages = parsed.map((contact, i) => ({
        jobId:       `${campaignId}-${i}`,
        to:          contact.phone,
        contactName: contact.name,
        message:     description.replace(/\[\[nome\]\]/gi, contact.name),
        senderId:    freshSenderId,
        delay:       i * delayMs,
        ...(img ? { imageBase64: img.base64, imageMime: img.mime } : {}),
      }))

      if (channel === "whatsapp") {
        await apiFetch("/api/whatsapp/enqueue", {
          method: "POST",
          body: JSON.stringify({ campaignId, messages }),
        })
      } else if (channel === "telegram") {
        await apiFetch("/api/telegram/enqueue", {
          method: "POST",
          body: JSON.stringify({ campaignId, messages }),
        })
      } else {
        toast.error(`Canal ${channel} ainda não implementado`)
        return
      }

      toast.success(`✅ ${parsed.length} mensagens ${channel === "telegram" ? "Telegram" : "WhatsApp"} adicionadas à fila`)
      setContacts("")
      setDescription("")
      setImages([])
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao disparar")
    } finally {
      setLoading(false)
    }
  }

  // ── Importar planilha CSV/XLSX ───────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    try {
      if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
        const text  = await file.text()
        const lines = text
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean)
          // Remove cabeçalho se a primeira linha não começa com número
          .filter((l, i) => i > 0 ? true : /^\d/.test(l))
        setContacts(lines.join("\n"))
        toast.success(`✅ ${lines.length} contatos importados`)
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const buf  = await file.arrayBuffer()
        const wb   = XLSX.read(buf)
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 }) as any[][]
        // Detecta se primeira linha é cabeçalho (não começa com número)
        const start = rows.length > 1 && !/^\d/.test(String(rows[0]?.[0] ?? "")) ? 1 : 0
        const lines = rows
          .slice(start)
          .filter(r => r.length > 0 && r[0])
          .map(r => r.map((c: any) => String(c ?? "").trim()).join(","))
        setContacts(lines.join("\n"))
        toast.success(`✅ ${lines.length} contatos importados`)
      } else {
        toast.error("Formato não suportado — use CSV ou XLSX")
      }
    } catch {
      toast.error("Erro ao ler o arquivo")
    }
  }

  // ── Adicionar imagem (converte para base64) ──────────────────────────────
  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    if (images.length >= 1) {
      toast.error("Apenas uma imagem por disparo")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result = "data:image/jpeg;base64,AAA..."
      const [header, base64] = result.split(",")
      const mime = header.replace("data:", "").replace(";base64", "")
      setImages([{ objectUrl: URL.createObjectURL(file), base64, mime, name: file.name }])
      toast.success("Imagem adicionada")
    }
    reader.readAsDataURL(file)
  }

  const noAccountMsg = channel === "telegram"
    ? <>Nenhum chip Telegram. Vá em <strong>Canais</strong> e vincule um número Telegram.</>
    : <>Nenhuma conta vinculada. Vá em <strong>Canais</strong> para adicionar.</>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Novo Disparo</h1>
        <p className="text-[#7d8590] text-sm">Crie campanhas com delay controlado por canal</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Coluna esquerda */}
        <div className="space-y-4">
          {/* Canal + Chip */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Canal</h3>
            <div className="grid grid-cols-4 gap-2">
              {CHANNELS.map(c => (
                <button key={c.id} onClick={() => setChannel(c.id)}
                  className={`py-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1 ${
                    channel === c.id
                      ? "bg-[#2ea043]/15 border border-[#2ea043]/30 text-[#3fb950]"
                      : "bg-[#0d1117] border border-white/[0.07] text-[#7d8590] hover:text-white"
                  }`}>
                  <span className="text-base">{c.emoji}</span>
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {hasAccounts ? (
                <select value={account} onChange={e => setAccount(e.target.value)}
                  className="flex-1 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50">
                  <option value="">Selecione o chip...</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} — {a.address}</option>
                  ))}
                </select>
              ) : (
                <div className="flex-1 bg-[#0d1117] border border-[#d29922]/30 rounded-lg px-3 py-2.5 text-xs text-[#d29922] flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {noAccountMsg}
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
            <h3 className="text-sm font-semibold text-white">Mensagem</h3>
            {channel === "email" && (
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Assunto do email..."
                className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#2ea043]/50" />
            )}
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={6}
              placeholder={`Digite a mensagem:\n\nEx: Promoção de 30% até sexta. Link: https://loja.com/promo\n\nUse [[nome]] para personalizar.\n(Pode deixar em branco se enviar só imagem)`}
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50 resize-none leading-6" />
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setVaryLinks(s => !s)}
                className={`w-8 h-4 rounded-full transition-all relative ${varyLinks ? "bg-[#2ea043]" : "bg-[#30363d]"}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${varyLinks ? "left-4" : "left-0.5"}`} />
              </div>
              <span className="text-xs text-[#7d8590]">Variar URLs automaticamente</span>
              <Link className="w-3 h-3 text-[#7d8590]" />
            </label>
            <div className="flex gap-2">
              <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleImage} />
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={handleFile} />
              <button onClick={() => imgRef.current?.click()}
                disabled={images.length >= 1}
                className="flex items-center gap-1.5 text-xs text-[#7d8590] border border-white/10 hover:text-white hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <ImageIcon className="w-3.5 h-3.5" /> Imagem
              </button>
            </div>
            {images.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img.objectUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                    <button onClick={() => setImages(p => p.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-[#f85149] rounded-full flex items-center justify-center">
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                    <div className="text-[9px] text-[#7d8590] text-center mt-0.5 max-w-[64px] truncate">{img.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delay */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Delay entre envios</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-[#7d8590] mb-1 block">Mínimo (s)</label>
                <input type="number" value={delayMin} onChange={e => setDelayMin(+e.target.value)}
                  min={3} max={60}
                  className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-[#7d8590] mb-1 block">Máximo (s)</label>
                <input type="number" value={delayMax} onChange={e => setDelayMax(+e.target.value)}
                  min={delayMin} max={120}
                  className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none" />
              </div>
            </div>
            <p className="text-xs text-[#7d8590]">
              Envio distribuído com intervalo aleatório entre {delayMin}s e {delayMax}s.
            </p>
          </div>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Contatos</h3>
              <span className="text-xs text-[#7d8590]">
                {contactCount > 0 ? `${contactCount} contatos` : "0 contatos"}
              </span>
            </div>
            <textarea value={contacts} onChange={e => setContacts(e.target.value)}
              rows={8}
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

          <button onClick={launch} disabled={loading}
            className={`w-full flex items-center justify-center gap-2 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg ${
              channel === "telegram"
                ? "bg-gradient-to-r from-[#229ed9] to-[#1a7ab0] hover:from-[#1a7ab0] hover:to-[#145f8a] shadow-[#229ed9]/20"
                : "bg-gradient-to-r from-[#2ea043] to-[#238636] hover:from-[#238636] hover:to-[#1a6b2a] shadow-[#2ea043]/20"
            }`}>
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando...</>
              : <><Send className="w-4 h-4" /> Disparar {channel === "telegram" ? "via Telegram" : "Campanha"}</>}
          </button>

          <div className="bg-[#0d1117] border border-white/[0.07] rounded-xl p-3 text-xs text-[#7d8590] space-y-1">
            {channel === "telegram" ? (
              <>
                <div className="flex items-center gap-1.5 text-[#229ed9] mb-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Telegram MTProto
                </div>
                <p>• Envia por número de telefone igual ao WhatsApp</p>
                <p>• Usa sua conta real — não é bot</p>
                <p>• Sem limite diário artificial</p>
                <p>• Suporte a imagem + legenda</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-[#d29922] mb-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Limites de segurança
                </div>
                <p>• Envio com fila controlada</p>
                <p>• Delay configurável entre mensagens</p>
                <p>• Suporte a imagem + legenda</p>
                <p>• WhatsApp processa com concorrência segura no servidor</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
