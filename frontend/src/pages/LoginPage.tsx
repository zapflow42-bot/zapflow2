import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuthStore } from "../store/authStore"
import { toast } from "sonner"
import { Loader2, Zap, Mail, Lock, Eye, EyeOff } from "lucide-react"

export function LoginPage() {
  const [email,     setEmail]     = useState("")
  const [password,  setPassword]  = useState("")
  const [showPass,  setShowPass]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const navigate = useNavigate()
  const setUser  = useAuthStore(s => s.setUser)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message)
      const m = data.user.user_metadata
      setUser({ uid: data.user.id, email: data.user.email!, displayName: m?.displayName ?? email, role: m?.role, tenantId: m?.tenantId })
      navigate(m?.role === "gestor" ? "/gestor" : "/disparador")
    } catch (err: any) {
      toast.error(err.message ?? "Email ou senha incorretos")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1117] via-[#161b22] to-[#0d1117] flex items-center justify-center p-4">
      {/* Glow effects */}
      <div className="fixed top-0 left-0 w-96 h-96 bg-[#2ea043]/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-[#58a6ff]/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="relative w-full max-w-4xl flex rounded-2xl overflow-hidden shadow-2xl border border-white/[0.07]">
        {/* Left panel */}
        <div className="hidden md:flex w-5/12 bg-gradient-to-br from-[#2ea043] via-[#1a7f37] to-[#0d5523] p-10 flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="absolute rounded-full border border-white/30"
                style={{ width: `${(i+1)*120}px`, height: `${(i+1)*120}px`, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
            ))}
          </div>

          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black text-white tracking-tight">ZapFlow</span>
            </div>
            <p className="text-green-100 text-sm">Marketing Automation</p>
          </div>

          <div className="relative space-y-6">
            {[
              { icon: "📱", text: "WhatsApp, Email, SMS e Telegram" },
              { icon: "🤖", text: "IA para otimizar seus disparos" },
              { icon: "📊", text: "Relatórios detalhados em tempo real" },
              { icon: "🛡️", text: "Anti-ban e aquecimento de chips" },
            ].map(item => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <span className="text-green-50 text-sm">{item.text}</span>
              </div>
            ))}
          </div>

          <p className="relative text-green-200 text-xs">© 2026 ZapFlow. Todos os direitos reservados.</p>
        </div>

        {/* Right panel */}
        <div className="flex-1 bg-[#0d1117] p-8 md:p-12 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-2 mb-8">
            <Zap className="w-6 h-6 text-[#2ea043]" />
            <span className="text-xl font-bold text-white">ZapFlow</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Bem-vindo de volta</h2>
          <p className="text-[#7d8590] text-sm mb-8">Entre com sua conta para continuar</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7d8590]" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="seu@email.com"
                className="w-full bg-[#161b22] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm outline-none focus:border-[#2ea043]/60 focus:ring-1 focus:ring-[#2ea043]/20 transition-all placeholder:text-[#484f58]" />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7d8590]" />
              <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••"
                className="w-full bg-[#161b22] border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white text-sm outline-none focus:border-[#2ea043]/60 focus:ring-1 focus:ring-[#2ea043]/20 transition-all placeholder:text-[#484f58]" />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7d8590] hover:text-white transition-colors">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-[#2ea043] to-[#238636] hover:from-[#238636] hover:to-[#1a6b2a] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#2ea043]/20">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
