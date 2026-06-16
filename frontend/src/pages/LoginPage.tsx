import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuthStore } from "../store/authStore"
import { toast } from "sonner"
import { Loader2, Send, Mail, Lock, Eye, EyeOff } from "lucide-react"

// Partícula flutuante
interface Particle {
  id: number
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  opacity: number
  color: string
}

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const colors = ["#2ea043", "#58a6ff", "#bc8cff", "#229ed9", "#3fb950"]
    const particles: Particle[] = Array.from({ length: 55 }, (_, i) => ({
      id: i,
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.5 + 0.1,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))

    let raf: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // linhas de conexão entre partículas próximas
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 90) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(46,160,67,${0.12 * (1 - dist / 90)})`
            ctx.lineWidth = 0.5
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      particles.forEach(p => {
        p.x += p.speedX
        p.y += p.speedY
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color + Math.round(p.opacity * 255).toString(16).padStart(2, "0")
        ctx.fill()
      })

      raf = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
    />
  )
}

export function LoginPage() {
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [mounted,  setMounted]  = useState(false)
  const navigate = useNavigate()
  const setUser  = useAuthStore(s => s.setUser)

  useEffect(() => {
    // pequeno delay para a animação de entrada
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [])

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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "#0a0e15" }}>

      {/* Canvas de partículas cobrindo o fundo inteiro */}
      <ParticleCanvas />

      {/* Gradientes radiais de atmosfera */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute" style={{
          top: "-10%", left: "-5%",
          width: "55%", height: "55%",
          background: "radial-gradient(ellipse, rgba(46,160,67,0.12) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        <div className="absolute" style={{
          bottom: "-10%", right: "-5%",
          width: "55%", height: "55%",
          background: "radial-gradient(ellipse, rgba(88,166,255,0.10) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        <div className="absolute" style={{
          top: "40%", right: "20%",
          width: "30%", height: "30%",
          background: "radial-gradient(ellipse, rgba(188,140,255,0.07) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
      </div>

      {/* Card principal — animação de entrada */}
      <div
        className="relative w-full max-w-4xl flex rounded-2xl overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(46,160,67,0.08)",
          transform: mounted ? "translateY(0) scale(1)" : "translateY(24px) scale(0.98)",
          opacity: mounted ? 1 : 0,
          transition: "transform 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.45s ease",
        }}
      >
        {/* Painel esquerdo verde */}
        <div className="hidden md:flex w-5/12 flex-col justify-between relative overflow-hidden p-10"
          style={{ background: "linear-gradient(145deg, #1a5c2a, #0d3d1a)" }}>

          {/* Círculos decorativos */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[180, 290, 400, 510, 620].map((size, i) => (
              <div key={i} className="absolute rounded-full"
                style={{
                  width: size, height: size,
                  top: "50%", left: "50%",
                  transform: "translate(-50%, -50%)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }} />
            ))}
            {/* brilho sutil no topo */}
            <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full"
              style={{ background: "radial-gradient(ellipse, rgba(63,185,80,0.2) 0%, transparent 70%)" }} />
          </div>

          {/* Logo */}
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)" }}>
                <Send className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-xl font-bold text-white tracking-tight">NexDisparo</span>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>Marketing Automation</div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="relative space-y-5">
            {[
              { icon: "💬", text: "WhatsApp, Email, SMS e Telegram" },
              { icon: "🤖", text: "IA para otimizar seus disparos" },
              { icon: "📊", text: "Relatórios detalhados em tempo real" },
              { icon: "🛡️", text: "Anti-ban e aquecimento de chips" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3"
                style={{
                  transform: mounted ? "translateX(0)" : "translateX(-12px)",
                  opacity: mounted ? 1 : 0,
                  transition: `transform 0.5s cubic-bezier(0.22,1,0.36,1) ${0.1 + i * 0.07}s, opacity 0.5s ease ${0.1 + i * 0.07}s`,
                }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.1)" }}>
                  <span className="text-base">{item.icon}</span>
                </div>
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{item.text}</span>
              </div>
            ))}
          </div>

          <p className="relative text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            © 2026 NexDisparo. Todos os direitos reservados.
          </p>
        </div>

        {/* Painel direito — formulário */}
        <div className="flex-1 flex flex-col justify-center p-8 md:p-12 relative"
          style={{ background: "#0d1117" }}>

          {/* Brilho interno sutil */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 80% 20%, rgba(88,166,255,0.04) 0%, transparent 60%)",
            }} />

          {/* Logo mobile */}
          <div className="md:hidden flex items-center gap-2 mb-8 relative">
            <Send className="w-5 h-5 text-[#2ea043]" />
            <span className="text-lg font-bold text-white">NexDisparo</span>
          </div>

          <div className="relative"
            style={{
              transform: mounted ? "translateY(0)" : "translateY(10px)",
              opacity: mounted ? 1 : 0,
              transition: "transform 0.5s cubic-bezier(0.22,1,0.36,1) 0.15s, opacity 0.5s ease 0.15s",
            }}>
            <h2 className="text-2xl font-bold text-white mb-1">Bem-vindo de volta</h2>
            <p className="text-sm mb-8" style={{ color: "#7d8590" }}>Entre com sua conta para continuar</p>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email */}
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors"
                  style={{ color: "#7d8590" }} />
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-3 text-sm text-white rounded-xl outline-none transition-all"
                  style={{
                    background: "#161b22",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  onFocus={e => {
                    e.currentTarget.style.border = "1px solid rgba(46,160,67,0.5)"
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(46,160,67,0.08)"
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.08)"
                    e.currentTarget.style.boxShadow = "none"
                  }}
                />
              </div>

              {/* Senha */}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#7d8590" }} />
                <input
                  type={showPass ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 text-sm text-white rounded-xl outline-none transition-all"
                  style={{
                    background: "#161b22",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  onFocus={e => {
                    e.currentTarget.style.border = "1px solid rgba(46,160,67,0.5)"
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(46,160,67,0.08)"
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.08)"
                    e.currentTarget.style.boxShadow = "none"
                  }}
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                  style={{ color: "#7d8590" }}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Botão entrar */}
              <button
                type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #2ea043, #1a7f37)",
                  boxShadow: "0 4px 20px rgba(46,160,67,0.25)",
                }}
                onMouseEnter={e => !loading && ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(46,160,67,0.4)")}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(46,160,67,0.25)")}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
                  : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
