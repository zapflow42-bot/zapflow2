import { useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "../../lib/api"
import { useAuthStore } from "../../store/authStore"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts"
import {
  Users, Send, TrendingUp, AlertTriangle,
  CheckCircle, Activity, RefreshCw,
} from "lucide-react"

// ─── tipos ───────────────────────────────────────────────────────────────────
type Channel = "all" | "whatsapp" | "telegram" | "email" | "sms"

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "#25d366",
  email:    "#58a6ff",
  telegram: "#229ed9",
  sms:      "#d29922",
}

const CHANNEL_LABELS: Record<Channel, string> = {
  all:      "Todos",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email:    "Email",
  sms:      "SMS",
}

// ─── contador animado ─────────────────────────────────────────────────────────
function AnimatedNumber({ value, color }: { value: string | number; color: string }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    setDisplay(value)
  }, [value])

  return <span style={{ color }} className="text-2xl font-bold transition-all">{display}</span>
}

// ─── card de estatística ──────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color, trend, pulse,
}: {
  label: string; value: string | number; sub?: string
  icon: any; color: string; trend?: number; pulse?: boolean
}) {
  return (
    <div className="rounded-xl p-5 transition-all hover:scale-[1.01]"
      style={{
        background: "#161b22",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: pulse ? `0 0 0 1px ${color}33, 0 4px 20px ${color}18` : undefined,
        transition: "box-shadow 0.3s ease, transform 0.2s ease",
      }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-mono uppercase tracking-wider" style={{ color: "#7d8590" }}>
          {label}
        </span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center relative"
          style={{ background: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
          {pulse && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse"
              style={{ background: color }} />
          )}
        </div>
      </div>
      <AnimatedNumber value={value} color={color} />
      {sub && <div className="text-xs mt-1" style={{ color: "#7d8590" }}>{sub}</div>}
      {trend !== undefined && (
        <div className="text-xs mt-1" style={{ color: trend > 0 ? "#3fb950" : "#f85149" }}>
          {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}% vs semana passada
        </div>
      )}
    </div>
  )
}

// ─── componente principal ─────────────────────────────────────────────────────
export function GestorDashboard() {
  const { user } = useAuthStore()
  const [channel, setChannel] = useState<Channel>("all")
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // usuários da equipe (real)
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch("/api/users"),
  })
  const users       = usersData?.users ?? []
  const dispatchers = users.filter((u: any) => u.role === "disparador")

  // status da fila — polling a cada 5s
  const { data: queueData } = useQuery({
    queryKey: ["queue-status"],
    queryFn:  () => apiFetch("/api/queue/status").catch(() => null),
    refetchInterval: 5000,
  })
  const queue = queueData ?? { queued: 0, processing: 0, sent: 0, failed: 0 }

  // relatório do dia (dados reais de disparo por canal)
  const { data: reportData, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard-report"],
    queryFn:  () =>
      apiFetch("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ scope: "team", period: "week" }),
      }).catch(() => null),
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (dataUpdatedAt) setLastUpdated(new Date(dataUpdatedAt))
  }, [dataUpdatedAt])

  // ── dados do gráfico de área (filtrados por canal) ──
  const areaData: { day: string; sent: number; failed: number }[] =
    (() => {
      if (!reportData?.report) return []
      // se backend retornar daily em byChannel futuramente, usar aqui
      // por ora retorna vazio (sem dados reais ainda)
      return []
    })()

  // ── dados do pie por canal (filtrados) ──
  const byChannel = reportData?.report?.byChannel ?? {}
  const pieData = Object.entries(byChannel)
    .filter(([ch]) => channel === "all" || ch === channel)
    .map(([ch, v]: [string, any]) => ({
      name:  CHANNEL_LABELS[ch as Channel] ?? ch,
      value: v.sent ?? 0,
      color: CHANNEL_COLORS[ch] ?? "#888",
    }))
    .filter(d => d.value > 0)

  // taxa de entrega filtrada
  const deliveryRate = (() => {
    if (channel === "all") return reportData?.report?.deliveryRate
    const ch = byChannel[channel] as any
    return ch?.deliveryRate
  })()

  const secsAgo = Math.round((Date.now() - lastUpdated.getTime()) / 1000)

  return (
    <div className="p-6 space-y-6">

      {/* ── cabeçalho ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Dashboard</h1>
          <p className="text-sm" style={{ color: "#7d8590" }}>Bem-vindo, {user?.displayName}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* indicador ao vivo */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: "#161b22", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
            <span style={{ color: "#3fb950" }}>Ao vivo</span>
            <span style={{ color: "#484f58" }} className="ml-1">
              · atualizado há {secsAgo}s
            </span>
          </div>
          <Activity className="w-3.5 h-3.5" style={{ color: "#7d8590" }} />
        </div>
      </div>

      {/* ── filtros de canal ── */}
      <div className="flex items-center gap-2">
        {(["all", "whatsapp", "telegram", "email", "sms"] as Channel[]).map(ch => {
          const active = channel === ch
          const color  = ch === "all" ? "#3fb950" : CHANNEL_COLORS[ch]
          return (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: active ? `${color}18` : "#161b22",
                border:     active ? `1px solid ${color}55` : "1px solid rgba(255,255,255,0.07)",
                color:      active ? color : "#7d8590",
              }}
            >
              {ch !== "all" && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              )}
              {CHANNEL_LABELS[ch]}
            </button>
          )
        })}
      </div>

      {/* ── cards de stats ── */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Disparadores"
          value={dispatchers.length}
          sub="cadastrados"
          icon={Users}
          color="#58a6ff"
        />
        <StatCard
          label="Na fila"
          value={(queue.queued + queue.processing).toLocaleString("pt-BR")}
          sub={queue.processing > 0 ? `${queue.processing} enviando agora` : "aguardando disparo"}
          icon={RefreshCw}
          color="#d29922"
          pulse={queue.processing > 0}
        />
        <StatCard
          label="Enviados (período)"
          value={(reportData?.report?.totalSent ?? 0).toLocaleString("pt-BR")}
          sub={channel !== "all" ? `filtro: ${CHANNEL_LABELS[channel]}` : "todos os canais"}
          icon={Send}
          color="#3fb950"
        />
        <StatCard
          label="Taxa de entrega"
          value={deliveryRate != null ? `${deliveryRate.toFixed(1)}%` : "—"}
          sub="média do período"
          icon={TrendingUp}
          color="#bc8cff"
        />
      </div>

      {/* ── gráficos ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* área */}
        <div className="col-span-2 rounded-xl p-5"
          style={{ background: "#161b22", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              Disparos do período
              {channel !== "all" && (
                <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full"
                  style={{
                    background: `${CHANNEL_COLORS[channel]}18`,
                    color: CHANNEL_COLORS[channel],
                  }}>
                  {CHANNEL_LABELS[channel]}
                </span>
              )}
            </h3>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1.5" style={{ color: "#7d8590" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: "#2ea043" }} />Enviados
              </span>
              <span className="flex items-center gap-1.5" style={{ color: "#7d8590" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: "#f85149" }} />Falhas
              </span>
            </div>
          </div>

          {areaData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2ea043" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2ea043" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f85149" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f85149" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="day" stroke="#7d8590" tick={{ fontSize: 11 }} />
                <YAxis stroke="#7d8590" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", color: "#e6edf3" }} />
                <Area type="monotone" dataKey="sent"   stroke="#2ea043" fill="url(#gSent)"   strokeWidth={2} />
                <Area type="monotone" dataKey="failed" stroke="#f85149" fill="url(#gFailed)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-44 gap-2"
              style={{ color: "#484f58" }}>
              <Send className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhum disparo registrado ainda</p>
              <p className="text-xs opacity-70">Os dados aparecerão aqui após o primeiro disparo</p>
            </div>
          )}
        </div>

        {/* pie por canal */}
        <div className="rounded-xl p-5"
          style={{ background: "#161b22", border: "1px solid rgba(255,255,255,0.07)" }}>
          <h3 className="text-sm font-semibold text-white mb-4">Por canal</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} dataKey="value" strokeWidth={0}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: "8px", color: "#e6edf3" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map(m => (
                  <div key={m.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                      <span style={{ color: "#7d8590" }}>{m.name}</span>
                    </div>
                    <span className="font-mono text-white">{m.value.toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-44 gap-2"
              style={{ color: "#484f58" }}>
              <p className="text-sm text-center">Sem dados{channel !== "all" ? ` para ${CHANNEL_LABELS[channel]}` : ""}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── tabela da equipe ── */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: "#161b22", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <h3 className="text-sm font-semibold text-white">Equipe</h3>
          <span className="text-xs" style={{ color: "#7d8590" }}>{dispatchers.length} disparadores</span>
        </div>
        <div>
          {dispatchers.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "#7d8590" }}>
              Nenhum disparador. Vá em Equipe para adicionar.
            </div>
          ) : dispatchers.map((u: any) => (
            <div key={u.id} className="px-5 py-3 flex items-center gap-3 transition-colors hover:bg-white/[0.02]"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #58a6ff, #1f6feb)" }}>
                {u.display_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white">{u.display_name}</div>
                <div className="text-xs" style={{ color: "#7d8590" }}>{u.email}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" style={{ color: u.active ? "#3fb950" : "#f85149" }} />
                <span className="text-xs" style={{ color: u.active ? "#3fb950" : "#f85149" }}>
                  {u.active ? "ativo" : "inativo"}
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono text-white">—</div>
                <div className="text-[10px]" style={{ color: "#7d8590" }}>hoje</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
