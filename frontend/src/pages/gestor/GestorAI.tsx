import { useState } from "react"
import { apiFetch } from "../../lib/api"
import { toast } from "sonner"
import { Bot, Send, Loader2, Sparkles } from "lucide-react"

const SUGGESTIONS = [
  "Qual horário teve mais respostas esta semana?",
  "Quem está em risco de ban? O que fazer?",
  "Me dê 3 ideias de mensagem para vender mais",
  "Como melhorar minha taxa de resposta?",
  "Qual canal está performando melhor?",
]

export function GestorAI() {
  const [prompt,  setPrompt]  = useState("")
  const [answer,  setAnswer]  = useState("")
  const [loading, setLoading] = useState(false)

  async function ask(p = prompt) {
    if (!p.trim()) return
    setPrompt(p)
    setLoading(true)
    try {
      const data = await apiFetch("/api/ai/ask", { method:"POST", body:JSON.stringify({ prompt: p }) })
      setAnswer(data.answer)
    } catch (err: any) {
      if (err.message?.includes("IA")) {
        setAnswer("A IA está sendo configurada. Certifique-se de que o ANTHROPIC_API_KEY está definido no .env do servidor.")
      } else {
        toast.error(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#bc8cff]/15 border border-[#bc8cff]/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-[#bc8cff]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">IA Analista</h1>
          <p className="text-[#7d8590] text-sm">Powered by Claude Sonnet</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[#7d8590] font-mono uppercase tracking-wider">Sugestões</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => ask(s)}
              className="flex items-center gap-1.5 text-xs text-[#7d8590] hover:text-white border border-white/[0.07] hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
              <Sparkles className="w-3 h-3" /> {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-5 space-y-3">
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), ask())}
          placeholder="Pergunte sobre performance, estratégias, análise de campanhas... (Enter para enviar)"
          rows={3}
          className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#bc8cff]/50 resize-none placeholder:text-[#484f58]" />
        <button onClick={() => ask()} disabled={loading || !prompt.trim()}
          className="flex items-center gap-2 bg-[#bc8cff] hover:bg-[#a371f7] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {loading ? "Analisando..." : "Perguntar"}
        </button>
      </div>

      {answer && (
        <div className="bg-[#161b22] border border-[#bc8cff]/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-4 h-4 text-[#bc8cff]" />
            <span className="text-sm font-semibold text-white">Resposta</span>
          </div>
          <p className="text-sm text-[#e6edf3] leading-7 whitespace-pre-wrap">{answer}</p>
        </div>
      )}
    </div>
  )
}
